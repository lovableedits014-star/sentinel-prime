import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderMessage, type Recipient as VarRecipient, type RenderContext } from "../_shared/message-variation.ts";
import { pickCta, type Cta, type CtaCategory } from "../_shared/response-ctas.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_DELAY_MIN = 5;
const DEFAULT_DELAY_MAX = 15;
const DEFAULT_BATCH_PAUSE = 60;
const MAX_RUNTIME_MS = 55000;
const RUNTIME_PAUSE_AT_MS = 42_000;
const BRIDGE_SEND_TIMEOUT_MS = 18_000;
const SAO_PAULO_OFFSET_HOURS = -3; // UTC-3 (sem horário de verão atualmente)

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(minMs: number, maxMs: number) {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

/**
 * Delay mínimo por estágio de ramp-up (protege chip novo de queima).
 * novo: 25s min entre msgs · aquecendo: 8s · maduro: 0 (respeita config).
 */
function stageMinDelayMs(stage: string): number {
  if (stage === "novo") return 25_000;
  if (stage === "aquecendo") return 8_000;
  return 0;
}

function isWithinWindow(start: string, end: string): boolean {
  // start/end no formato "HH:MM:SS"
  const now = new Date();
  // converte UTC -> America/Sao_Paulo (UTC-3)
  const localMin = ((now.getUTCHours() + SAO_PAULO_OFFSET_HOURS + 24) % 24) * 60 + now.getUTCMinutes();
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  if (startMin <= endMin) return localMin >= startMin && localMin < endMin;
  // janela cruza meia-noite
  return localMin >= startMin || localMin < endMin;
}

function cleanPhoneForBridge(raw: string): string {
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

const TRANSIENT_BRIDGE_STATUSES = new Set([502, 503, 504]);

async function fetchBridgeSend(params: {
  bridgeUrl: string;
  bridgeApiKey: string;
  phone: string;
  message: string;
  mediaUrl?: string | null;
  mediaKind?: "image" | "video" | "document" | null;
  mediaFilename?: string | null;
  mediaMime?: string | null;
}) {
  const { bridgeUrl, bridgeApiKey, phone, message, mediaUrl, mediaKind, mediaFilename, mediaMime } = params;
  const isGroup = typeof phone === "string" && phone.endsWith("@g.us");
  const hasMedia = !!mediaUrl;
  const caption = message || "";

  // Campos redundantes para maximizar compatibilidade com diferentes bridges (UAZ/Evolution/etc.).
  // Se mediaKind não vier, assume "image" (retrocompat).
  const kind: "image" | "video" | "document" = (mediaKind === "video" || mediaKind === "document")
    ? mediaKind
    : "image";
  const mediaExtras: Record<string, unknown> = hasMedia
    ? {
        media_type: kind,
        mediaType: kind,
        type: kind,
        mimetype: mediaMime || undefined,
        mime_type: mediaMime || undefined,
        filename: mediaFilename || undefined,
        file_name: mediaFilename || undefined,
        document_name: kind === "document" ? (mediaFilename || undefined) : undefined,
      }
    : {};

  // Para grupos, montamos uma cadeia de tentativas com formatos diferentes
  // pois bridges variam: algumas aceitam `action:"send_group"` com `group_jid`,
  // outras aceitam o JID direto em `to` ou `phone` no `action:"send"`.
  // A primeira que NÃO devolver "unsupported"/"número inválido" vence.
  const attempts: Array<Record<string, unknown>> = hasMedia
    ? (isGroup
        ? [
            { action: "send_media", phone, media_url: mediaUrl, caption, is_group: true, isGroup: true, ...mediaExtras },
            { action: "send_media", group_jid: phone, jid: phone, remoteJid: phone, chatId: phone, media_url: mediaUrl, caption, ...mediaExtras },
            { action: "send_media", to: phone, media_url: mediaUrl, caption, is_group: true, ...mediaExtras },
          ]
        : [{ action: "send_media", phone, media_url: mediaUrl, caption, ...mediaExtras }])
    : isGroup
    ? [
        { action: "send_group", group_jid: phone, jid: phone, remoteJid: phone, chatId: phone, message },
        { action: "send", jid: phone, group_jid: phone, remoteJid: phone, chatId: phone, is_group: true, isGroup: true, message },
        { action: "send", remoteJid: phone, chatId: phone, is_group: true, isGroup: true, message },
        { action: "send", chatId: phone, is_group: true, isGroup: true, message },
        { action: "send", to: phone, jid: phone, group_jid: phone, is_group: true, message },
        { action: "send", phone, message }, // último recurso (formato legado)
      ]
    : [{ action: "send", phone, message }];

  let lastRes: Response | null = null;
  let lastData: any = null;

  for (const body of attempts) {
    for (let attempt = 0; attempt <= 2; attempt++) {
      const ctrl = new AbortController();
      const timeoutId = setTimeout(() => ctrl.abort(), BRIDGE_SEND_TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch(bridgeUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Api-Key": bridgeApiKey,
          },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
      } catch (err) {
        clearTimeout(timeoutId);
        if (attempt < 2) {
          console.warn(`Bridge send falhou/timeout; retrying attempt ${attempt + 2}/3`, (err as Error).message);
          await sleep(1000 * (attempt + 1));
          continue;
        }
        return {
          res: new Response(null, { status: 504 }),
          data: { error: `Timeout/falha ao comunicar com a ponte WhatsApp: ${(err as Error).message}` },
        };
      } finally {
        clearTimeout(timeoutId);
      }

      const data = await res.json().catch(async () => ({ error: await res.text().catch(() => "Resposta inválida da ponte") }));

      if (TRANSIENT_BRIDGE_STATUSES.has(res.status) && attempt < 2) {
        console.warn(`Bridge send returned ${res.status}; retrying attempt ${attempt + 2}/3`);
        await sleep(1000 * (attempt + 1));
        continue;
      }

      lastRes = res;
      lastData = data;

      // Se for grupo e a bridge respondeu "action não suportada" ou "número inválido",
      // tenta o próximo formato de payload.
      if (isGroup) {
        const errMsg = String(data?.error || "").toLowerCase();
        const acceptedWithoutProof = res.ok && !data?.delivered && !(data?.messageId || data?.message_id || data?.id || data?.key?.id);
        const unsupported =
          acceptedWithoutProof ||
          errMsg.includes("unsupported action") ||
          errMsg.includes("available:") ||
          errMsg.includes("número inválido") ||
          errMsg.includes("numero invalido") ||
          errMsg.includes("invalid number") ||
          errMsg.includes("invalid phone") ||
          errMsg.includes("phone required") ||
          errMsg.includes("telefone obrigatório") ||
          errMsg.includes("telefone obrigatorio") ||
          errMsg.includes("phone is required");
        if (unsupported) {
          console.warn(`[group send] payload "${body.action}" rejeitado (${data?.error || res.status}) — tentando próximo formato`);
          break; // sai do retry interno e pula pro próximo `attempts`
        }
      }

      return { res, data };
    }
  }

  // Se chegou aqui sem sucesso, devolve o último resultado pra que getSendFailure capture o erro.
  if (isGroup && lastRes) {
    return {
      res: lastRes,
      data: {
        ...lastData,
        error: lastData?.error || "A VPS/bridge ainda não aceita envio para grupos: ela não suporta action=send_group e está validando o JID do grupo como número de telefone.",
      },
    };
  }
  if (lastRes) return { res: lastRes, data: lastData };
  throw new Error("Falha inesperada ao comunicar com a ponte WhatsApp");
}

function getSendFailure(res: Response, data: any) {
  if (!res.ok) return data?.error || `Erro na ponte WhatsApp (status ${res.status})`;
  if (data?.success === false) return data?.error || "Ponte recusou o envio";
  if (data?.delivered === false) return data?.error || "Mensagem não entregue pelo WhatsApp";
  // Aceita como enviado quando a ponte responde 2xx e não há sinal explícito de falha.
  // Alguns builds da bridge não retornam messageId — punir a instância nesse caso gera
  // falsos "consecutive_failures" e derruba o chip do pool sem motivo real.
  return null;
}

// Identifica se o erro indica que a INSTÂNCIA está desconectada (failover total),
// e não apenas falha de envio para esse destinatário.
function isInstanceDisconnectedError(res: Response, data: any): boolean {
  if (res.status === 401) return true;
  const msg = String(data?.error || "").toLowerCase();
  return msg.includes("instance") && (msg.includes("disconnect") || msg.includes("not connected") || msg.includes("offline"));
}

// ============================================================
// Pré-checagem (preflight) de saúde da instância antes do envio.
//
// IMPORTANTE: NÃO chama `reconnect` automaticamente durante disparo.
// Forçar reconnect/handshake várias vezes seguidas é gatilho de queda real
// da sessão (e até de ban).
//
// Política CONSERVADORA (fail-safe):
//  - connected/open                  → "connected" (envio liberado)
//  - terminal offline / 401          → "disconnected" (marca offline)
//  - connecting/qr/vazio/erro de rede → "not_ready" (NÃO envia; pausa/failover)
//
// Antes a categoria "transient" deixava o envio prosseguir mesmo com
// `connecting` — exatamente o caso em que a UI dizia "conectado" mas o
// envio falhava porque a sessão WhatsApp ainda não estava operacional.
// ============================================================
const TERMINAL_OFFLINE_STATUSES = new Set([
  "disconnected", "offline", "closed", "logged_out", "logout", "banned",
]);

type PreflightResult = {
  status: "connected" | "not_ready" | "disconnected" | "skipped" | "error";
  reconnected: boolean;
  detail?: string;
};

async function preflightInstance(params: {
  bridgeUrl: string;
  bridgeApiKey: string;
  instanceId: string;
  apelido?: string;
}): Promise<PreflightResult> {
  const { bridgeUrl, bridgeApiKey, instanceId, apelido } = params;
  const tag = `[preflight] inst=${apelido || instanceId}`;

  let statusRaw = "";
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(bridgeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": bridgeApiKey },
      body: JSON.stringify({ action: "instance_status" }),
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    const data = await res.json().catch(() => ({}));
    statusRaw = String(data?.status || data?.instance?.status || "").toLowerCase();

    if (statusRaw === "connected" || statusRaw === "open") {
      return { status: "connected", reconnected: false, detail: statusRaw };
    }
    if (TERMINAL_OFFLINE_STATUSES.has(statusRaw) || res.status === 401) {
      console.warn(`${tag} ❌ offline confirmado (status=${statusRaw || res.status})`);
      return { status: "disconnected", reconnected: false, detail: statusRaw || `http_${res.status}` };
    }
    // connecting / qr / vazio / desconhecido → NÃO envia. Fail-safe.
    console.warn(`${tag} ⛔ not_ready (status=${statusRaw || "vazio"}) — sessão não comprovada, pulando esta instância`);
    return { status: "not_ready", reconnected: false, detail: statusRaw || "no_status" };
  } catch (err) {
    console.warn(`${tag} ⚠️ erro ao consultar status (not_ready):`, (err as Error).message);
    return { status: "not_ready", reconnected: false, detail: (err as Error).message };
  }
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    const payload = await req.json();
    // Modo "retry só falhas": reseta itens com status='falha' para 'pendente' e segue como resume.
    if (payload.retry_failed_dispatch_id) {
      const dispatchId = payload.retry_failed_dispatch_id as string;
      // Verifica ownership via auth
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
      }
      const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
      }
      const { data: disp } = await adminClient
        .from("whatsapp_dispatches").select("id, client_id").eq("id", dispatchId).maybeSingle();
      if (!disp) {
        return new Response(JSON.stringify({ error: "Dispatch not found" }), { status: 404, headers: corsHeaders });
      }
      const { data: ownerCheck } = await adminClient
        .from("clients").select("id").eq("id", disp.client_id).eq("user_id", user.id).maybeSingle();
      if (!ownerCheck) {
        return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
      }
      const { data: resetItems, error: resetErr } = await adminClient
        .from("whatsapp_dispatch_items")
        .update({ status: "pendente", erro: null, enviado_em: null })
        .eq("dispatch_id", dispatchId)
        .eq("status", "falha")
        .select("id");
      if (resetErr) {
        return new Response(JSON.stringify({ error: `Falha ao resetar itens: ${resetErr.message}` }), { status: 500, headers: corsHeaders });
      }
      const resetCount = resetItems?.length || 0;
      if (resetCount === 0) {
        return new Response(JSON.stringify({ retried: 0, message: "Nenhum item com status 'falha' para reenviar." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Recoloca dispatch como em_andamento e reaproveita fluxo resume
      await adminClient.from("whatsapp_dispatches")
        .update({ status: "em_andamento" }).eq("id", dispatchId);
      payload.resume_dispatch_id = dispatchId;
      payload.retry_failed_dispatch_id = undefined;
      console.log(`[retry-failed] dispatch=${dispatchId} reset=${resetCount}`);
    }
    const isResume = !!payload.resume_dispatch_id;
    const isRetryQueue = !!payload.retry_queue_id;
    const isPromoteQueue = payload.action === "promote_queue";

    const invokeResumeDispatch = async (dispatchId: string, delayMs = 0) => {
      try {
        if (delayMs > 0) await sleep(delayMs);
        const fnUrl = `${supabaseUrl}/functions/v1/send-whatsapp-dispatch`;
        const res = await fetch(fnUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceKey}`,
            "apikey": serviceKey,
          },
          body: JSON.stringify({ resume_dispatch_id: dispatchId }),
        });
        if (!res.ok) {
          console.warn(`[resume] auto-invoke dispatch=${dispatchId} falhou status=${res.status}`);
        }
      } catch (e) {
        console.warn(`[resume] auto-invoke dispatch=${dispatchId} erro:`, (e as Error).message);
      }
    };

    // Anti-loop de auto-resume: se o disparo já foi retomado 250+ vezes,
    // pausa com status manual para intervenção — evita cadeia infinita de
    // invocações da própria função no worker.
    const MAX_RESUMES = 250;
    const guardResumeLimit = async (
      client: any,
      dispatchId: string,
      sentSoFar: number,
      failedSoFar: number,
    ): Promise<boolean> => {
      try {
        const { data: row } = await client
          .from("whatsapp_dispatches")
          .select("resume_count")
          .eq("id", dispatchId)
          .maybeSingle();
        const nextCount = Number(row?.resume_count || 0) + 1;
        if (nextCount > MAX_RESUMES) {
          await client.from("whatsapp_dispatches").update({
            enviados: sentSoFar,
            falhas: failedSoFar,
            status: "pausado_limite_resumos",
            pause_reason: `Limite de ${MAX_RESUMES} retomadas automáticas atingido. Retome manualmente após revisar.`,
            updated_at: new Date().toISOString(),
          }).eq("id", dispatchId);
          console.warn(`[resume] dispatch=${dispatchId} atingiu MAX_RESUMES=${MAX_RESUMES}`);
          return true;
        }
        await client.from("whatsapp_dispatches")
          .update({ resume_count: nextCount })
          .eq("id", dispatchId);
      } catch (e) {
        console.warn(`[resume] guardResumeLimit erro dispatch=${dispatchId}:`, (e as Error).message);
      }
      return false;
    };

    // Helper: promove o próximo disparo enfileirado do cliente, se houver, e
    // dispara o processamento internamente (auto-invoke via fetch da própria função).
    const promoteNextQueued = async (cid: string) => {
      try {
        // Só promove se NÃO houver outro disparo ativo agora
        const { data: active } = await adminClient
        .from("whatsapp_dispatches")
        .select("id")
          .eq("client_id", cid)
          .in("status", ["enviando","pendente","pausado_timeout","pausado_janela","pausado_sem_instancia","pausado_manual"])
          .limit(1);
        if (active && active.length > 0) return null;

        const { data: next } = await adminClient
          .from("whatsapp_dispatches")
          .select("id")
          .eq("client_id", cid)
          .eq("status", "enfileirado")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (!next) return null;

        await adminClient.from("whatsapp_dispatches").update({
          status: "enviando",
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", next.id);

        // Auto-invoke modo resume para processar o próximo
        const edgeRuntime = (globalThis as any).EdgeRuntime;
        if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(invokeResumeDispatch(next.id));
        else void invokeResumeDispatch(next.id);

        console.log(`[promote-queue] cliente=${cid} → próximo=${next.id}`);
        return next.id;
      } catch (e) {
        console.warn("[promote-queue] erro:", (e as Error).message);
        return null;
      }
    };

    // ====== MODO PROMOTE QUEUE (usado pelo frontend após cancelar) ======
    if (isPromoteQueue) {
      const cid = payload.client_id as string;
      if (!cid) {
        return new Response(JSON.stringify({ error: "client_id obrigatório" }), { status: 400, headers: corsHeaders });
      }
      const promoted = await promoteNextQueued(cid);
      return new Response(JSON.stringify({ success: true, promoted_dispatch_id: promoted }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ====== MODO RETRY QUEUE (chamado pelo cron resume_whatsapp_on_reconnect) ======
    // Envio único proveniente da fila de retentativas. Não cria registro de dispatch
    // — apenas tenta entregar usando uma instância conectada do pool. Em caso de
    // falha definitiva (tentativas esgotadas) marca o item como falha_definitiva.
    if (isRetryQueue) {
      const queueId = payload.retry_queue_id as string;
      const queueClientId = payload.client_id as string;
      const queueMsg = String(payload.mensagem || "");
      const queueMediaUrl = (payload.media_url as string | null) || null;
      const queueMediaKind = (payload.media_kind as "image" | "video" | "document" | null) || null;
      const queueMediaFilename = (payload.media_filename as string | null) || null;
      const queueMediaMime = (payload.media_mime as string | null) || null;
      const queueRecipient = (payload.recipients?.[0] || {}) as { telefone?: string; nome?: string };

      if (!queueClientId || !queueRecipient.telefone || !queueMsg) {
        return new Response(JSON.stringify({ error: "retry queue payload inválido" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Carrega item para conferir status atual e limites
      const { data: queueItem } = await adminClient
        .from("whatsapp_send_retry_queue")
        .select("id, attempts, max_attempts, status")
        .eq("id", queueId)
        .maybeSingle();
      if (!queueItem || queueItem.status !== "pendente") {
        return new Response(JSON.stringify({ skipped: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Escolhe instância saudável
      const { data: pickedId } = await adminClient
        .rpc("pick_healthy_whatsapp_instance", { p_client_id: queueClientId });
      if (!pickedId) {
        // Sem instância: reagenda 5min sem consumir tentativa extra
        await adminClient.from("whatsapp_send_retry_queue").update({
          attempts: Math.max(0, (queueItem.attempts || 1) - 1), // desfaz incremento do cron
          next_attempt_at: new Date(Date.now() + 5 * 60_000).toISOString(),
          last_error: "Nenhuma instância conectada disponível",
        }).eq("id", queueId);
        return new Response(JSON.stringify({ requeued: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: inst } = await adminClient
        .from("whatsapp_instances")
        .select("id, bridge_url, bridge_api_key")
        .eq("id", pickedId)
        .maybeSingle();
      if (!inst?.bridge_url || !inst?.bridge_api_key) {
        await adminClient.from("whatsapp_send_retry_queue").update({
          next_attempt_at: new Date(Date.now() + 5 * 60_000).toISOString(),
          last_error: "Instância selecionada sem credenciais",
        }).eq("id", queueId);
        return new Response(JSON.stringify({ requeued: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      try {
        const personalizedMsg = renderMessage(queueMsg, { nome: queueRecipient.nome ?? "" }).text;
        const phoneClean = cleanPhoneForBridge(queueRecipient.telefone);

        // Preflight
        const pre = await preflightInstance({
          bridgeUrl: inst.bridge_url, bridgeApiKey: inst.bridge_api_key, instanceId: inst.id,
        });
        if (pre.status === "disconnected") {
          await adminClient.from("whatsapp_instances")
            .update({ status: "disconnected" }).eq("id", inst.id);
          await adminClient.from("whatsapp_send_retry_queue").update({
            next_attempt_at: new Date(Date.now() + 3 * 60_000).toISOString(),
            last_error: `Preflight: instância offline (${pre.detail || "sem status"})`,
          }).eq("id", queueId);
          return new Response(JSON.stringify({ requeued: true, reason: "preflight" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { res: sendRes, data: sendData } = await fetchBridgeSend({
          bridgeUrl: inst.bridge_url, bridgeApiKey: inst.bridge_api_key,
          phone: phoneClean, message: personalizedMsg, mediaUrl: queueMediaUrl,
          mediaKind: queueMediaKind, mediaFilename: queueMediaFilename, mediaMime: queueMediaMime,
        });
        const failure = getSendFailure(sendRes, sendData);

        if (!failure) {
          await adminClient.from("whatsapp_send_retry_queue").update({
            status: "enviado", enviado_em: new Date().toISOString(), last_error: null,
          }).eq("id", queueId);
          await adminClient.rpc("log_whatsapp_send", {
            p_instance_id: inst.id, p_client_id: queueClientId,
            p_dispatch_id: null, p_success: true, p_error_message: null,
            p_preflight_status: pre.status, p_preflight_reconnected: pre.reconnected,
          });
          return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Falha — verifica se chegou ao limite ou se reagenda com backoff
        const newAttempts = queueItem.attempts || 1;
        const willGiveUp = newAttempts >= (queueItem.max_attempts || 8);
        const backoffMin = Math.min(60, Math.pow(2, newAttempts)); // 2,4,8,16,32,60...
        await adminClient.from("whatsapp_send_retry_queue").update({
          status: willGiveUp ? "falha_definitiva" : "pendente",
          next_attempt_at: willGiveUp ? null : new Date(Date.now() + backoffMin * 60_000).toISOString(),
          last_error: String(failure).slice(0, 300),
        }).eq("id", queueId);
        await adminClient.rpc("log_whatsapp_send", {
          p_instance_id: inst.id, p_client_id: queueClientId,
          p_dispatch_id: null, p_success: false,
          p_error_message: String(failure).slice(0, 200),
          p_preflight_status: pre.status, p_preflight_reconnected: pre.reconnected,
        });
        return new Response(JSON.stringify({ retried: true, gave_up: willGiveUp }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        const newAttempts = queueItem.attempts || 1;
        const willGiveUp = newAttempts >= (queueItem.max_attempts || 8);
        const backoffMin = Math.min(60, Math.pow(2, newAttempts));
        await adminClient.from("whatsapp_send_retry_queue").update({
          status: willGiveUp ? "falha_definitiva" : "pendente",
          next_attempt_at: willGiveUp ? null : new Date(Date.now() + backoffMin * 60_000).toISOString(),
          last_error: String(err).slice(0, 300),
        }).eq("id", queueId);
        return new Response(JSON.stringify({ retried: true, error: String(err) }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ====== MODO RESUME (chamado pelo cron) ======
    let client_id: string;
    let titulo: string;
    let mensagem: string;
    let tipo: string;
    let tag_filtro: string | null;
    let batch_size: number | undefined;
    let delay_min: number | undefined;
    let delay_max: number | undefined;
    let batch_pause: number | undefined;
    let existingDispatchId: string | null = null;
    let media_url: string | null = null;
    let media_kind: "image" | "video" | "document" | null = null;
    let media_filename: string | null = null;
    let media_mime: string | null = null;
    // Anti-ban: configuração de humanização e CTA carregada por disparo.
    let humanizationConfig: Record<string, any> = {};
    let ctaConfig: { auto_append?: boolean; categories?: CtaCategory[] } = {};

    if (isResume) {
      const { data: d } = await adminClient
        .from("whatsapp_dispatches")
        .select("*")
        .eq("id", payload.resume_dispatch_id)
        .single();
      if (!d) {
        return new Response(JSON.stringify({ error: "Dispatch not found" }), { status: 404, headers: corsHeaders });
      }
      if (d.status === "cancelado") {
        return new Response(JSON.stringify({ skipped: true, reason: "cancelado" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      client_id = d.client_id;
      titulo = d.titulo;
      mensagem = d.mensagem_template;
      media_url = (d.media_url as string | null) || null;
      tipo = d.tipo;
      tag_filtro = d.tag_filtro;
      batch_size = d.batch_size;
      delay_min = d.delay_min_seconds;
      delay_max = d.delay_max_seconds;
      batch_pause = d.batch_pause_seconds;
      humanizationConfig = (d.humanization_config as any) || {};
      ctaConfig = (d.cta_config as any) || {};
      // Metadados de mídia (kind/filename/mime) ficam em humanization_config.media_meta
      // para não exigir migração — retrocompat: undefined = image.
      const mediaMeta = (humanizationConfig?.media_meta as any) || {};
      media_kind = (mediaMeta.kind as any) || null;
      media_filename = (mediaMeta.filename as string | null) || null;
      media_mime = (mediaMeta.mime as string | null) || null;
      existingDispatchId = d.id;
      // Overrides opcionais do disparo (Entrega 4): quantas instâncias usar e se ignora cap de aquecimento.
      var dispatchMaxInstances: number | null = (d.max_instances as number | null) ?? null;
      var dispatchIgnoreStageCap: boolean = !!d.ignore_stage_cap;
      await adminClient.from("whatsapp_dispatches").update({
        status: "enviando",
        pause_reason: null,
        paused_until: null,
        started_at: d.started_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", d.id);
    } else {
      // ====== MODO NOVO DISPARO (chamado pelo usuário) ======
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
      }
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: authErr } = await userClient.auth.getUser();
      if (authErr || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
      }
      ({ client_id, titulo, mensagem, tipo, tag_filtro, batch_size, delay_min, delay_max, batch_pause } = payload);
      media_url = (payload.media_url as string | null) || null;
      media_kind = (payload.media_kind as any) || null;
      media_filename = (payload.media_filename as string | null) || null;
      media_mime = (payload.media_mime as string | null) || null;
      humanizationConfig = (payload.humanization_config as any) || {};
      ctaConfig = (payload.cta_config as any) || {};
      // Guarda meta de mídia dentro de humanization_config (sem coluna nova).
      if (media_url && (media_kind || media_filename || media_mime)) {
        humanizationConfig = {
          ...humanizationConfig,
          media_meta: {
            kind: media_kind || "image",
            filename: media_filename || null,
            mime: media_mime || null,
          },
        };
      }
      // Marca teste (não afeta motor — só rastreia no log).
      if (payload.is_test === true) {
        humanizationConfig = { ...humanizationConfig, is_test: true };
      }
      var dispatchMaxInstances: number | null = (payload.max_instances as number | null) ?? null;
      var dispatchIgnoreStageCap: boolean = !!payload.ignore_stage_cap;
      var eleicao_tipo = payload.eleicao_tipo || null;
      var eleicao_escopo = payload.eleicao_escopo || null;
      var eleicao_regiao = payload.eleicao_regiao || null;
      var eleicao_cidade = payload.eleicao_cidade || null;

      // Verify ownership
      const { data: ownerCheck } = await adminClient
        .from("clients")
        .select("id")
        .eq("id", client_id)
        .eq("user_id", user.id)
        .single();
      if (!ownerCheck) {
        return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
      }
    }

    const BATCH_SIZE = batch_size || DEFAULT_BATCH_SIZE;
    const DELAY_MIN_MS = (delay_min || DEFAULT_DELAY_MIN) * 1000;
    const DELAY_MAX_MS = (delay_max || DEFAULT_DELAY_MAX) * 1000;
    const BATCH_PAUSE_MS = (batch_pause || DEFAULT_BATCH_PAUSE) * 1000;

    // Get bridge config + window settings + CTAs personalizados do cliente
    const { data: clientData } = await adminClient
      .from("clients")
      .select("id, whatsapp_bridge_url, whatsapp_bridge_api_key, whatsapp_window_enabled, whatsapp_window_start, whatsapp_window_end, whatsapp_inter_instance_delay_min, whatsapp_inter_instance_delay_max, response_ctas")
      .eq("id", client_id)
      .single();
    if (!clientData) {
      return new Response(JSON.stringify({ error: "Client not found" }), { status: 404, headers: corsHeaders });
    }

    // Anti-ban: helper que renderiza a mensagem para cada destinatário
    // (spintax + placeholders + CTA + preservação de URL).
    // Retrocompatível: template sem spintax/placeholders/CTA → saída idêntica ao antigo replace.
    const clientCtas = ((clientData as any).response_ctas as Cta[] | null) || [];
    const ctaCategories = (ctaConfig?.categories && Array.isArray(ctaConfig.categories))
      ? ctaConfig.categories
      : undefined;
    const ctaAutoAppend = ctaConfig?.auto_append === true;
    const recentCtaIds = new Set<string>();

    function renderForRecipient(template: string, r: { nome?: string | null; telefone?: string | null }): {
      text: string;
      ctaUsed: string | null;
    } {
      // Sorteia CTA (se auto_append ou se template contém {cta_resposta})
      const needsCta = ctaAutoAppend || template.includes("{cta_resposta}");
      let ctaText: string | null = null;
      if (needsCta) {
        const picked = pickCta(clientCtas, ctaCategories, { avoidIds: recentCtaIds });
        if (picked) {
          ctaText = picked.text;
          recentCtaIds.add(picked.id);
          if (recentCtaIds.size > 5) {
            // mantém janela pequena para não zerar o pool em disparos grandes
            const first = recentCtaIds.values().next().value;
            if (first) recentCtaIds.delete(first);
          }
        }
      }
      const ctx: RenderContext = {
        cta: ctaText,
        autoAppendCta: ctaAutoAppend,
        assinaturas: Array.isArray(humanizationConfig?.assinaturas) ? humanizationConfig.assinaturas : undefined,
      };
      const out = renderMessage(template, r as VarRecipient, ctx);
      return { text: out.text, ctaUsed: out.ctaUsed };
    }


    // Verifica se há pelo menos uma instância no pool ou bridge legada
    const { count: poolCount } = await adminClient
      .from("whatsapp_instances")
      .select("id", { count: "exact", head: true })
      .eq("client_id", client_id)
      .eq("is_active", true)
      .eq("status", "connected");

    const hasLegacyBridge = !!(clientData.whatsapp_bridge_url && clientData.whatsapp_bridge_api_key);
    const { count: managedInstanceCount } = await adminClient
      .from("whatsapp_instances")
      .select("id", { count: "exact", head: true })
      .eq("client_id", client_id)
      .eq("is_active", true);

    if ((poolCount ?? 0) === 0 && !hasLegacyBridge) {
      return new Response(
        JSON.stringify({ error: "Nenhuma instância WhatsApp conectada. Configure uma instância antes de disparar." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const windowEnabled = clientData.whatsapp_window_enabled !== false;
    const windowStart = clientData.whatsapp_window_start || "08:00:00";
    const windowEnd = clientData.whatsapp_window_end || "22:00:00";
    const interMin = (clientData.whatsapp_inter_instance_delay_min ?? 1) * 1000;
    const interMax = (clientData.whatsapp_inter_instance_delay_max ?? 3) * 1000;

    // Build recipient list — em modo resume usa items pendentes; senão, busca por tipo
    let recipients: { telefone?: string; nome: string; group_jid?: string; mensagem_personalizada?: string; indicador_id?: string }[] = [];
    let dispatch: any;

    // Lista de JIDs de grupos vinda do payload (modo "grupos")
    const groupJids: string[] = Array.isArray(payload.group_jids)
      ? payload.group_jids.filter((j: any) => typeof j === "string" && j.endsWith("@g.us"))
      : [];

    if (isResume && existingDispatchId) {
      const { data: pendingItems } = await adminClient
        .from("whatsapp_dispatch_items")
        .select("telefone, nome, group_jid, mensagem_personalizada")
        .eq("dispatch_id", existingDispatchId)
        .eq("status", "pendente");
      recipients = (pendingItems || []).map((r: any) => ({
        telefone: r.telefone || undefined,
        nome: r.nome || "",
        group_jid: r.group_jid || undefined,
        mensagem_personalizada: r.mensagem_personalizada || undefined,
      }));
      dispatch = { id: existingDispatchId };
      console.log(`[resume] dispatch=${existingDispatchId} pending=${recipients.length}`);
    } else if (tipo === "grupos") {
      if (groupJids.length > 0) {
        const { data: gs } = await adminClient
          .from("whatsapp_groups")
          .select("group_jid, name")
          .eq("client_id", client_id)
          .in("group_jid", groupJids);
        const nameByJid = new Map((gs || []).map((g: any) => [g.group_jid, g.name]));
        recipients = groupJids.map((jid) => ({
          group_jid: jid,
          nome: nameByJid.get(jid) || jid,
        }));
      }
    } else if (tipo === "eleicao") {
      let q = adminClient.from("eleicao_pessoas")
        .select("telefone, nome")
        .eq("client_id", client_id)
        .not("telefone", "is", null);
      if (eleicao_tipo) q = q.eq("tipo", eleicao_tipo);
      if (eleicao_escopo) q = q.eq("escopo", eleicao_escopo);
      if (eleicao_regiao) q = q.eq("regiao", eleicao_regiao);
      if (eleicao_cidade) q = q.eq("cidade", eleicao_cidade);
      const { data } = await q;
      recipients = (data || []).map((r: any) => ({ telefone: r.telefone, nome: r.nome }));
    } else if (tipo === "funcionarios") {
      const { data } = await adminClient
        .from("funcionarios")
        .select("telefone, nome")
        .eq("client_id", client_id)
        .eq("status", "ativo")
        .not("telefone", "is", null);
      recipients = (data || []).map((r: any) => ({ telefone: r.telefone, nome: r.nome }));
    } else if (tipo === "contratados") {
      const { data } = await adminClient
        .from("contratados")
        .select("telefone, nome")
        .eq("client_id", client_id)
        .eq("status", "ativo")
        .not("telefone", "is", null);
      recipients = (data || []).map((r: any) => ({ telefone: r.telefone, nome: r.nome }));
    } else if (tipo === "apoiadores") {
      const { data } = await adminClient
        .from("pessoas")
        .select("telefone, nome")
        .eq("client_id", client_id)
        .eq("tipo_pessoa", "apoiador")
        .not("telefone", "is", null)
        .limit(2000);
      recipients = (data || []).map((r: any) => ({ telefone: r.telefone, nome: r.nome }));
    } else if (tipo === "indicadores_cobranca") {
      // ====== Cobrança em massa de indicadores ======
      const cf = (payload.cobranca_filtros || {}) as {
        tipo?: "coordenador" | "lider" | "cabo";
        status?: "all" | "zerados" | "abaixo" | "ok";
        indicador_ids?: string[];
      };
      const candidatoNome = (payload.cobranca_candidato as string) || "";
      const janelaHoras = Number(payload.cobranca_janela_horas) || 0;
      const testePhone = (payload.cobranca_teste_telefone as string) || "";
      const cascata = !!payload.cobranca_cascata;

      const matchStatus = (r: any) => {
        if (cf.status === "zerados") return (r.total_indicacoes || 0) === 0;
        if (cf.status === "abaixo") return (r.total_indicacoes || 0) < (r.meta || 0);
        if (cf.status === "ok") return (r.total_indicacoes || 0) >= (r.meta || 0);
        return true;
      };

      // Em modo cascata, precisamos do universo completo para resolver descendentes
      let q = adminClient
        .from("v_eleicao_indicadores_cobranca")
        .select("indicador_id, nome, telefone, token, total_indicacoes, meta, tipo, ultima_cobranca_em, parent_id")
        .eq("client_id", client_id)
        .not("telefone", "is", null);
      if (cf.tipo && !cascata) q = q.eq("tipo", cf.tipo);
      if (Array.isArray(cf.indicador_ids) && cf.indicador_ids.length > 0 && !cascata) {
        q = q.in("indicador_id", cf.indicador_ids);
      }
      const { data: rowsRaw } = await q.limit(10000);
      const allRows = (rowsRaw || []) as any[];

      let rows: any[];
      if (cascata) {
        // Sementes: linhas que batem com filtro tipo + ids (ou todas) e status
        const idsFilter = (Array.isArray(cf.indicador_ids) && cf.indicador_ids.length > 0)
          ? new Set(cf.indicador_ids) : null;
        const seeds = allRows.filter((r) =>
          (!cf.tipo || r.tipo === cf.tipo) &&
          (!idsFilter || idsFilter.has(r.indicador_id)) &&
          matchStatus(r)
        );
        // Expande descendentes (todos os níveis), aplicando o mesmo status
        const childrenByParent = new Map<string, any[]>();
        for (const r of allRows) {
          if (!r.parent_id) continue;
          const list = childrenByParent.get(r.parent_id) || [];
          list.push(r);
          childrenByParent.set(r.parent_id, list);
        }
        const selected = new Map<string, any>();
        const queue = [...seeds];
        while (queue.length) {
          const cur = queue.shift()!;
          if (selected.has(cur.indicador_id)) continue;
          selected.set(cur.indicador_id, cur);
          const kids = childrenByParent.get(cur.indicador_id) || [];
          for (const k of kids) if (matchStatus(k)) queue.push(k);
        }
        rows = Array.from(selected.values());
      } else {
        rows = allRows.filter(matchStatus);
      }

      // Janela "não reenviar nas últimas X horas"
      if (janelaHoras > 0 && !testePhone) {
        const cutoff = Date.now() - janelaHoras * 3600 * 1000;
        rows = rows.filter((r) => !r.ultima_cobranca_em || new Date(r.ultima_cobranca_em).getTime() < cutoff);
      }

      // Gera token para quem não tem (modo teste: só o 1º)
      const toEnsureTokens = testePhone ? rows.slice(0, 1) : rows;
      for (const r of toEnsureTokens) {
        if (!r.token) {
          const { data: tk } = await adminClient.rpc("eleicao_gerar_token_indicador", {
            _indicador_id: r.indicador_id,
          });
          if (tk) r.token = tk as string;
        }
      }

      const origin = (payload.cobranca_origin as string) || "";
      const render = (tpl: string, r: any) => {
        const primeiro = (r.nome || "").split(" ")[0] || r.nome || "";
        const faltam = Math.max(0, (r.meta || 0) - (r.total_indicacoes || 0));
        const link = r.token ? `${origin}/indicar/${r.token}` : "";
        return tpl
          .replace(/\{primeiro_nome\}/g, primeiro)
          .replace(/\{nome\}/g, r.nome || "")
          .replace(/\{meta\}/g, String(r.meta || 0))
          .replace(/\{total\}/g, String(r.total_indicacoes || 0))
          .replace(/\{faltam\}/g, String(faltam))
          .replace(/\{link\}/g, link)
          .replace(/\{candidato\}/g, candidatoNome);
      };

      if (testePhone) {
        const base = rows.find((r) => !!r.token) || rows[0];
        recipients = base ? [{
          telefone: testePhone,
          nome: `[TESTE] ${base.nome || ""}`,
          mensagem_personalizada: `[TESTE]\n${render(mensagem || "", base)}`,
        }] : [];
      } else {
        recipients = rows
          .filter((r) => !!r.telefone && !!r.token)
          .map((r) => ({
            telefone: r.telefone as string,
            nome: r.nome as string,
            indicador_id: r.indicador_id as string,
            mensagem_personalizada: render(mensagem || "", r),
          }));
      }
    } else if (tipo === "lista_adhoc") {
      // ====== Lista ad-hoc: contatos vindos do payload (importação CSV/XLSX) ======
      const rawList: any[] = Array.isArray(payload.recipients_list) ? payload.recipients_list : [];
      const seen = new Set<string>();
      recipients = [];
      for (const r of rawList) {
        const digits = String(r?.telefone ?? "").replace(/\D/g, "");
        // Aceita 12 ou 13 dígitos com DDI 55; caso venha só DDD+num, prefixa 55.
        let tel = digits;
        if (tel.length === 10 || tel.length === 11) tel = `55${tel}`;
        if (!(tel.length === 12 || tel.length === 13) || !tel.startsWith("55")) continue;
        if (seen.has(tel)) continue;
        seen.add(tel);
        const nome = String(r?.nome ?? "").trim().slice(0, 120) || "Contato";
        recipients.push({ telefone: tel, nome });
        if (recipients.length >= 5000) break; // guarda-corpo
      }
    } else {
      if (tag_filtro) {
        const { data: tagData } = await adminClient
          .from("tags")
          .select("id")
          .eq("client_id", client_id)
          .eq("nome", tag_filtro)
          .single();

        if (tagData) {
          const { data: pessoaTagData } = await adminClient
            .from("pessoas_tags")
            .select("pessoa_id")
            .eq("tag_id", tagData.id);

          const pessoaIds = (pessoaTagData || []).map((pt: any) => pt.pessoa_id);
          if (pessoaIds.length > 0) {
            const { data } = await adminClient
              .from("pessoas")
              .select("telefone, nome")
              .eq("client_id", client_id)
              .in("id", pessoaIds)
              .not("telefone", "is", null);
            recipients = (data || []).map((r: any) => ({ telefone: r.telefone, nome: r.nome }));
          }
        }
      } else {
        const { data } = await adminClient
          .from("pessoas")
          .select("telefone, nome")
          .eq("client_id", client_id)
          .not("telefone", "is", null)
          .limit(2000);
        recipients = (data || []).map((r: any) => ({ telefone: r.telefone, nome: r.nome }));
      }
    }

    if (recipients.length === 0) {
      if (isResume && existingDispatchId) {
        // Sem mais pendentes — finaliza
        const { data: stats } = await adminClient
          .from("whatsapp_dispatch_items")
          .select("status")
          .eq("dispatch_id", existingDispatchId);
        const sent = (stats || []).filter((s: any) => s.status === "enviado").length;
        const failed = (stats || []).filter((s: any) => s.status === "falha").length;
        await adminClient.from("whatsapp_dispatches").update({
          enviados: sent,
          falhas: failed,
          status: "concluido",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", existingDispatchId);
        await promoteNextQueued(client_id);
        return new Response(JSON.stringify({ success: true, completed: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(
        JSON.stringify({ error: "Nenhum destinatário encontrado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Detecta se já existe um disparo ativo para este cliente — nesse caso o
    // novo disparo entra como "enfileirado" e é promovido depois.
    let shouldQueue = false;
    if (!isResume) {
      const { data: activeOnes } = await adminClient
        .from("whatsapp_dispatches")
        .select("id")
        .eq("client_id", client_id)
          .in("status", ["enviando","pendente","pausado_timeout","pausado_janela","pausado_sem_instancia","pausado_manual","enfileirado"])
        .limit(1);
      shouldQueue = !!(activeOnes && activeOnes.length > 0);
    }

    if (!isResume) {
      // Create dispatch record (queued or active)
      const { data: newDispatch, error: dispatchErr } = await adminClient
        .from("whatsapp_dispatches")
        .insert({
          client_id,
          tipo,
          titulo,
          mensagem_template: mensagem,
          total_destinatarios: recipients.length,
          media_url,
          tag_filtro,
          status: shouldQueue ? "enfileirado" : "enviando",
          started_at: shouldQueue ? null : new Date().toISOString(),
          batch_size: BATCH_SIZE,
          delay_min_seconds: Math.round(DELAY_MIN_MS / 1000),
          delay_max_seconds: Math.round(DELAY_MAX_MS / 1000),
          batch_pause_seconds: Math.round(BATCH_PAUSE_MS / 1000),
          humanization_config: humanizationConfig,
          cta_config: ctaConfig,
          max_instances: dispatchMaxInstances,
          ignore_stage_cap: dispatchIgnoreStageCap,
        })
        .select()
        .single();

      if (dispatchErr || !newDispatch) {
        throw new Error("Failed to create dispatch: " + dispatchErr?.message);
      }
      dispatch = newDispatch;

      // Create dispatch items (status=pendente por padrão)
      const items = recipients.map((r) => ({
        dispatch_id: dispatch.id,
        telefone: r.telefone || null,
        nome: r.nome,
        group_jid: r.group_jid || null,
        mensagem_personalizada: r.mensagem_personalizada || null,
      }));

      for (let i = 0; i < items.length; i += 100) {
        await adminClient.from("whatsapp_dispatch_items").insert(items.slice(i, i + 100));
      }

      // Se entrou na fila, retorna sem processar — será promovido quando o atual terminar
      if (shouldQueue) {
        return new Response(
          JSON.stringify({ success: true, dispatch_id: dispatch.id, total: recipients.length, queued: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const processDispatch = async () => {
      try {
      // Em modo resume começamos contadores a partir do que já foi feito
      const { data: prevStats } = await adminClient
        .from("whatsapp_dispatch_items")
        .select("status")
        .eq("dispatch_id", dispatch.id);
      let sent = (prevStats || []).filter((s: any) => s.status === "enviado").length;
      let failed = (prevStats || []).filter((s: any) => s.status === "falha").length;
      let lastInstanceId: string | null = null;
      // Cache do último preflight por instância (resetado se trocar de chip).
      let preflightByInstance: Record<string, PreflightResult> = {};
      const preflightCacheAt: Record<string, number> = {};
      // Instâncias já tentadas (e que falharam) para um group_jid neste disparo.
      // Permite failover: se a instância X falha ao enviar pro grupo G,
      // não tenta de novo com X nesse mesmo grupo.
      const excludedByGroup: Record<string, Set<string>> = {};

      // ==== Entrega 3/4: anti-ban helpers ====
      // Cap diário por stage (override por instância via stage_daily_cap).
      // Se o disparo estiver marcado com ignore_stage_cap, o cap efetivo vira Infinity
      // (o daily_send_limit da instância continua valendo, se configurado explicitamente).
      const STAGE_DEFAULT_CAP: Record<string, number> = { novo: 40, aquecendo: 150, maduro: 400 };
      const ignoreStageCap = !!(typeof dispatchIgnoreStageCap !== "undefined" && dispatchIgnoreStageCap);
      const maxInstancesForDispatch: number | null =
        typeof dispatchMaxInstances !== "undefined" && dispatchMaxInstances && dispatchMaxInstances > 0
          ? dispatchMaxInstances : null;
      const effectiveCap = (inst: { ramp_up_stage?: string | null; stage_daily_cap?: number | null; daily_send_limit?: number | null }) => {
        if (ignoreStageCap) return Number.POSITIVE_INFINITY;
        if (inst.stage_daily_cap && inst.stage_daily_cap > 0) return inst.stage_daily_cap;
        const stage = (inst.ramp_up_stage as string) || "maduro";
        return STAGE_DEFAULT_CAP[stage] ?? (inst.daily_send_limit || 400);
      };
      // Instâncias que atingiram o cap NESTE disparo — não são escolhidas de novo.
      const cappedInstances = new Set<string>();
      // Circuit breaker: contagem de falhas de rede/ponte consecutivas por instância.
      const bridgeFailStreak: Record<string, number> = {};
      const CIRCUIT_BREAKER_THRESHOLD = 2;
      // Sticky: cache em memória do último chip usado por telefone (evita re-consulta).
      const stickyByPhone: Record<string, string> = {};

      // Se o usuário limitou o número de instâncias no disparo, pré-selecionamos
      // as top-N conectadas (primárias primeiro, depois menos usadas hoje) e usamos
      // apenas essas — qualquer outra que a lógica escolher é descartada.
      let allowedInstanceIds: Set<string> | null = null;
      if (maxInstancesForDispatch) {
        const { data: pool } = await adminClient
          .from("whatsapp_instances")
          .select("id, is_primary, messages_sent_today")
          .eq("client_id", client_id)
          .eq("is_active", true)
          .eq("status", "connected")
          .is("suspected_banned_at", null)
          .not("bridge_api_key", "is", null)
          .order("is_primary", { ascending: false })
          .order("messages_sent_today", { ascending: true })
          .limit(maxInstancesForDispatch);
        allowedInstanceIds = new Set((pool || []).map((p: any) => p.id));
        console.log(`[dispatch] max_instances=${maxInstancesForDispatch} — pool restrito a ${allowedInstanceIds.size} instância(s): ${Array.from(allowedInstanceIds).join(",")}`);
      }



      for (let batch = 0; batch < Math.ceil(recipients.length / BATCH_SIZE); batch++) {
        // Checa se o disparo foi cancelado pelo usuário
        const { data: statusCheck } = await adminClient
          .from("whatsapp_dispatches").select("status").eq("id", dispatch.id).maybeSingle();
        if (statusCheck?.status === "cancelado") {
          console.log(`[dispatch] ${dispatch.id} cancelado pelo usuário — interrompendo loop`);
          return;
        }
        if (Date.now() - startTime > MAX_RUNTIME_MS) {
          if (await guardResumeLimit(adminClient, dispatch.id, sent, failed)) return;
          const totalKnown = recipients.length + sent + failed;
          await adminClient.from("whatsapp_dispatches").update({
            enviados: sent,
            falhas: failed,
            status: "pausado_timeout",
            pause_reason: `Ciclo automático concluído (${sent}/${totalKnown} enviados). Continuando em ~30s…`,
            paused_until: new Date(Date.now() + 30_000).toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("id", dispatch.id);
          const edgeRuntime = (globalThis as any).EdgeRuntime;
          if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(invokeResumeDispatch(dispatch.id, 30_000));
          else void invokeResumeDispatch(dispatch.id, 30_000);
          return;
        }

        const batchStart = batch * BATCH_SIZE;
        const batchItems = recipients.slice(batchStart, batchStart + BATCH_SIZE);

        for (const recipient of batchItems) {
          // Checa cancelamento a cada N envios para responder rápido
          if ((sent + failed) % 5 === 0) {
            const { data: sc } = await adminClient
              .from("whatsapp_dispatches").select("status").eq("id", dispatch.id).maybeSingle();
            if (sc?.status === "cancelado") {
              console.log(`[dispatch] ${dispatch.id} cancelado pelo usuário — interrompendo`);
              return;
            }
          }
          if (Date.now() - startTime > MAX_RUNTIME_MS) {
            if (await guardResumeLimit(adminClient, dispatch.id, sent, failed)) return;
            const totalKnown2 = recipients.length + sent + failed;
            await adminClient.from("whatsapp_dispatches").update({
              enviados: sent,
              falhas: failed,
              status: "pausado_timeout",
              pause_reason: `Ciclo automático concluído (${sent}/${totalKnown2} enviados). Continuando em ~30s…`,
              paused_until: new Date(Date.now() + 30_000).toISOString(),
              updated_at: new Date().toISOString(),
            }).eq("id", dispatch.id);
            const edgeRuntime = (globalThis as any).EdgeRuntime;
            if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(invokeResumeDispatch(dispatch.id, 30_000));
            else void invokeResumeDispatch(dispatch.id, 30_000);
            return;
          }

          // ==== Janela horária ====
          if (windowEnabled && !isWithinWindow(windowStart, windowEnd)) {
            await adminClient.from("whatsapp_dispatches").update({
              status: "pausado_janela",
              pause_reason: `Fora da janela de envio (${windowStart.slice(0,5)}-${windowEnd.slice(0,5)})`,
              enviados: sent,
              falhas: failed,
              updated_at: new Date().toISOString(),
            }).eq("id", dispatch.id);
            return;
          }

          // Tipo do destino: grupo ou telefone individual
          const isGroup = !!recipient.group_jid;
          const groupJid = recipient.group_jid || "";
          const destination = isGroup
            ? groupJid
            : cleanPhoneForBridge(recipient.telefone || "");
          // Helper para localizar este item específico no banco
          const itemMatch = (q: any) => {
            const base = q.eq("dispatch_id", dispatch.id);
            return isGroup
              ? base.eq("group_jid", groupJid)
              : base.eq("telefone", recipient.telefone);
          };

          // Failover: para grupos tentamos até MAX tentativas excluindo a
          // instância que acabou de falhar. Para telefones, 1 tentativa.
          const MAX_ATTEMPTS = isGroup ? 5 : 1;
          let recipientResolved = false;
          let attempt = 0;
          let currentStage: string = "maduro";

          while (!recipientResolved && attempt < MAX_ATTEMPTS) {
            attempt++;

            // ==== Escolhe instância saudável ====
            let bridgeUrl: string | null = null;
            let bridgeApiKey: string | null = null;
            let instanceId: string | null = null;


            if (isGroup) {
              // Para grupos, escolhe SÓ entre instâncias que são membros
              const excludeArr = Array.from(excludedByGroup[groupJid] ?? []);
              const { data: pickedId } = await adminClient.rpc(
                "pick_healthy_instance_for_group",
                {
                  p_client_id: client_id,
                  p_group_jid: groupJid,
                  p_exclude_instance_ids: excludeArr,
                },
              );
              if (pickedId) {
                const { data: inst } = await adminClient
                  .from("whatsapp_instances")
                  .select("id, bridge_url, bridge_api_key, ramp_up_stage")
                  .eq("id", pickedId)
                  .maybeSingle();
                if (inst?.bridge_url && inst?.bridge_api_key) {
                  bridgeUrl = inst.bridge_url;
                  bridgeApiKey = inst.bridge_api_key;
                  instanceId = inst.id;
                  currentStage = inst.ramp_up_stage || "maduro";
                }
              }
            } else {
              // ==== Sticky por destinatário ====
              // Se este telefone já recebeu de uma instância saudável neste cliente,
              // reusa. Preserva histórico de conversa → menor risco de sinalização.
              const phoneKey = String(recipient.telefone || "");
              if (phoneKey && !instanceId) {
                let stickyId: string | null = stickyByPhone[phoneKey] || null;
                if (!stickyId) {
                  const { data: last } = await adminClient
                    .from("whatsapp_dispatch_items")
                    .select("instance_id")
                    .eq("telefone", phoneKey)
                    .eq("status", "enviado")
                    .not("instance_id", "is", null)
                    .order("enviado_em", { ascending: false })
                    .limit(1)
                    .maybeSingle();
                  stickyId = (last as any)?.instance_id || null;
                  if (stickyId) stickyByPhone[phoneKey] = stickyId;
                }
                if (stickyId && !cappedInstances.has(stickyId)) {
                  const { data: stickyInst } = await adminClient
                    .from("whatsapp_instances")
                    .select("id, bridge_url, bridge_api_key, ramp_up_stage, stage_daily_cap, daily_send_limit, messages_sent_today, is_active, status, suspected_banned_at")
                    .eq("id", stickyId)
                    .maybeSingle();
                  if (
                    stickyInst && stickyInst.is_active && stickyInst.status === "connected" &&
                    !stickyInst.suspected_banned_at && stickyInst.bridge_url && stickyInst.bridge_api_key &&
                    (stickyInst.messages_sent_today || 0) < effectiveCap(stickyInst)
                  ) {
                    bridgeUrl = stickyInst.bridge_url;
                    bridgeApiKey = stickyInst.bridge_api_key;
                    instanceId = stickyInst.id;
                    currentStage = stickyInst.ramp_up_stage || "maduro";
                    console.log(`[sticky] phone=${phoneKey} reuse=${stickyId}`);
                  } else if (stickyInst && (stickyInst.messages_sent_today || 0) >= effectiveCap(stickyInst)) {
                    cappedInstances.add(stickyId);
                  }
                }
              }

              // Telefone individual: pool padrão (com retry se pegou instância no cap).
              if (!bridgeUrl) {
                for (let pickTry = 0; pickTry < 5 && !bridgeUrl; pickTry++) {
                  const { data: pickedId } = await adminClient.rpc(
                    "pick_healthy_whatsapp_instance",
                    { p_client_id: client_id },
                  );
                  if (!pickedId) break;
                  if (cappedInstances.has(pickedId)) {
                    // Cap já atingido neste run — força RPC a olhar outra na próxima iter.
                    // (RPC provavelmente ordena por menos usada; ao atualizar a saúde
                    // via last_send_at ou consecutive_failures elevaria; aqui só marcamos.)
                    continue;
                  }
                  const { data: inst } = await adminClient
                    .from("whatsapp_instances")
                    .select("id, bridge_url, bridge_api_key, ramp_up_stage, stage_daily_cap, daily_send_limit, messages_sent_today")
                    .eq("id", pickedId)
                    .maybeSingle();
                  if (!inst?.bridge_url || !inst?.bridge_api_key) break;
                  if ((inst.messages_sent_today || 0) >= effectiveCap(inst)) {
                    cappedInstances.add(inst.id);
                    console.log(`[cap] instance=${inst.id} atingiu cap diário (${inst.messages_sent_today}/${effectiveCap(inst)}) — pulando`);
                    continue;
                  }
                  bridgeUrl = inst.bridge_url;
                  bridgeApiKey = inst.bridge_api_key;
                  instanceId = inst.id;
                  currentStage = inst.ramp_up_stage || "maduro";
                }
              }
              if (!bridgeUrl) {
                // Fallback: só usa instância explicitamente CONNECTED. Nunca cair para
                // 'disconnected'/'connecting' aqui — isso gera falhas em cascata e
                // aciona o auto-suspect (>=10 falhas em 15min derrubam o chip).
                const { data: anyActive } = await adminClient
                  .from("whatsapp_instances")
                  .select("id, bridge_url, bridge_api_key, status, ramp_up_stage, stage_daily_cap, daily_send_limit, messages_sent_today")
                  .eq("client_id", client_id)
                  .eq("is_active", true)
                  .eq("status", "connected")
                  .is("suspected_banned_at", null)
                  .not("bridge_api_key", "is", null)
                  .order("consecutive_failures", { ascending: true })
                  .limit(5);
                const usable = (anyActive || []).find((a: any) =>
                  !cappedInstances.has(a.id) && (a.messages_sent_today || 0) < effectiveCap(a)
                );
                if (usable?.bridge_url && usable?.bridge_api_key) {
                  bridgeUrl = usable.bridge_url;
                  bridgeApiKey = usable.bridge_api_key;
                  instanceId = usable.id;
                  currentStage = usable.ramp_up_stage || "maduro";
                }
              }
              if (!bridgeUrl && hasLegacyBridge && (poolCount ?? 0) === 0 && (managedInstanceCount ?? 0) === 0) {
                bridgeUrl = clientData.whatsapp_bridge_url!;
                bridgeApiKey = clientData.whatsapp_bridge_api_key!;
              }
            }

            // Entrega 4: se o disparo limita o número de instâncias, descarta escolhas fora do pool.
            if (allowedInstanceIds && instanceId && !allowedInstanceIds.has(instanceId)) {
              console.log(`[dispatch] instância ${instanceId} fora do pool restrito (max_instances=${maxInstancesForDispatch}) — descartando`);
              bridgeUrl = null;
              bridgeApiKey = null;
              instanceId = null;
            }

            if (!bridgeUrl || !bridgeApiKey) {
              if (isGroup && attempt > 1) {
                // Já tentamos com outras instâncias e esgotamos os membros do grupo
                failed++;
                await itemMatch(adminClient.from("whatsapp_dispatch_items")
                  .update({
                    status: "falha",
                    erro: "Nenhuma outra instância membro deste grupo está disponível (todas as tentativas falharam).",
                  }));
                recipientResolved = true;
                break;
              }
              if (isGroup) {
                // Primeira tentativa e nenhuma instância membro do grupo disponível
                failed++;
                await itemMatch(adminClient.from("whatsapp_dispatch_items")
                  .update({
                    status: "falha",
                    erro: "Nenhuma instância conectada é membro deste grupo. Adicione uma instância ao grupo e sincronize.",
                  }));
                recipientResolved = true;
                break;
              }
              // Sem instância para telefone individual → pausa o disparo
              await adminClient.from("whatsapp_dispatches").update({
                status: "pausado_sem_instancia",
                pause_reason: "Nenhuma instância conectada disponível — retomado automaticamente quando reconectar",
                enviados: sent,
                falhas: failed,
                updated_at: new Date().toISOString(),
              }).eq("id", dispatch.id);
              return;
            }

            // Delay extra ao trocar de chip (humaniza)
            if (lastInstanceId && instanceId && lastInstanceId !== instanceId) {
              await sleep(randomDelay(interMin, interMax));
            }
            lastInstanceId = instanceId;

            // ===== PREFLIGHT (fail-safe: só envia se a ponte confirmar connected) =====
            let preflight: PreflightResult = { status: "skipped", reconnected: false };
            if (instanceId && bridgeUrl && bridgeApiKey) {
              const cached = preflightByInstance[instanceId];
              const cachedAt = (preflightCacheAt as any)[instanceId] as number | undefined;
              // Só reaproveita cache se o último preflight foi "connected".
              // Cache curto (5s) — se o chip cair entre um envio e outro, reconfirmamos rápido.
              const fresh = cached && cachedAt && (Date.now() - cachedAt) < 5_000;
              if (fresh && cached.status === "connected") {
                preflight = cached;
              } else {
                preflight = await preflightInstance({
                  bridgeUrl, bridgeApiKey, instanceId,
                });
                preflightByInstance[instanceId] = preflight;
                (preflightCacheAt as any)[instanceId] = Date.now();
              }

              if (preflight.status === "disconnected") {
                // A ponte CONFIRMOU status terminal → marca offline no banco.
                await adminClient.from("whatsapp_instances")
                  .update({ status: "disconnected", last_disconnected_at: new Date().toISOString() })
                  .eq("id", instanceId);
                await adminClient.rpc("log_whatsapp_send", {
                  p_instance_id: instanceId, p_client_id: client_id,
                  p_dispatch_id: dispatch.id, p_success: false,
                  p_error_message: `Preflight: instância offline (${preflight.detail || "sem status"})`,
                  p_preflight_status: preflight.status,
                  p_preflight_reconnected: preflight.reconnected,
                });
                delete preflightByInstance[instanceId];
                delete (preflightCacheAt as any)[instanceId];
                if (isGroup) {
                  (excludedByGroup[groupJid] ??= new Set()).add(instanceId);
                  continue;
                }
                break;
              }

              if (preflight.status === "not_ready") {
                // Ponte respondeu connecting / qr / vazio / erro → NÃO envia.
                // Marca como connecting (não confirma offline ainda) e faz failover.
                await adminClient.from("whatsapp_instances")
                  .update({ status: "connecting", last_health_check_at: new Date().toISOString() })
                  .eq("id", instanceId);
                await adminClient.rpc("log_whatsapp_send", {
                  p_instance_id: instanceId, p_client_id: client_id,
                  p_dispatch_id: dispatch.id, p_success: false,
                  p_error_message: `Preflight: sessão não pronta (${preflight.detail || "sem status"})`,
                  p_preflight_status: preflight.status,
                  p_preflight_reconnected: preflight.reconnected,
                });
                delete preflightByInstance[instanceId];
                delete (preflightCacheAt as any)[instanceId];
                if (isGroup) {
                  (excludedByGroup[groupJid] ??= new Set()).add(instanceId);
                  continue;
                }
                // Telefone individual: pausa o disparo — quando o chip estabilizar
                // (próximo health_check ou intervenção manual), o cron retoma.
                await adminClient.from("whatsapp_dispatches").update({
                  status: "pausado_sem_instancia",
                  pause_reason: `Sessão WhatsApp não pronta (${preflight.detail || "sem status"}). Retomado automaticamente quando reconectar.`,
                  enviados: sent,
                  falhas: failed,
                  updated_at: new Date().toISOString(),
                }).eq("id", dispatch.id);
                return;

              }
              // status === "connected": segue o envio normalmente.
            }


            try {
              const baseMsg = (recipient as any).mensagem_personalizada
                ? (recipient as any).mensagem_personalizada
                : mensagem;
              // Anti-ban: renderiza mensagem única por destinatário (spintax + CTA + placeholders).
              // Grupos NÃO recebem transformação — a mesma mensagem vai pra todos do grupo.
              let personalizedMsg: string;
              let ctaUsedForItem: string | null = null;
              if (isGroup) {
                personalizedMsg = baseMsg;
              } else {
                const rendered = renderForRecipient(baseMsg, { nome: recipient.nome, telefone: recipient.telefone });
                personalizedMsg = rendered.text;
                ctaUsedForItem = rendered.ctaUsed;
              }
              console.log(`[dispatch] inst=${instanceId ?? "legacy"} attempt=${attempt} preflight=${preflight.status}${preflight.reconnected ? "(reconectado)" : ""} ${isGroup ? "group" : "phone"}=${destination}`);

              const { res: sendRes, data: sendData } = await fetchBridgeSend({
                bridgeUrl,
                bridgeApiKey,
                phone: destination,
                message: personalizedMsg,
                mediaUrl: media_url,
                mediaKind: media_kind,
                mediaFilename: media_filename,
                mediaMime: media_mime,
              });

              const failure = getSendFailure(sendRes, sendData);

              if (!failure) {
                sent++;
                await itemMatch(adminClient.from("whatsapp_dispatch_items")
                  .update({
                    status: "enviado",
                    enviado_em: new Date().toISOString(),
                    variant_used: personalizedMsg.slice(0, 2000),
                    cta_used: ctaUsedForItem,
                    instance_id: instanceId,
                  }));
                if (instanceId) {
                  await adminClient.rpc("log_whatsapp_send", {
                    p_instance_id: instanceId, p_client_id: client_id,
                    p_dispatch_id: dispatch.id, p_success: true, p_error_message: null,
                    p_preflight_status: preflight.status,
                    p_preflight_reconnected: preflight.reconnected,
                  });
                }
                // Reset do streak de falha de ponte para este chip (sucesso).
                if (instanceId) bridgeFailStreak[instanceId] = 0;
                // Marca sticky para o telefone: próximo envio para este número tenta o mesmo chip.
                if (!isGroup && recipient.telefone && instanceId) {
                  stickyByPhone[String(recipient.telefone)] = instanceId;
                }
                // Micro-pausa aleatória (5%) para quebrar padrão de intervalos.
                if (Math.random() < 0.05) {
                  const microPause = randomDelay(30_000, 120_000);
                  console.log(`[micro-pause] ${Math.round(microPause / 1000)}s`);
                  await sleep(microPause);
                }
                // Registra cobrança de indicador (se aplicável)
                if (tipo === "indicadores_cobranca" && (recipient as any).indicador_id) {
                  await adminClient.from("eleicao_cobranca_log").insert({
                    client_id,
                    indicador_id: (recipient as any).indicador_id,
                    dispatch_id: dispatch.id,
                  });
                }
                recipientResolved = true;
                break;
              }

              // Falha de envio
              const disconnectErr = isInstanceDisconnectedError(sendRes, sendData);
              if (instanceId && disconnectErr) {
                await adminClient.from("whatsapp_instances")
                  .update({ status: "disconnected", last_disconnected_at: new Date().toISOString() })
                  .eq("id", instanceId);
                delete preflightByInstance[instanceId];
                delete preflightCacheAt[instanceId];
              }
              if (instanceId) {
                await adminClient.rpc("log_whatsapp_send", {
                  p_instance_id: instanceId, p_client_id: client_id,
                  p_dispatch_id: dispatch.id, p_success: false, p_error_message: String(failure).slice(0, 200),
                  p_preflight_status: preflight.status,
                  p_preflight_reconnected: preflight.reconnected,
                });
              }

              // ==== Circuit breaker: falhas de rede/ponte consecutivas ====
              // Se a ponte respondeu erro HTTP >= 500 ou o fetch falhou (sendRes.status === 0),
              // contamos como falha de infra. 2 seguidas → desativa o chip pra intervenção manual.
              const isBridgeInfraError = !disconnectErr && (sendRes.status === 0 || sendRes.status >= 500);
              if (instanceId && isBridgeInfraError) {
                bridgeFailStreak[instanceId] = (bridgeFailStreak[instanceId] || 0) + 1;
                if (bridgeFailStreak[instanceId] >= CIRCUIT_BREAKER_THRESHOLD) {
                  console.log(`[circuit-breaker] instance=${instanceId} desativada após ${bridgeFailStreak[instanceId]} falhas de ponte`);
                  await adminClient.from("whatsapp_instances")
                    .update({
                      is_active: false,
                      auto_suspected_reason: `Circuit breaker: ${bridgeFailStreak[instanceId]} falhas de ponte consecutivas. Reative manualmente após revisar.`,
                    })
                    .eq("id", instanceId);
                  bridgeFailStreak[instanceId] = 0;
                }
              } else if (instanceId) {
                bridgeFailStreak[instanceId] = 0;
              }

              if (isGroup && instanceId) {
                // Failover dentro do mesmo grupo: exclui essa instância e tenta a próxima
                (excludedByGroup[groupJid] ??= new Set()).add(instanceId);
                await sleep(randomDelay(800, 1800));
                continue;
              }
              if (!isGroup && disconnectErr) {
                // Telefone individual: deixa pra próxima rodada
                break;
              }

              // Falha terminal (telefone ou grupo sem mais alternativas)
              failed++;
              await itemMatch(adminClient.from("whatsapp_dispatch_items")
                .update({ status: "falha", erro: String(failure).slice(0, 200) }));
              recipientResolved = true;
              break;
            } catch (err) {
              if (instanceId) {
                await adminClient.rpc("log_whatsapp_send", {
                  p_instance_id: instanceId, p_client_id: client_id,
                  p_dispatch_id: dispatch.id, p_success: false, p_error_message: String(err).slice(0, 200),
                  p_preflight_status: preflight.status,
                  p_preflight_reconnected: preflight.reconnected,
                });
              }
              if (isGroup && instanceId) {
                (excludedByGroup[groupJid] ??= new Set()).add(instanceId);
                await sleep(randomDelay(800, 1800));
                continue;
              }
              failed++;
              await itemMatch(adminClient.from("whatsapp_dispatch_items")
                .update({ status: "falha", erro: String(err).slice(0, 200) }));
              recipientResolved = true;
              break;
            }
          }

          // Se grupo esgotou MAX_ATTEMPTS sem resolver, marca falha
          if (!recipientResolved && isGroup) {
            failed++;
            await itemMatch(adminClient.from("whatsapp_dispatch_items")
              .update({
                status: "falha",
                erro: `Falhou após ${MAX_ATTEMPTS} tentativas com instâncias diferentes membros do grupo.`,
              }));
          }

          if ((sent + failed) % 5 === 0) {
            await adminClient.from("whatsapp_dispatches").update({
              enviados: sent,
              falhas: failed,
              updated_at: new Date().toISOString(),
            }).eq("id", dispatch.id);
          }

          const baseDelay = randomDelay(DELAY_MIN_MS, DELAY_MAX_MS);
          const minByStage = stageMinDelayMs(currentStage);
          await sleep(Math.max(baseDelay, minByStage));
        }

        if (batch < Math.ceil(recipients.length / BATCH_SIZE) - 1) {
          await sleep(BATCH_PAUSE_MS);
        }
      }

      await adminClient.from("whatsapp_dispatches").update({
        enviados: sent,
        falhas: failed,
        status: failed > 0 && sent === 0 ? "falhou" : "concluido",
        error_message: failed > 0 && sent === 0 ? "Nenhum envio foi confirmado pela ponte WhatsApp." : null,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", dispatch.id);

      // Fila: tenta promover o próximo disparo enfileirado deste cliente
      await promoteNextQueued(client_id);
      } catch (err) {
        console.error(`[dispatch] erro fatal dispatch=${dispatch.id}:`, err);
        await adminClient.from("whatsapp_dispatches").update({
          status: "falhou",
          error_message: String((err as Error).message || err).slice(0, 300),
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", dispatch.id);
        await promoteNextQueued(client_id);
      }
    };

    if (typeof (globalThis as any).EdgeRuntime !== "undefined") {
      (globalThis as any).EdgeRuntime.waitUntil(processDispatch());
    } else {
      await processDispatch();
    }

    return new Response(
      JSON.stringify({ success: true, dispatch_id: dispatch.id, total: recipients.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-whatsapp-dispatch error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
