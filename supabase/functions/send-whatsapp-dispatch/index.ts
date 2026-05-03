import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_DELAY_MIN = 5;
const DEFAULT_DELAY_MAX = 15;
const DEFAULT_BATCH_PAUSE = 60;
const MAX_RUNTIME_MS = 55000;
const SAO_PAULO_OFFSET_HOURS = -3; // UTC-3 (sem horário de verão atualmente)

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(minMs: number, maxMs: number) {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
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

  if (digits.length === 13 && digits.startsWith("55")) {
    const ddd = digits.slice(2, 4);
    const local = digits.slice(4);
    return local.length === 9 && local.startsWith("9") ? `55${ddd}${local.slice(1)}` : digits;
  }

  if (digits.length === 11) {
    const ddd = digits.slice(0, 2);
    const local = digits.slice(2);
    return local.length === 9 && local.startsWith("9") ? `55${ddd}${local.slice(1)}` : `55${digits}`;
  }

  return digits.startsWith("55") ? digits : `55${digits}`;
}

const TRANSIENT_BRIDGE_STATUSES = new Set([502, 503, 504]);

async function fetchBridgeSend(params: { bridgeUrl: string; bridgeApiKey: string; phone: string; message: string }) {
  const { bridgeUrl, bridgeApiKey, phone, message } = params;

  for (let attempt = 0; attempt <= 2; attempt++) {
    const res = await fetch(bridgeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": bridgeApiKey,
      },
      body: JSON.stringify({ action: "send", phone, message }),
    });

    const data = await res.json().catch(async () => ({ error: await res.text().catch(() => "Resposta inválida da ponte") }));

    if (TRANSIENT_BRIDGE_STATUSES.has(res.status) && attempt < 2) {
      console.warn(`Bridge send returned ${res.status}; retrying attempt ${attempt + 2}/3`);
      await sleep(1000 * (attempt + 1));
      continue;
    }

    return { res, data };
  }

  throw new Error("Falha inesperada ao comunicar com a ponte WhatsApp");
}

