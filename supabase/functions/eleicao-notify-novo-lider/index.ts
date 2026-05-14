import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BRIDGE_TIMEOUT_MS = 15000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function cleanPhoneForBridge(raw: string): string {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function fmtPhone(s: string) {
  const d = (s || "").replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return s;
}

function applyTemplate(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

const REGIAO_LABELS: Record<string, string> = {
  centro: "Centro", segredo: "Segredo", prosa: "Prosa", bandeira: "Bandeira",
  anhanduizinho: "Anhanduizinho", lagoa: "Lagoa", imbirussu: "Imbirussu", moreninha: "Moreninha",
};

// Compara dois telefones ignorando o "9" extra (para detectar quando o destinatário
// é o próprio número da instância — WhatsApp não entrega mensagens para si mesmo).
function samePhone(a: string, b: string) {
  const da = String(a || "").replace(/\D/g, "");
  const db = String(b || "").replace(/\D/g, "");
  if (!da || !db) return false;
  if (da === db) return true;
  // Tolerância de 1 dígito para o "9" extra (ex.: 556792773931 vs 5567992773931)
  const last = (s: string, n: number) => s.slice(-n);
  return last(da, 8) === last(db, 8);
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = BRIDGE_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(tid);
  }
}

async function getBridge(admin: any, clientId: string) {
  const { data: pickedId } = await admin.rpc("pick_healthy_whatsapp_instance", { p_client_id: clientId });
  if (pickedId) {
    const { data: inst } = await admin.from("whatsapp_instances")
      .select("id, apelido, bridge_url, bridge_api_key, phone_number")
      .eq("id", pickedId).maybeSingle();
    if (inst?.bridge_url && inst?.bridge_api_key) return inst;
  }
  const { data: inst } = await admin.from("whatsapp_instances")
    .select("id, apelido, bridge_url, bridge_api_key, phone_number")
    .eq("client_id", clientId).eq("is_active", true)
    .not("bridge_url", "is", null).not("bridge_api_key", "is", null)
    .order("is_primary", { ascending: false }).limit(1).maybeSingle();
  if (inst?.bridge_url && inst?.bridge_api_key) return inst;
  return null;
}

// Pré-checa a instância: status_instance e tenta reconectar se necessário.
async function preflightInstance(bridge: any) {
  try {
    const res = await fetchWithTimeout(bridge.bridge_url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": bridge.bridge_api_key },
      body: JSON.stringify({ action: "instance_status" }),
    });
    const data = await res.json().catch(() => ({}));
    const raw = String(data?.status || data?.instance?.status || "").toLowerCase();
    if (raw === "connected" || raw === "open") {
      return { status: "connected", reconnected: false };
    }
    // Tenta reconectar
    const rec = await fetchWithTimeout(bridge.bridge_url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": bridge.bridge_api_key },
      body: JSON.stringify({ action: "reconnect" }),
    });
    const recData = await rec.json().catch(() => ({}));
    const newStatus = String(recData?.status || recData?.instance?.status || "").toLowerCase();
    if (newStatus === "connected" || newStatus === "open") {
      return { status: "reconnected", reconnected: true };
    }
    return { status: "disconnected", reconnected: false, detail: newStatus || raw || "sem status" };
  } catch (e: any) {
    return { status: "error", reconnected: false, detail: e?.message || "preflight falhou" };
  }
}

async function bridgeSend(bridge: any, phone: string, message: string) {
  const cleaned = cleanPhoneForBridge(phone);
  if (!cleaned) return { ok: false, error: "Telefone inválido", phone: "", status: 0, messageId: null };
  try {
    const res = await fetchWithTimeout(bridge.bridge_url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": bridge.bridge_api_key },
      body: JSON.stringify({ action: "send", phone: cleaned, message }),
    });
    const data = await res.json().catch(async () => ({ error: await res.text().catch(() => "Resposta inválida da ponte") }));
    const messageId = data?.messageId || data?.message_id || data?.id || data?.key?.id || null;
    const hasDeliverySignal = data?.delivered === true || Boolean(messageId);
    let error: string | null = null;
    if (!res.ok) error = data?.error || `Erro na ponte WhatsApp (status ${res.status})`;
    else if (data?.success === false) error = data?.error || "Ponte recusou o envio";
    else if (data?.delivered === false) error = data?.error || "Mensagem não entregue pelo WhatsApp";
    else if (!hasDeliverySignal) error = data?.error || "Ponte não confirmou entrega da mensagem";
    return { ok: !error, error, phone: cleaned, status: res.status, messageId };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Erro de rede", phone: cleaned, status: 0, messageId: null };
  }
}

async function logSend(admin: any, bridge: any, clientId: string, sent: boolean, error?: string) {
  if (!bridge?.id) return;
  await admin.rpc("log_whatsapp_send", {
    p_instance_id: bridge.id,
    p_client_id: clientId,
    p_dispatch_id: null,
    p_success: sent,
    p_error_message: error || null,
    p_preflight_status: "connected",
    p_preflight_reconnected: false,
  });
}

async function auditLog(admin: any, row: Record<string, any>) {
  try {
    await admin.from("eleicao_notif_log").insert(row);
  } catch (e) {
    console.error("[eleicao-notify-novo-lider] audit log falhou:", (e as Error).message);
  }
}

