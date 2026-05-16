import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { validateInput, z } from "../_shared/validate.ts";

const EleicaoSendCredentialsSchema = z.object({
  pessoa_id: z.string().uuid(),
  channel: z.enum(["whatsapp", "link_only"]).optional(),
  app_url: z.string().url().max(500).optional(),
  email: z.string().email().max(255).optional(),
  password: z.string().min(6).max(200).optional(),
}).passthrough();

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function genPassword(len = 10) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) s += chars[arr[i] % chars.length];
  return s;
}

function normalizePhone(p: string) {
  const digits = (p || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const TRANSIENT_BRIDGE_STATUSES = new Set([502, 503, 504]);
const BRIDGE_TIMEOUT_MS = 15000;
const PREFLIGHT_CACHE_TTL_MS = 30000;
// Cache em memória por isolate (Deno). Evita revalidar a mesma instância em rajadas.
const preflightCache = new Map<string, { ts: number; status: string; reconnected: boolean; detail: string }>();

function isConnectedStatus(status: unknown) {
  const s = String(status || "").toLowerCase();
  return s === "connected" || s === "open";
}

function isExplicitOfflineStatus(status: unknown) {
  const s = String(status || "").toLowerCase();
  return ["disconnected", "offline", "closed", "logged_out", "logout", "banned"].includes(s);
}

function bridgeStatus(data: any) {
  return String(data?.status || data?.instance?.status || "").toLowerCase();
}

async function bridgeAction(bridgeUrl: string, bridgeKey: string, body: Record<string, unknown>, retries = 0) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), BRIDGE_TIMEOUT_MS);
    try {
      const res = await fetch(bridgeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Api-Key": bridgeKey },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      const data = await res.json().catch(async () => ({ error: await res.text().catch(() => "Resposta inválida da ponte") }));
      if (TRANSIENT_BRIDGE_STATUSES.has(res.status) && attempt < retries) {
        clearTimeout(tid);
        await sleep(1000 * (attempt + 1));
        continue;
      }
      clearTimeout(tid);
      return { res, data };
    } catch (err) {
      clearTimeout(tid);
      const aborted = (err as Error)?.name === "AbortError";
      if (attempt < retries) { await sleep(1000 * (attempt + 1)); continue; }
      // Sintetiza um Response-like de falha para o caller tratar uniformemente.
      const fakeRes = new Response(null, { status: aborted ? 504 : 502 });
      return { res: fakeRes, data: { error: aborted ? `Timeout após ${BRIDGE_TIMEOUT_MS}ms na ponte WhatsApp` : `Falha de rede: ${(err as Error).message}` } };
    }
  }
  throw new Error("Falha inesperada ao comunicar com a ponte WhatsApp");
}

async function bridgeSend(bridgeUrl: string, bridgeKey: string, phone: string, message: string) {
  return await bridgeAction(bridgeUrl, bridgeKey, { action: "send", phone, message }, 2);
}

function sendFailure(res: Response, data: any) {
  if (!res.ok) return data?.error || `Erro na ponte WhatsApp (status ${res.status})`;
  if (data?.success === false) return data?.error || "Ponte recusou o envio";
  if (data?.delivered === false) return data?.error || "Mensagem não entregue pelo WhatsApp";
  const confirmed = data?.delivered === true || Boolean(data?.messageId || data?.message_id || data?.id || data?.key?.id);
  return confirmed ? null : (data?.error || "Ponte não confirmou o envio da mensagem");
}

function isInstanceDisconnectedFailure(res: Response, data: any, failure: string) {
  if (res.status === 401) return true;
  const msg = String(data?.error || data?.message || failure || "").toLowerCase();
  return msg.includes("instance") && (msg.includes("disconnect") || msg.includes("not connected") || msg.includes("offline"));
}