function getSendFailure(res: Response, data: any) {
  if (!res.ok) return data?.error || `Erro na ponte WhatsApp (status ${res.status})`;
  if (data?.success === false) return data?.error || "Ponte recusou o envio";
  if (data?.delivered === false) return data?.error || "Mensagem não entregue pelo WhatsApp";

  const hasDeliverySignal = data?.delivered === true || Boolean(data?.messageId || data?.message_id || data?.id || data?.key?.id);
  if (!hasDeliverySignal) return data?.error || "Ponte não confirmou entrega da mensagem";

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
// Consulta a bridge para confirmar que a instância está de pé, e
// se necessário tenta uma reconexão silenciosa. Retorna uma string
// resumindo o resultado para gravar no log de envios.
// ============================================================
type PreflightResult = {
  status: "connected" | "reconnected" | "disconnected" | "skipped" | "error";
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

  // 1) Status atual na bridge
  let statusRaw = "";
  try {
    const res = await fetch(bridgeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": bridgeApiKey },
      body: JSON.stringify({ action: "instance_status" }),
    });
    const data = await res.json().catch(() => ({}));
    statusRaw = String(data?.status || data?.instance?.status || "").toLowerCase();
    if (statusRaw === "connected" || statusRaw === "open") {
      console.log(`${tag} ✅ saudável (status=${statusRaw})`);
      return { status: "connected", reconnected: false, detail: statusRaw };
    }
  } catch (err) {
    console.warn(`${tag} ⚠️ erro ao consultar status:`, (err as Error).message);
    return { status: "error", reconnected: false, detail: (err as Error).message };
  }

  console.warn(`${tag} ⚠️ não-conectada (status=${statusRaw || "desconhecido"}). Tentando reconectar...`);

  // 2) Tenta reconectar silenciosamente
  try {
    const recRes = await fetch(bridgeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": bridgeApiKey },
      body: JSON.stringify({ action: "reconnect" }),
    });
    const recData = await recRes.json().catch(() => ({}));
    const newStatus = String(recData?.status || recData?.instance?.status || "").toLowerCase();
    if (newStatus === "connected" || newStatus === "open") {
      console.log(`${tag} ♻️ reconectada com sucesso (status=${newStatus})`);
      return { status: "reconnected", reconnected: true, detail: newStatus };
    }
    console.warn(`${tag} ❌ reconexão não estabilizou (status=${newStatus || "vazio"})`);
    return { status: "disconnected", reconnected: true, detail: newStatus || "no_status" };
  } catch (err) {
    console.warn(`${tag} ❌ erro ao reconectar:`, (err as Error).message);
    return { status: "disconnected", reconnected: true, detail: (err as Error).message };
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
    const isResume = !!payload.resume_dispatch_id;
    const isRetryQueue = !!payload.retry_queue_id;

    // ====== MODO RETRY QUEUE (chamado pelo cron resume_whatsapp_on_reconnect) ======
    // Envio único proveniente da fila de retentativas. Não cria registro de dispatch
    // — apenas tenta entregar usando uma instância conectada do pool. Em caso de
    // falha definitiva (tentativas esgotadas) marca o item como falha_definitiva.
    if (isRetryQueue) {
      const queueId = payload.retry_queue_id as string;
      const queueClientId = payload.client_id as string;
      const queueMsg = String(payload.mensagem || "");
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
        const personalizedMsg = queueMsg.replace(/{nome}/g, queueRecipient.nome || "");
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
          phone: phoneClean, message: personalizedMsg,
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

    if (isResume) {
      const { data: d } = await adminClient
        .from("whatsapp_dispatches")
        .select("*")
        .eq("id", payload.resume_dispatch_id)
        .single();
      if (!d) {
        return new Response(JSON.stringify({ error: "Dispatch not found" }), { status: 404, headers: corsHeaders });
      }
      client_id = d.client_id;
      titulo = d.titulo;
      mensagem = d.mensagem_template;
      tipo = d.tipo;
      tag_filtro = d.tag_filtro;
      batch_size = d.batch_size;
      delay_min = d.delay_min_seconds;
      delay_max = d.delay_max_seconds;
      batch_pause = d.batch_pause_seconds;
      existingDispatchId = d.id;
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

    // Get bridge config + window settings
    const { data: clientData } = await adminClient
      .from("clients")
      .select("id, whatsapp_bridge_url, whatsapp_bridge_api_key, whatsapp_window_enabled, whatsapp_window_start, whatsapp_window_end, whatsapp_inter_instance_delay_min, whatsapp_inter_instance_delay_max")
      .eq("id", client_id)
      .single();
    if (!clientData) {
      return new Response(JSON.stringify({ error: "Client not found" }), { status: 404, headers: corsHeaders });
    }

    // Verifica se há pelo menos uma instância no pool ou bridge legada
    const { count: poolCount } = await adminClient
      .from("whatsapp_instances")
      .select("id", { count: "exact", head: true })
      .eq("client_id", client_id)
      .eq("is_active", true)
      .eq("status", "connected");

    const hasLegacyBridge = !!(clientData.whatsapp_bridge_url && clientData.whatsapp_bridge_api_key);

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
    let recipients: { telefone: string; nome: string }[] = [];
    let dispatch: any;

    if (isResume && existingDispatchId) {
      const { data: pendingItems } = await adminClient
        .from("whatsapp_dispatch_items")
        .select("telefone, nome")
        .eq("dispatch_id", existingDispatchId)
        .eq("status", "pendente");
      recipients = (pendingItems || []).map((r: any) => ({ telefone: r.telefone, nome: r.nome }));
      dispatch = { id: existingDispatchId };
      console.log(`[resume] dispatch=${existingDispatchId} pending=${recipients.length}`);
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
        return new Response(JSON.stringify({ success: true, completed: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(
        JSON.stringify({ error: "Nenhum destinatário encontrado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!isResume) {
      // Create dispatch record
      const { data: newDispatch, error: dispatchErr } = await adminClient
        .from("whatsapp_dispatches")
        .insert({
          client_id,
          tipo,
          titulo,
          mensagem_template: mensagem,
          total_destinatarios: recipients.length,
          tag_filtro,
          status: "enviando",
          started_at: new Date().toISOString(),
          batch_size: BATCH_SIZE,
          delay_min_seconds: Math.round(DELAY_MIN_MS / 1000),
          delay_max_seconds: Math.round(DELAY_MAX_MS / 1000),
          batch_pause_seconds: Math.round(BATCH_PAUSE_MS / 1000),
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
        telefone: r.telefone,
        nome: r.nome,
      }));

      for (let i = 0; i < items.length; i += 100) {
        await adminClient.from("whatsapp_dispatch_items").insert(items.slice(i, i + 100));
      }
    }

    const processDispatch = async () => {
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

      for (let batch = 0; batch < Math.ceil(recipients.length / BATCH_SIZE); batch++) {
        if (Date.now() - startTime > MAX_RUNTIME_MS) {
          await adminClient.from("whatsapp_dispatches").update({
            enviados: sent,
            falhas: failed,
            status: "pausado_timeout",
            pause_reason: `Pausado por tempo limite. Retomando em segundos…`,
            paused_until: new Date(Date.now() + 5000).toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("id", dispatch.id);
          return;
        }

        const batchStart = batch * BATCH_SIZE;
        const batchItems = recipients.slice(batchStart, batchStart + BATCH_SIZE);

        for (const recipient of batchItems) {
          if (Date.now() - startTime > MAX_RUNTIME_MS) {
            await adminClient.from("whatsapp_dispatches").update({
              enviados: sent,
              falhas: failed,
              status: "pausado_timeout",
              pause_reason: "Pausado por tempo limite. Retomando em segundos…",
              paused_until: new Date(Date.now() + 5000).toISOString(),
              updated_at: new Date().toISOString(),
            }).eq("id", dispatch.id);
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

          // ==== Escolhe instância saudável (pool) com fallback legado ====
          let bridgeUrl: string | null = null;
          let bridgeApiKey: string | null = null;
          let instanceId: string | null = null;

          const { data: pickedId } = await adminClient.rpc("pick_healthy_whatsapp_instance", { p_client_id: client_id });
          if (pickedId) {
            const { data: inst } = await adminClient
              .from("whatsapp_instances")
              .select("id, bridge_url, bridge_api_key")
              .eq("id", pickedId)
              .maybeSingle();
            if (inst?.bridge_url && inst?.bridge_api_key) {
              bridgeUrl = inst.bridge_url;
              bridgeApiKey = inst.bridge_api_key;
              instanceId = inst.id;
            }
          }

          // Fallback legado
          if (!bridgeUrl && hasLegacyBridge) {
            bridgeUrl = clientData.whatsapp_bridge_url!;
            bridgeApiKey = clientData.whatsapp_bridge_api_key!;
          }

          if (!bridgeUrl || !bridgeApiKey) {
            // Nenhuma instância disponível agora — pausa pra retomar depois
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

          // ===== PREFLIGHT: garante instância conectada antes de enviar =====
          // Roda uma vez por instância no ciclo. Se reconexão silenciosa falha,
          // marca a instância como desconectada e pula pra próxima rodada (que
          // escolherá outra via pick_healthy_whatsapp_instance).
          let preflight: PreflightResult = { status: "skipped", reconnected: false };
          if (instanceId && bridgeUrl && bridgeApiKey) {
            const cached = preflightByInstance[instanceId];
            if (cached && cached.status === "connected") {
              preflight = cached;
            } else {
              preflight = await preflightInstance({
                bridgeUrl, bridgeApiKey, instanceId,
              });
              preflightByInstance[instanceId] = preflight;
            }

            if (preflight.status === "disconnected") {
              // Marca como desconectada e força nova escolha de instância
              await adminClient.from("whatsapp_instances")
                .update({ status: "disconnected" })
                .eq("id", instanceId);
              await adminClient.rpc("log_whatsapp_send", {
                p_instance_id: instanceId, p_client_id: client_id,
                p_dispatch_id: dispatch.id, p_success: false,
                p_error_message: `Preflight: instância offline (${preflight.detail || "sem status"})`,
                p_preflight_status: preflight.status,
                p_preflight_reconnected: preflight.reconnected,
              });
              // invalida cache pra reavaliar e pula esse destinatário no próximo loop
              delete preflightByInstance[instanceId];
              continue;
            }
          }

          try {
            const personalizedMsg = mensagem.replace(/{nome}/g, recipient.nome);
            const phoneClean = cleanPhoneForBridge(recipient.telefone);
            console.log(`[dispatch] inst=${instanceId ?? "legacy"} preflight=${preflight.status}${preflight.reconnected ? "(reconectado)" : ""} phone=${phoneClean}`);

            const { res: sendRes, data: sendData } = await fetchBridgeSend({
              bridgeUrl,
              bridgeApiKey,
              phone: phoneClean,
              message: personalizedMsg,
            });

            const failure = getSendFailure(sendRes, sendData);

            if (!failure) {
              sent++;
              await adminClient.from("whatsapp_dispatch_items")
                .update({ status: "enviado", enviado_em: new Date().toISOString() })
                .eq("dispatch_id", dispatch.id)
                .eq("telefone", recipient.telefone);
              if (instanceId) {
                await adminClient.rpc("log_whatsapp_send", {
                  p_instance_id: instanceId, p_client_id: client_id,
                  p_dispatch_id: dispatch.id, p_success: true, p_error_message: null,
                  p_preflight_status: preflight.status,
                  p_preflight_reconnected: preflight.reconnected,
                });
              }
            } else {
              // Falha de envio: se a instância caiu, marca como desconectada e re-tenta com outra
              if (instanceId && isInstanceDisconnectedError(sendRes, sendData)) {
                await adminClient.from("whatsapp_instances")
                  .update({ status: "disconnected" })
                  .eq("id", instanceId);
                delete preflightByInstance[instanceId];
                await adminClient.rpc("log_whatsapp_send", {
                  p_instance_id: instanceId, p_client_id: client_id,
                  p_dispatch_id: dispatch.id, p_success: false, p_error_message: String(failure).slice(0, 200),
                  p_preflight_status: preflight.status,
                  p_preflight_reconnected: preflight.reconnected,
                });
                // Não conta como falha do destinatário; tenta de novo no próximo loop
                continue;
              }
              failed++;
              await adminClient.from("whatsapp_dispatch_items")
                .update({ status: "falha", erro: String(failure).slice(0, 200) })
                .eq("dispatch_id", dispatch.id)
                .eq("telefone", recipient.telefone);
              if (instanceId) {
                await adminClient.rpc("log_whatsapp_send", {
                  p_instance_id: instanceId, p_client_id: client_id,
                  p_dispatch_id: dispatch.id, p_success: false, p_error_message: String(failure).slice(0, 200),
                  p_preflight_status: preflight.status,
                  p_preflight_reconnected: preflight.reconnected,
                });
              }
            }
          } catch (err) {
            failed++;
            await adminClient.from("whatsapp_dispatch_items")
              .update({ status: "falha", erro: String(err).slice(0, 200) })
              .eq("dispatch_id", dispatch.id)
              .eq("telefone", recipient.telefone);
            if (instanceId) {
              await adminClient.rpc("log_whatsapp_send", {
                p_instance_id: instanceId, p_client_id: client_id,
                p_dispatch_id: dispatch.id, p_success: false, p_error_message: String(err).slice(0, 200),
                p_preflight_status: preflight.status,
                p_preflight_reconnected: preflight.reconnected,
              });
            }
          }

          if ((sent + failed) % 5 === 0) {
            await adminClient.from("whatsapp_dispatches").update({
              enviados: sent,
              falhas: failed,
              updated_at: new Date().toISOString(),
            }).eq("id", dispatch.id);
          }

          await sleep(randomDelay(DELAY_MIN_MS, DELAY_MAX_MS));
        }

        if (batch < Math.ceil(recipients.length / BATCH_SIZE) - 1) {
          await sleep(BATCH_PAUSE_MS);
        }
      }

      await adminClient.from("whatsapp_dispatches").update({
        enviados: sent,
        falhas: failed,
        status: "concluido",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", dispatch.id);
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