type SendOutcome = { sent: boolean; reason?: string; error?: string; messageId?: string | null };

async function sendTo(params: {
  admin: any;
  bridge: any;
  preflightStatus: string;
  clientId: string;
  pessoaId: string;
  destinatarioTipo: string;
  destinatarioNome: string | null;
  destinatarioTelefone: string | null;
  message: string;
}): Promise<SendOutcome> {
  const { admin, bridge, preflightStatus, clientId, pessoaId, destinatarioTipo, destinatarioNome, destinatarioTelefone, message } = params;

  if (!destinatarioTelefone) {
    const reason = "Sem telefone";
    await auditLog(admin, {
      client_id: clientId, pessoa_id: pessoaId, destinatario_tipo: destinatarioTipo,
      destinatario_nome: destinatarioNome, destinatario_telefone: null, mensagem: message,
      success: false, skipped_reason: reason, preflight_status: preflightStatus,
    });
    return { sent: false, reason };
  }

  // Bloqueia envio para o próprio número da instância (WhatsApp não entrega para si mesmo).
  if (bridge?.phone_number && samePhone(destinatarioTelefone, bridge.phone_number)) {
    const reason = "Destinatário é o próprio número da instância WhatsApp — não é possível enviar para si mesmo. Use um número diferente.";
    console.warn("[eleicao-notify-novo-lider] self-send bloqueado", { destinatarioTipo, destinatarioTelefone, instance: bridge.phone_number });
    await auditLog(admin, {
      client_id: clientId, pessoa_id: pessoaId, destinatario_tipo: destinatarioTipo,
      destinatario_nome: destinatarioNome, destinatario_telefone: destinatarioTelefone, mensagem: message,
      success: false, skipped_reason: reason, preflight_status: preflightStatus,
    });
    return { sent: false, reason };
  }

  const r = await bridgeSend(bridge, destinatarioTelefone, message);
  console.log("[eleicao-notify-novo-lider]", { destinatarioTipo, phone: r.phone, status: r.status, ok: r.ok, messageId: r.messageId, error: r.error });

  await auditLog(admin, {
    client_id: clientId, pessoa_id: pessoaId, destinatario_tipo: destinatarioTipo,
    destinatario_nome: destinatarioNome, destinatario_telefone: destinatarioTelefone, mensagem: message,
    success: r.ok, error_message: r.ok ? null : r.error, message_id: r.messageId,
    preflight_status: preflightStatus, bridge_status: r.status,
  });
  await logSend(admin, bridge, clientId, r.ok, r.error || undefined);

  if (r.ok) return { sent: true, messageId: r.messageId };
  return { sent: false, error: r.error || "Falha desconhecida" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const { pessoa_id } = await req.json();
    if (!pessoa_id) throw new Error("pessoa_id obrigatório");

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

    // Pré-checagem da instância antes de enviar
    const pre = await preflightInstance(bridge);
    if (pre.status === "disconnected" || pre.status === "error") {
      const msg = `Instância WhatsApp indisponível (${pre.status}${pre.detail ? ": " + pre.detail : ""}). Reconecte em Status WhatsApp e tente novamente.`;
      console.warn("[eleicao-notify-novo-lider] preflight falhou:", msg);
      return new Response(JSON.stringify({ success: false, error: msg }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

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

    // 1) Coordenador da região (parent_id ou fallback por região)
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
      const { data: coord } = await admin.from("eleicao_pessoas")
        .select("nome, telefone")
        .eq("client_id", pessoa.client_id).eq("tipo", "coordenador")
        .eq("escopo", "campo_grande").eq("regiao", pessoa.regiao)
        .order("created_at", { ascending: true }).limit(1).maybeSingle();
      if (coord?.telefone) { coordPhone = coord.telefone; coordNome = coord.nome; }
    }
    results.coordenador = await sendTo({
      admin, bridge, preflightStatus: pre.status, clientId: pessoa.client_id, pessoaId: pessoa.id,
      destinatarioTipo: "coordenador", destinatarioNome: coordNome,
      destinatarioTelefone: coordPhone, message: msgInterno,
    });
    if (!coordPhone) results.coordenador = { sent: false, reason: "Sem coordenador na região" };

    await sleep(800); // pequeno respiro entre envios

    // 2) Secretaria
    results.secretaria = await sendTo({
      admin, bridge, preflightStatus: pre.status, clientId: pessoa.client_id, pessoaId: pessoa.id,
      destinatarioTipo: "secretaria", destinatarioNome: "Secretaria",
      destinatarioTelefone: cfg.secretaria_telefone || null, message: msgInterno,
    });
    if (!cfg.secretaria_telefone) {
      results.secretaria = { sent: false, reason: "Telefone da secretaria não configurado" };
    }

    await sleep(800);

    // 3) Líder cadastrado
    results.lider = await sendTo({
      admin, bridge, preflightStatus: pre.status, clientId: pessoa.client_id, pessoaId: pessoa.id,
      destinatarioTipo: "lider", destinatarioNome: pessoa.nome,
      destinatarioTelefone: pessoa.telefone, message: msgLider,
    });

    return new Response(JSON.stringify({ success: true, preflight: pre, results }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("[eleicao-notify-novo-lider] erro:", err);
    return new Response(JSON.stringify({ error: err.message || String(err) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