async function updateInstanceStatus(admin: any, inst: any, status: "connected" | "connecting" | "disconnected") {
  if (!inst?.id) return;
  const updates: any = { status, last_health_check_at: new Date().toISOString() };
  if (status === "connected") {
    updates.connected_since = inst.connected_since || new Date().toISOString();
  }
  if (status === "disconnected") {
    updates.connected_since = null;
    updates.last_disconnected_at = new Date().toISOString();
  }
  await admin.from("whatsapp_instances").update(updates).eq("id", inst.id);
}

async function tryReconnectInstance(admin: any, inst: any) {
  if (!inst?.bridge_url || !inst?.bridge_api_key) return { status: "disconnected", reconnected: false, detail: "sem credenciais" };
  const { res, data } = await bridgeAction(inst.bridge_url, inst.bridge_api_key, { action: "reconnect" }, 1);
  const raw = bridgeStatus(data);
  const status = isConnectedStatus(raw) ? "connected" : isExplicitOfflineStatus(raw) || res.status === 401 ? "disconnected" : "connecting";
  await updateInstanceStatus(admin, inst, status as any);
  return { status, reconnected: status === "connected", detail: raw || data?.error || data?.message || "sem status" };
}

async function preflightInstance(admin: any, inst: any) {
  if (!inst?.bridge_url || !inst?.bridge_api_key) return { status: "disconnected", reconnected: false, detail: "sem credenciais" };
  // Cache: se a instância foi validada como connected há menos de 30s, reusa.
  const cached = preflightCache.get(inst.id);
  if (cached && Date.now() - cached.ts < PREFLIGHT_CACHE_TTL_MS && cached.status === "connected") {
    return { status: cached.status, reconnected: false, detail: cached.detail + " (cached)" };
  }
  try {
    const { res, data } = await bridgeAction(inst.bridge_url, inst.bridge_api_key, { action: "instance_status" }, 1);
    const raw = bridgeStatus(data);
    if (isConnectedStatus(raw)) {
      await updateInstanceStatus(admin, inst, "connected");
      const result = { status: "connected", reconnected: false, detail: raw };
      preflightCache.set(inst.id, { ts: Date.now(), ...result });
      return result;
    }
    if (isExplicitOfflineStatus(raw) || res.status === 401) {
      await updateInstanceStatus(admin, inst, "disconnected");
    }
  } catch (err) {
    console.warn("[eleicao-send-credentials] preflight status falhou:", (err as Error).message);
  }
  preflightCache.delete(inst.id);
  const reconnect = await tryReconnectInstance(admin, inst);
  if (reconnect.status === "connected") {
    preflightCache.set(inst.id, { ts: Date.now(), status: "connected", reconnected: true, detail: reconnect.detail });
  }
  return reconnect;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const { pessoa_id, channel, app_url, email, password: providedPassword } = await req.json(); // channel: "whatsapp" | "link_only"
    const emailInput = typeof email === "string" ? email.trim().toLowerCase() : "";
    const passwordInput = typeof providedPassword === "string" ? providedPassword : "";
    if (emailInput && !validEmail(emailInput)) {
      return new Response(JSON.stringify({ error: "E-mail inválido" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }
    if (passwordInput && passwordInput.length < 6) {
      return new Response(JSON.stringify({ error: "Senha deve ter no mínimo 6 caracteres" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } }
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Não autenticado" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });

    const { data: pessoa } = await admin.from("eleicao_pessoas")
      .select("id, client_id, nome, telefone, email, user_id, tipo")
      .eq("id", pessoa_id).maybeSingle();
    if (!pessoa) return new Response(JSON.stringify({ error: "Pessoa não encontrada" }), { status: 404, headers: { ...cors, "Content-Type": "application/json" } });

    const { data: isSuper } = await userClient.rpc("is_super_admin");
    let canAccess = !!isSuper;
    if (!canAccess) {
      const { data: ca } = await userClient.rpc("user_can_access_client", { _client_id: pessoa.client_id });
      canAccess = !!ca;
    }
    if (!canAccess) return new Response(JSON.stringify({ error: "Sem permissão" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });

    // Gera senha temporária e cria/atualiza conta
    const password = passwordInput || genPassword(10);
    const emailNorm = (emailInput || pessoa.email || `coord-${pessoa.id.slice(0,8)}@portal.local`).toLowerCase();

    let userId = pessoa.user_id as string | null;
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const foundByEmail = list?.users?.find((u: any) => (u.email || "").toLowerCase() === emailNorm) || null;

    // Se o e-mail informado já existir em outra conta, vincula o coordenador a essa conta.
    // Isso evita o erro atual: a pessoa fica com email correto, mas user_id preso em coord-xxxx@portal.local.
    if (foundByEmail?.id) userId = foundByEmail.id;

    if (userId) {
      const { error: uErr } = await admin.auth.admin.updateUserById(userId, {
        email: emailNorm,
        password,
        email_confirm: true,
        user_metadata: { full_name: pessoa.nome, role: "coordenador" },
      });
      if (uErr) throw uErr;
    } else {
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email: emailNorm, password, email_confirm: true,
        user_metadata: { full_name: pessoa.nome, role: "coordenador" },
      });
      if (cErr) throw cErr;
      userId = created.user!.id;
    }
    await admin.from("eleicao_pessoas").update({ email: emailNorm, user_id: userId }).eq("id", pessoa_id);

    const baseUrl = (app_url || req.headers.get("origin") || Deno.env.get("PUBLIC_APP_URL") || "").replace(/\/$/, "");
    const portalUrl = `${baseUrl}/portal/${pessoa.client_id}`;
    const message =
      `🗳️ *Acesso ao Portal da Campanha*\n\n` +
      `Olá ${pessoa.nome}! Seu acesso de coordenador foi liberado.\n\n` +
      `🔗 Link: ${portalUrl}\n` +
      `👤 E-mail: ${emailNorm}\n` +
      `🔑 Senha: ${password}\n\n` +
      `_Guarde esta mensagem. Você poderá cadastrar seus líderes e cabos eleitorais por lá._`;

    if (channel === "link_only") {
      return new Response(JSON.stringify({ success: true, portal_url: portalUrl, email: emailNorm, password, message }),
        { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // Envia via bridge WhatsApp do client
    const phone = normalizePhone(pessoa.telefone);
    if (!phone) throw new Error("Telefone inválido");

    // Usa a mesma seleção do sistema de disparos: instância conectada saudável, depois pool ativo, depois legado.
    let bridgeUrl: string | null = null;
    let bridgeKey: string | null = null;
    let instanceId: string | null = null;
    let selectedInstance: any = null;

    const { data: pickedId } = await admin.rpc("pick_healthy_whatsapp_instance", { p_client_id: pessoa.client_id });
    if (pickedId) {
      const { data: inst } = await admin.from("whatsapp_instances")
        .select("id, bridge_url, bridge_api_key, status, connected_since")
        .eq("id", pickedId).maybeSingle();
      if (inst?.bridge_url && inst?.bridge_api_key) {
        bridgeUrl = inst.bridge_url;
        bridgeKey = inst.bridge_api_key;
        instanceId = inst.id;
        selectedInstance = inst;
      }
    }

    if (!bridgeUrl || !bridgeKey) {
      const { data: inst } = await admin.from("whatsapp_instances")
        .select("id, bridge_url, bridge_api_key, is_primary, status, connected_since")
        .eq("client_id", pessoa.client_id)
        .eq("is_active", true)
        .not("bridge_url", "is", null)
        .not("bridge_api_key", "is", null)
        .order("is_primary", { ascending: false })
        .order("status", { ascending: true })
        .order("last_send_at", { ascending: true, nullsFirst: true })
        .limit(1)
        .maybeSingle();
      if (inst?.bridge_url && inst?.bridge_api_key) {
        bridgeUrl = inst.bridge_url;
        bridgeKey = inst.bridge_api_key;
        instanceId = inst.id;
        selectedInstance = inst;
      }
    }

    if (!bridgeUrl || !bridgeKey) {
      const { data: client } = await admin.from("clients")
        .select("whatsapp_bridge_url, whatsapp_bridge_api_key")
        .eq("id", pessoa.client_id).maybeSingle();
      bridgeUrl = bridgeUrl || client?.whatsapp_bridge_url || null;
      bridgeKey = bridgeKey || client?.whatsapp_bridge_api_key || null;
    }
    if (!bridgeUrl || !bridgeKey) {
      return new Response(JSON.stringify({
        success: true, sent: false, portal_url: portalUrl, email: emailNorm, password, message,
        warning: "Sem instância WhatsApp configurada. Copie e envie manualmente.",
      }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    if (selectedInstance) {
      const preflight = await preflightInstance(admin, selectedInstance);
      if (preflight.status !== "connected") {
        await admin.rpc("log_whatsapp_send", {
          p_instance_id: selectedInstance.id, p_client_id: pessoa.client_id, p_dispatch_id: null,
          p_success: false, p_error_message: `Preflight: instância offline (${preflight.detail || "sem status"})`.slice(0, 200),
          p_preflight_status: preflight.status, p_preflight_reconnected: preflight.reconnected,
        });
        return new Response(JSON.stringify({
          success: true, sent: false, portal_url: portalUrl, email: emailNorm, password, message,
          warning: "Instância WhatsApp desconectada. Reconecte o chip ou copie e envie manualmente.",
        }), { headers: { ...cors, "Content-Type": "application/json" } });
      }
      if (preflight.reconnected) await sleep(1500);
    }

    const { res, data: sendData } = await bridgeSend(bridgeUrl, bridgeKey, phone, message);
    const failure = sendFailure(res, sendData);
    if (failure) {
      if (selectedInstance && isInstanceDisconnectedFailure(res, sendData, String(failure))) {
        const reconnect = await tryReconnectInstance(admin, selectedInstance);
        if (reconnect.status === "connected") {
          await sleep(1500);
          const retry = await bridgeSend(bridgeUrl, bridgeKey, phone, message);
          const retryFailure = sendFailure(retry.res, retry.data);
          if (!retryFailure) {
            await admin.rpc("log_whatsapp_send", {
              p_instance_id: instanceId, p_client_id: pessoa.client_id, p_dispatch_id: null,
              p_success: true, p_error_message: null,
              p_preflight_status: "reconnected", p_preflight_reconnected: true,
            });
            return new Response(JSON.stringify({
              success: true, sent: true, portal_url: portalUrl, email: emailNorm, password, message,
            }), { headers: { ...cors, "Content-Type": "application/json" } });
          }
        } else {
          await updateInstanceStatus(admin, selectedInstance, "disconnected");
        }
      }
      if (instanceId) {
        await admin.rpc("log_whatsapp_send", {
          p_instance_id: instanceId, p_client_id: pessoa.client_id, p_dispatch_id: null,
          p_success: false, p_error_message: String(failure).slice(0, 200),
          p_preflight_status: selectedInstance ? "connected" : "skipped", p_preflight_reconnected: false,
        });
      }
      return new Response(JSON.stringify({
        success: true, sent: false, portal_url: portalUrl, email: emailNorm, password, message,
        warning: `Falha no envio: ${failure}`,
      }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    if (instanceId) {
      await admin.rpc("log_whatsapp_send", {
        p_instance_id: instanceId, p_client_id: pessoa.client_id, p_dispatch_id: null,
        p_success: true, p_error_message: null,
        p_preflight_status: "skipped", p_preflight_reconnected: false,
      });
    }

    return new Response(JSON.stringify({
      success: true, sent: true, portal_url: portalUrl, email: emailNorm, password, message,
    }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message || String(err) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
