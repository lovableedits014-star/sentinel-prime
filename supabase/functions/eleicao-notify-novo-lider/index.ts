import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BRIDGE_TIMEOUT_MS = 15000;
const TRANSIENT_BRIDGE_STATUSES = new Set([502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Mantém o mesmo padrão do send-whatsapp-dispatch (que funciona):
// não remove o 9º dígito. A resolução do JID real (com/sem 9) é
// responsabilidade do Bridge/VPS via onWhatsApp().
function cleanPhoneForBridge(raw: string): string {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function phoneDebug(raw: string) {
  const digits = String(raw || "").replace(/\D/g, "");
  const bridgePhone = cleanPhoneForBridge(raw);
  return { original: digits, bridgePhone };
}

function fmtPhone(s: string) {
  const d = (s || "").replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return s;
}

function applyTemplate(tpl: string, vars: Record<string, string>) {
  return (tpl || "").replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

const REGIAO_LABELS: Record<string, string> = {
  centro: "Centro", segredo: "Segredo", prosa: "Prosa", bandeira: "Bandeira",
  anhanduizinho: "Anhanduizinho", lagoa: "Lagoa", imbirussu: "Imbirussu", moreninha: "Moreninha",
};

function samePhone(a: string, b: string) {
  const da = String(a || "").replace(/\D/g, "");
  const db = String(b || "").replace(/\D/g, "");
  if (!da || !db) return false;
  if (da === db) return true;
  const last = (s: string, n: number) => s.slice(-n);
  return last(da, 8) === last(db, 8);
}

function isConnectedStatus(s: unknown) {
  const v = String(s || "").toLowerCase();
  return v === "connected" || v === "open";
}
function isExplicitOfflineStatus(s: unknown) {
  const v = String(s || "").toLowerCase();
  return ["disconnected", "offline", "closed", "logged_out", "logout", "banned"].includes(v);
}
function bridgeStatusOf(data: any) {
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
      const fakeRes = new Response(null, { status: aborted ? 504 : 502 });
      return { res: fakeRes, data: { error: aborted ? `Timeout após ${BRIDGE_TIMEOUT_MS}ms na ponte WhatsApp` : `Falha de rede: ${(err as Error).message}` } };
    }
  }
  throw new Error("Falha inesperada ao comunicar com a ponte WhatsApp");
}

// Mesma lógica do send-whatsapp-dispatch e eleicao-send-credentials.
function sendFailure(res: Response, data: any): string | null {
  if (!res.ok) return data?.error || `Erro na ponte WhatsApp (status ${res.status})`;
  if (data?.success === false) return data?.error || "Ponte recusou o envio";
  if (data?.delivered === false) return data?.error || "Mensagem não entregue pelo WhatsApp";
  const confirmed = data?.delivered === true || Boolean(data?.messageId || data?.message_id || data?.id || data?.key?.id);
  return confirmed ? null : (data?.error || "Ponte não confirmou o envio da mensagem");
}

function isInstanceDisconnectedFailure(res: Response, data: any, failure: string) {
  if (res.status === 401 || res.status === 409) return true;
  const msg = String(data?.error || data?.message || failure || "").toLowerCase();
  return (msg.includes("instance") && (msg.includes("disconnect") || msg.includes("not connected") || msg.includes("offline")))
    || /not connected|desconect|sem conex/i.test(msg);
}

async function updateInstanceStatus(admin: any, instId: string, status: "connected" | "connecting" | "disconnected") {
  if (!instId) return;
  const updates: any = { status, last_health_check_at: new Date().toISOString() };
  if (status === "connected") updates.connected_since = new Date().toISOString();
  if (status === "disconnected") {
    updates.connected_since = null;
    updates.last_disconnected_at = new Date().toISOString();
  }
  await admin.from("whatsapp_instances").update(updates).eq("id", instId);
}

async function preflightInstance(admin: any, bridge: any) {
  try {
    const { res, data } = await bridgeAction(bridge.bridge_url, bridge.bridge_api_key, { action: "instance_status" }, 1);
    const raw = bridgeStatusOf(data);
    if (isConnectedStatus(raw)) {
      await updateInstanceStatus(admin, bridge.id, "connected");
      return { status: "connected", reconnected: false, detail: raw };
    }
    if (isExplicitOfflineStatus(raw) || res.status === 401) {
      await updateInstanceStatus(admin, bridge.id, "disconnected");
    }
  } catch (e) {
    console.warn("[eleicao-notify-novo-lider] preflight status falhou:", (e as Error).message);
  }
  const { res, data } = await bridgeAction(bridge.bridge_url, bridge.bridge_api_key, { action: "reconnect" }, 1);
  const raw = bridgeStatusOf(data);
  const status = isConnectedStatus(raw) ? "connected" : (isExplicitOfflineStatus(raw) || res.status === 401 ? "disconnected" : "connecting");
  await updateInstanceStatus(admin, bridge.id, status as any);
  return { status, reconnected: status === "connected", detail: raw || data?.error || data?.message || "sem status" };
}

// Seleção de instância idêntica ao eleicao-send-credentials/send-whatsapp-dispatch:
// 1) pick_healthy_whatsapp_instance (RPC)  2) qualquer ativa  3) bridge legada do client.
async function getBridge(admin: any, clientId: string) {
  const { data: pickedId } = await admin.rpc("pick_healthy_whatsapp_instance", { p_client_id: clientId });
  if (pickedId) {
    const { data: inst } = await admin.from("whatsapp_instances")
      .select("id, apelido, bridge_url, bridge_api_key, phone_number, connected_since, status")
      .eq("id", pickedId).maybeSingle();
    if (inst?.bridge_url && inst?.bridge_api_key) {
      console.log("[eleicao-notify-novo-lider] instância via pick_healthy", { id: inst.id, apelido: inst.apelido, status: inst.status });
      return inst;
    }
  }

  const { data: anyActive } = await admin.from("whatsapp_instances")
    .select("id, apelido, bridge_url, bridge_api_key, phone_number, connected_since, status, is_primary")
    .eq("client_id", clientId).eq("is_active", true)
    .not("bridge_url", "is", null).not("bridge_api_key", "is", null)
    .order("is_primary", { ascending: false })
    .order("status", { ascending: true })
    .order("last_send_at", { ascending: true, nullsFirst: true })
    .limit(1).maybeSingle();
  if (anyActive?.bridge_url && anyActive?.bridge_api_key) {
    console.log("[eleicao-notify-novo-lider] instância via fallback ativo", { id: anyActive.id, apelido: anyActive.apelido, status: anyActive.status });
    return anyActive;
  }

  return null;
}

async function bridgeSend(admin: any, bridge: any, phone: string, message: string) {
  const cleaned = cleanPhoneForBridge(phone);
  if (!cleaned) return { ok: false, error: "Telefone inválido", phone: "", status: 0, messageId: null as string | null, raw: null as any };

  // Mesmo payload simples do send-whatsapp-dispatch / eleicao-send-credentials.
  let { res, data } = await bridgeAction(bridge.bridge_url, bridge.bridge_api_key,
    { action: "send", phone: cleaned, message }, 2);
  let failure = sendFailure(res, data);

  // Se a ponte indicou que a instância caiu, tenta reconectar e reenviar uma vez.
  if (failure && isInstanceDisconnectedFailure(res, data, failure)) {
    console.warn("[eleicao-notify-novo-lider] retry após desconexão", { phone: cleaned, status: res.status, error: failure });
    const reconnect = await preflightInstance(admin, bridge);
    if (reconnect.status === "connected") {
      await sleep(1500);
      const r2 = await bridgeAction(bridge.bridge_url, bridge.bridge_api_key,
        { action: "send", phone: cleaned, message }, 1);
      res = r2.res; data = r2.data;
      failure = sendFailure(res, data);
    } else {
      await updateInstanceStatus(admin, bridge.id, "disconnected");
    }
  }

  const messageId = data?.messageId || data?.message_id || data?.id || data?.key?.id || null;

  return {
    ok: !failure,
    error: failure,
    phone: cleaned,
    status: res.status,
    messageId,
    raw: data,
  };
}

async function logSend(admin: any, bridge: any, clientId: string, sent: boolean, error: string | undefined, preflightStatus: string, preflightReconnected: boolean) {
  if (!bridge?.id) return;
  await admin.rpc("log_whatsapp_send", {
    p_instance_id: bridge.id,
    p_client_id: clientId,
    p_dispatch_id: null,
    p_success: sent,
    p_error_message: error || null,
    p_preflight_status: preflightStatus,
    p_preflight_reconnected: preflightReconnected,
  });
}

async function auditLog(admin: any, row: Record<string, any>) {
  try {
    await admin.from("eleicao_notif_log").insert(row);
  } catch (e) {
    console.error("[eleicao-notify-novo-lider] audit log falhou:", (e as Error).message);
  }
}

type SendOutcome = {
  sent: boolean;
  reason?: string;
  error?: string;
  messageId?: string | null;
  destinatario_nome?: string | null;
  destinatario_telefone?: string | null;
  destinatario_telefone_fmt?: string | null;
  instance?: { id: string; apelido: string | null } | null;
  preflight_status?: string;
  bridge_status?: number;
};

async function sendTo(params: {
  admin: any;
  bridge: any;
  preflightStatus: string;
  preflightReconnected: boolean;
  clientId: string;
  pessoaId: string;
  destinatarioTipo: string;
  destinatarioNome: string | null;
  destinatarioTelefone: string | null;
  message: string;
}): Promise<SendOutcome> {
  const { admin, bridge, preflightStatus, preflightReconnected, clientId, pessoaId, destinatarioTipo, destinatarioNome, destinatarioTelefone, message } = params;

  const baseInstance = bridge ? { id: bridge.id, apelido: bridge.apelido || null } : null;
  const baseInfo = {
    destinatario_nome: destinatarioNome,
    destinatario_telefone: destinatarioTelefone,
    destinatario_telefone_fmt: destinatarioTelefone ? fmtPhone(destinatarioTelefone) : null,
    instance: baseInstance,
    preflight_status: preflightStatus,
  };

  if (!destinatarioTelefone) {
    const reason = "Sem telefone";
    await auditLog(admin, {
      client_id: clientId, pessoa_id: pessoaId, destinatario_tipo: destinatarioTipo,
      destinatario_nome: destinatarioNome, destinatario_telefone: null, mensagem: message,
      success: false, skipped_reason: reason, preflight_status: preflightStatus,
    });
    return { sent: false, reason, ...baseInfo };
  }

  if (bridge?.phone_number && samePhone(destinatarioTelefone, bridge.phone_number)) {
    const reason = "Destinatário é o próprio número da instância WhatsApp — use um número diferente.";
    console.warn("[eleicao-notify-novo-lider] self-send bloqueado", { destinatarioTipo, destinatarioTelefone, instance: bridge.phone_number });
    await auditLog(admin, {
      client_id: clientId, pessoa_id: pessoaId, destinatario_tipo: destinatarioTipo,
      destinatario_nome: destinatarioNome, destinatario_telefone: destinatarioTelefone, mensagem: message,
      success: false, skipped_reason: reason, preflight_status: preflightStatus,
    });
    return { sent: false, reason, ...baseInfo };
  }

  console.log("[eleicao-notify-novo-lider] envio →", {
    destinatarioTipo, destinatarioNome,
    phone: cleanPhoneForBridge(destinatarioTelefone),
    phoneDebug: phoneDebug(destinatarioTelefone),
    instance: baseInstance,
    msgLen: message.length,
  });

  const r = await bridgeSend(admin, bridge, destinatarioTelefone, message);
  // Log COMPLETO do body que o Bridge devolveu (sem reduzir campos),
  // pra capturar os novos campos: queued, vps_status, message_id, ack, warning, raw, etc.
  console.log("[eleicao-notify-novo-lider] ← bridgeRawFull", {
    destinatarioTipo, phone: r.phone, status: r.status, ok: r.ok,
    bridgeRaw: JSON.stringify(r.raw),
  });

  await auditLog(admin, {
    client_id: clientId, pessoa_id: pessoaId, destinatario_tipo: destinatarioTipo,
    destinatario_nome: destinatarioNome, destinatario_telefone: destinatarioTelefone, mensagem: message,
    success: r.ok, error_message: r.ok ? null : r.error, message_id: r.messageId,
    preflight_status: preflightStatus, bridge_status: r.status,
  });
  await logSend(admin, bridge, clientId, r.ok, r.ok ? undefined : (r.error || undefined), preflightStatus, preflightReconnected);

  if (r.ok) {
    return { sent: true, messageId: r.messageId, ...baseInfo, bridge_status: r.status, bridgeRaw: r.raw };
  }
  return { sent: false, error: r.error || "Falha desconhecida", ...baseInfo, bridge_status: r.status, bridgeRaw: r.raw };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const body = await req.json();
    const pessoa_id = body?.pessoa_id;
    const target = (body?.target as string | undefined)?.toLowerCase();
    if (!pessoa_id) throw new Error("pessoa_id obrigatório");
    if (target && !["coordenador", "secretaria", "lider"].includes(target)) {
      throw new Error("target inválido");
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
      .select("id, client_id, nome, telefone, tipo, escopo, regiao, parent_id, rua, numero, bairro, endereco")
      .eq("id", pessoa_id).maybeSingle();
    if (!pessoa) throw new Error("Pessoa não encontrada");
    if (pessoa.tipo !== "lider") {
      return new Response(JSON.stringify({ success: true, skipped: "Não é líder" }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    const { data: isSuper } = await userClient.rpc("is_super_admin");
    let canAccess = !!isSuper;
    if (!canAccess) {
      const { data: ca } = await userClient.rpc("user_can_access_client", { _client_id: pessoa.client_id });
      canAccess = !!ca;
    }
    if (!canAccess) return new Response(JSON.stringify({ error: "Sem permissão" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });

    const { data: cfg } = await admin.from("eleicao_notif_config")
      .select("*").eq("client_id", pessoa.client_id).maybeSingle();
    if (!cfg || !cfg.auto_enviar) {
      return new Response(JSON.stringify({ success: true, skipped: "auto_enviar desativado ou não configurado" }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    const bridge = await getBridge(admin, pessoa.client_id);
    if (!bridge) {
      return new Response(JSON.stringify({ success: false, error: "Sem instância WhatsApp configurada" }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    const pre = await preflightInstance(admin, bridge);
    if (pre.status === "disconnected") {
      const msg = `Instância WhatsApp desconectada (${pre.detail || "sem status"}). Reconecte em Status WhatsApp.`;
      console.warn("[eleicao-notify-novo-lider] preflight falhou:", msg);
      return new Response(JSON.stringify({
        success: false, error: msg,
        instance: { id: bridge.id, apelido: bridge.apelido || null },
        preflight: pre,
      }), { headers: { ...cors, "Content-Type": "application/json" } });
    }
    if (pre.reconnected) await sleep(1500);

    const regiaoLabel = pessoa.regiao ? (REGIAO_LABELS[pessoa.regiao] || pessoa.regiao) : "—";
    const linkGrupo = (cfg.grupos_links && pessoa.regiao) ? (cfg.grupos_links[pessoa.regiao] || "") : "";
    const vars = {
      nome: pessoa.nome,
      regiao: regiaoLabel,
      telefone: fmtPhone(pessoa.telefone),
      rua: pessoa.rua || pessoa.endereco || "—",
      numero: pessoa.numero || "s/n",
      bairro: pessoa.bairro || "—",
      link_grupo: linkGrupo || "(grupo não configurado)",
    };

    const msgInterno = applyTemplate(cfg.template_coordenador, vars);
    const msgLider = applyTemplate(cfg.template_lider, vars);

    const results: Record<string, SendOutcome> = {};

    async function resolveCoord(): Promise<{ phone: string | null; nome: string | null }> {
      let coordPhone: string | null = null;
      let coordNome: string | null = null;
      if (pessoa.parent_id) {
        const { data: parent } = await admin.from("eleicao_pessoas")
          .select("nome, telefone, tipo").eq("id", pessoa.parent_id).maybeSingle();
        if (parent?.tipo === "coordenador" && parent.telefone) {
          coordPhone = parent.telefone;
          coordNome = parent.nome;
        }
      }
      if (!coordPhone && pessoa.regiao && pessoa.escopo === "campo_grande") {
        // 2. Tenta o coordenador FAVORITO da região (novo comportamento)
        const { data: fav } = await admin.from("eleicao_pessoas")
          .select("nome, telefone")
          .eq("client_id", pessoa.client_id).eq("tipo", "coordenador")
          .eq("escopo", "campo_grande").eq("regiao", pessoa.regiao)
          .eq("is_favorito_regiao", true)
          .maybeSingle();
        if (fav?.telefone) {
          coordPhone = fav.telefone;
          coordNome = fav.nome;
        } else {
          // 3. Fallback legado: coordenador mais antigo da região
          const { data: coord } = await admin.from("eleicao_pessoas")
            .select("nome, telefone")
            .eq("client_id", pessoa.client_id).eq("tipo", "coordenador")
            .eq("escopo", "campo_grande").eq("regiao", pessoa.regiao)
            .order("created_at", { ascending: true }).limit(1).maybeSingle();
          if (coord?.telefone) { coordPhone = coord.telefone; coordNome = coord.nome; }
        }
      }
      return { phone: coordPhone, nome: coordNome };
    }

    const baseSendCtx = {
      admin, bridge, preflightStatus: pre.status, preflightReconnected: pre.reconnected,
      clientId: pessoa.client_id, pessoaId: pessoa.id,
    };

    async function runCoordenador() {
      const { phone, nome } = await resolveCoord();
      if (!phone) {
        results.coordenador = {
          sent: false, reason: "Sem coordenador na região",
          destinatario_nome: nome, destinatario_telefone: null, destinatario_telefone_fmt: null,
          instance: { id: bridge.id, apelido: bridge.apelido || null },
          preflight_status: pre.status,
        };
        return;
      }
      results.coordenador = await sendTo({
        ...baseSendCtx,
        destinatarioTipo: "coordenador", destinatarioNome: nome,
        destinatarioTelefone: phone, message: msgInterno,
      });
    }

    async function runSecretaria() {
      if (!cfg.secretaria_telefone) {
        results.secretaria = {
          sent: false, reason: "Telefone da secretaria não configurado",
          destinatario_nome: "Secretaria", destinatario_telefone: null, destinatario_telefone_fmt: null,
          instance: { id: bridge.id, apelido: bridge.apelido || null },
          preflight_status: pre.status,
        };
        return;
      }
      results.secretaria = await sendTo({
        ...baseSendCtx,
        destinatarioTipo: "secretaria", destinatarioNome: "Secretaria",
        destinatarioTelefone: cfg.secretaria_telefone, message: msgInterno,
      });
    }

    async function runLider() {
      results.lider = await sendTo({
        ...baseSendCtx,
        destinatarioTipo: "lider", destinatarioNome: pessoa.nome,
        destinatarioTelefone: pessoa.telefone, message: msgLider,
      });
    }

    if (target) {
      if (target === "coordenador") await runCoordenador();
      else if (target === "secretaria") await runSecretaria();
      else if (target === "lider") await runLider();
      return new Response(
        JSON.stringify({ success: true, preflight: pre, target, result: results[target] }),
        { headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    await runCoordenador();
    await sleep(800);
    await runSecretaria();
    await sleep(800);
    await runLider();

    return new Response(JSON.stringify({ success: true, preflight: pre, results }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("[eleicao-notify-novo-lider] erro:", err);
    return new Response(JSON.stringify({ error: err.message || String(err) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
