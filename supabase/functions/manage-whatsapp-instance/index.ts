import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BRIDGE_URL = "https://vxqvrsaxppbgxookyimz.supabase.co/functions/v1/whatsapp-bridge";

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json",
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders });

const isInvalidApiKeyResponse = (status: number, data: { error?: string } | null | undefined) =>
  status === 401 && typeof data?.error === "string" && data.error.toLowerCase().includes("invalid api key");

const isQrPendingResponse = (data: any) => {
  const error = String(data?.error || "").toLowerCase();
  return Boolean(data?.requires_reconnect) || (error.includes("qr") && error.includes("preserved"));
};

const isConnectedStatus = (status: unknown) => {
  const s = String(status || "").toLowerCase();
  return s === "connected" || s === "open";
};

const isExplicitOfflineStatus = (status: unknown) => {
  const s = String(status || "").toLowerCase();
  return ["disconnected", "offline", "closed", "logged_out", "logout", "banned"].includes(s);
};

const awaitingQrResponse = (message = "Instância criada. Aguardando geração do QR Code.") =>
  jsonResponse({
    success: true,
    status: "awaiting_qr",
    requires_reconnect: true,
    qrcode: null,
    message,
  });

const sanitizeBridgeData = (data: any) => {
  if (!data || typeof data !== "object") return data;
  const { api_key: _apiKey, ...safe } = data;
  if (safe.details && typeof safe.details === "object") {
    const { api_key: _detailsApiKey, ...safeDetails } = safe.details;
    safe.details = safeDetails;
  }
  return safe;
};

function normalizeBrazilPhoneForBridge(raw: string): string {
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const TRANSIENT_BRIDGE_STATUSES = new Set([502, 503, 504]);

async function fetchBridgeAction(params: {
  action: string;
  apiKey: string;
  body: Record<string, unknown>;
  retries?: number;
}) {
  const { action, apiKey, body, retries = action === "send" ? 2 : 0 } = params;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const bridgeRes = await fetch(BRIDGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify(body),
    });

    const bridgeData = await bridgeRes.json().catch(() => ({}));

    if (TRANSIENT_BRIDGE_STATUSES.has(bridgeRes.status) && attempt < retries) {
      console.warn(`Bridge ${action} returned ${bridgeRes.status}; retrying attempt ${attempt + 2}/${retries + 1}`);
      await sleep(1000 * (attempt + 1));
      continue;
    }

    return { bridgeRes, bridgeData };
  }

  throw new Error("Falha inesperada ao comunicar com a ponte WhatsApp");
}

async function syncInstanceHealth(adminClient: any, inst: any) {
  if (!inst?.bridge_api_key) return { id: inst?.id, status: "disconnected", ok: false };

  const { bridgeRes, bridgeData } = await fetchBridgeAction({
    action: "instance_status",
    apiKey: inst.bridge_api_key,
    body: { action: "instance_status" },
  });

  const rawStatus = String(bridgeData?.status || bridgeData?.instance?.status || "").toLowerCase();
  const wasConnected = isConnectedStatus(inst.status);
  let status = isConnectedStatus(rawStatus)
    ? "connected"
    : rawStatus === "connecting" || rawStatus === "qr" || rawStatus === "awaiting_qr"
      ? "connecting"
      : isExplicitOfflineStatus(rawStatus)
        ? "disconnected"
        : (inst.status || "disconnected");

  // Health checks can briefly report "connecting" while the WhatsApp session is still usable.
  // Preserve a previously connected chip unless the bridge explicitly confirms an offline/logout state.
  if (wasConnected && status !== "connected" && !isExplicitOfflineStatus(rawStatus) && !isInvalidApiKeyResponse(bridgeRes.status, bridgeData)) {
    status = "connected";
  }

  if (status === "connected") {
    const { data: latestSendFailure } = await adminClient
      .from("whatsapp_instance_send_log")
      .select("success, error_message, sent_at")
      .eq("instance_id", inst.id)
      .gte("sent_at", new Date(Date.now() - 10 * 60_000).toISOString())
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const latestError = String(latestSendFailure?.error_message || "").toLowerCase();
    if (latestSendFailure && latestSendFailure.success === false && latestError.includes("instance") && latestError.includes("not connected")) {
      status = "disconnected";
    }
  }

  const updates: any = {
    status,
    last_health_check_at: new Date().toISOString(),
  };
  const reportedPhone = bridgeData?.phone_number || bridgeData?.phone
    || bridgeData?.instance?.phone_number || bridgeData?.instance?.phone;
  if (reportedPhone) updates.phone_number = String(reportedPhone).replace(/\D/g, "");
  if (status === "connected" && !inst.connected_since) updates.connected_since = new Date().toISOString();
  if (status === "disconnected") {
    updates.connected_since = null;
    updates.last_disconnected_at = new Date().toISOString();
  }

  await adminClient.from("whatsapp_instances").update(updates).eq("id", inst.id);
  return { id: inst.id, status, ok: bridgeRes.ok, details: sanitizeBridgeData(bridgeData) };
}

function isInstanceDisconnectedError(status: number, data: any): boolean {
  if (status === 401) return true;
  const msg = String(data?.error || data?.message || "").toLowerCase();
  return msg.includes("instance") && (msg.includes("disconnect") || msg.includes("not connected") || msg.includes("offline"));
}

function getSendFailure(status: number, data: any): string | null {
  if (status < 200 || status >= 300) return data?.error || data?.message || `Erro na ponte WhatsApp (status ${status})`;
  if (data?.success === false) return data?.error || data?.message || "Ponte recusou o envio";
  if (data?.delivered === false) return data?.error || data?.message || "Mensagem não entregue pelo WhatsApp";
  // Prova forte de entrega: a ponte/WhatsApp DEVE retornar um identificador único
  // da mensagem (messageId / id / key.id) ou um campo `delivered:true` explícito.
  // `success:true` sozinho NÃO é suficiente — vimos casos onde a ponte responde
  // "ok" mesmo com a sessão WhatsApp caída, e a mensagem nunca é entregue.
  const messageId = data?.messageId || data?.message_id || data?.id
    || data?.key?.id || data?.data?.id || data?.data?.key?.id
    || data?.result?.id || data?.result?.key?.id;
  if (messageId) return null;
  if (data?.delivered === true) return null;
  return data?.error || data?.message
    || "Ponte não retornou ID da mensagem — possivelmente a sessão WhatsApp caiu durante o envio. Tente reconectar.";
}

async function markInstanceDisconnected(adminClient: any, instanceId: string) {
  await adminClient.from("whatsapp_instances").update({
    status: "disconnected",
    connected_since: null,
    last_disconnected_at: new Date().toISOString(),
  }).eq("id", instanceId);
}

async function logDirectSend(adminClient: any, params: { instanceId: string; clientId: string; success: boolean; error?: string | null }) {
  await adminClient.from("whatsapp_instance_send_log").insert({
    instance_id: params.instanceId,
    client_id: params.clientId,
    dispatch_id: null,
    success: params.success,
    error_message: params.error || null,
  });

  await adminClient.rpc("log_whatsapp_send", {
    p_instance_id: params.instanceId,
    p_client_id: params.clientId,
    p_dispatch_id: null,
    p_success: params.success,
    p_error_message: params.error || null,
  });
}

async function tryReconnectInstance(adminClient: any, inst: any) {
  if (!inst?.bridge_api_key) return { id: inst?.id, reconnected: false, reason: "missing_api_key" };
  const { bridgeRes, bridgeData } = await fetchBridgeAction({
    action: "reconnect",
    apiKey: inst.bridge_api_key,
    body: { action: "reconnect" },
  });
  const rawStatus = String(bridgeData?.status || bridgeData?.instance?.status || "").toLowerCase();
  const wasConnected = isConnectedStatus(inst.status);
  let status = isConnectedStatus(rawStatus) ? "connected" : isExplicitOfflineStatus(rawStatus) ? "disconnected" : "connecting";
  if (wasConnected && status !== "connected" && !isExplicitOfflineStatus(rawStatus) && !isInvalidApiKeyResponse(bridgeRes.status, bridgeData)) {
    status = "connected";
  }
  const updates: any = { status, last_health_check_at: new Date().toISOString() };
  const reportedPhone = bridgeData?.phone_number || bridgeData?.phone
    || bridgeData?.instance?.phone_number || bridgeData?.instance?.phone;
  if (reportedPhone) updates.phone_number = String(reportedPhone).replace(/\D/g, "");
  if (status === "connected") updates.connected_since = new Date().toISOString();
  if (status === "disconnected") {
    updates.connected_since = null;
    updates.last_disconnected_at = new Date().toISOString();
  }
  await adminClient.from("whatsapp_instances").update(updates).eq("id", inst.id);
  return { id: inst.id, reconnected: status === "connected", status, ok: bridgeRes.ok, details: sanitizeBridgeData(bridgeData) };
}

async function deleteExistingInstance(params: {
  adminClient: any;
  clientId: string;
  clientApiKey: string | undefined;
}) {
  const { adminClient, clientId, clientApiKey } = params;

  if (clientApiKey) {
    try {
      console.log(`Deleting existing instance for client ${clientId}...`);
      const res = await fetch(BRIDGE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": clientApiKey,
        },
        body: JSON.stringify({ action: "delete_instance" }),
      });
      console.log(`Bridge delete_instance response status: ${res.status}`);
    } catch (err) {
      console.error("Error deleting instance from bridge:", err);
    }
  }

  const { error: updateError } = await adminClient
    .from("clients")
    .update({
      whatsapp_bridge_url: null,
      whatsapp_bridge_api_key: null,
    } as any)
    .eq("id", clientId);

  if (updateError) {
    console.error("Error clearing client bridge credentials:", updateError);
  }
}

async function createClientInstance(params: {
  adminClient: any;
  bridgeToken: string | undefined;
  clientId: string;
  clientName?: string | null;
  providedName?: string | null;
  currentApiKey?: string | null;
}) {
  const { adminClient, bridgeToken, clientId, clientName, providedName, currentApiKey } = params;

  if (!bridgeToken) {
    return jsonResponse({ error: "Bridge token não configurado no servidor" }, 500);
  }

  // Ensure old instance is gone before creating a new one. Even if the bridge
  // rejects the old key, clear our stored credentials before issuing a fresh QR
  // so the user never scans a QR linked to a stale/corrupted session.
  if (currentApiKey) {
    await deleteExistingInstance({ adminClient, clientId, clientApiKey: currentApiKey });
  } else {
    await deleteExistingInstance({ adminClient, clientId, clientApiKey: undefined });
  }

  const instanceName = providedName || clientName || "WhatsApp Bot";

  const bridgeRes = await fetch(BRIDGE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Bridge-Token": bridgeToken,
    },
    body: JSON.stringify({ action: "create_instance", name: instanceName }),
  });

  const bridgeData = await bridgeRes.json().catch(() => ({}));

  // Persist api_key even when QR generation failed — the instance exists on the
  // bridge and we'll need the key to retry/reconnect. Without this, the next
  // call would create another instance from scratch and loop forever.
  if (bridgeData.api_key) {
    const { error: updateError } = await adminClient
      .from("clients")
      .update({
        whatsapp_bridge_url: BRIDGE_URL,
        whatsapp_bridge_api_key: bridgeData.api_key,
      } as any)
      .eq("id", clientId);

    if (updateError) {
      return jsonResponse(
        { error: "Erro ao salvar as credenciais da instância", details: updateError.message },
        500,
      );
    }
  }

  // Bridge created the instance but failed to issue a QR code immediately.
  // Try to fetch a QR via reconnect using the freshly-saved api_key.
  if ((!bridgeRes.ok || !bridgeData.success) && bridgeData.api_key && !isQrPendingResponse(bridgeData)) {
    try {
      const retryRes = await fetch(BRIDGE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": bridgeData.api_key,
        },
        body: JSON.stringify({ action: "reconnect" }),
      });
      const retryData = await retryRes.json().catch(() => ({}));
      if (retryRes.ok && (retryData.qrcode || retryData.instance?.qrcode)) {
        return jsonResponse({
          success: true,
          qrcode: retryData.qrcode ?? retryData.instance?.qrcode,
          instance: retryData.instance,
          recreated: true,
        });
      }
    } catch (err) {
      console.error("Retry reconnect after create failed:", err);
    }
  }

  if ((!bridgeRes.ok || !bridgeData.success) && isQrPendingResponse(bridgeData)) {
    return awaitingQrResponse();
  }

  if (!bridgeRes.ok || !bridgeData.success) {
    return jsonResponse(
      { error: bridgeData.error || "Erro ao criar instância", details: sanitizeBridgeData(bridgeData) },
      200,
    );
  }

  if (!bridgeData.api_key) {
    return jsonResponse(
      { error: "A ponte não retornou a api_key da instância", details: bridgeData },
      502,
    );
  }

  return jsonResponse({
    success: true,
    qrcode: bridgeData.qrcode,
    instance: bridgeData.instance,
    recreated: true,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const body = await req.json();
    const { action, phone, message, client_id, name, instance_id, apelido, bridge_url, bridge_api_key, is_active, status: newStatus, media, mimetype, filename, caption } = body;
    const cronRequested = action === "health_check_all";
    if (!authHeader && !cronRequested) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const bridgeToken = Deno.env.get("WHATSAPP_BRIDGE_TOKEN");

    const userClient = createClient(supabaseUrl, anonKey, authHeader ? {
      global: { headers: { Authorization: authHeader } },
    } : {});
    const { data: { user }, error: authErr } = await userClient.auth.getUser();

    if ((authErr || !user) && !cronRequested) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    if (action === "health_check_all") {
      const keepaliveToken = req.headers.get("X-Keepalive-Token");
      const { data: tokenConfig } = await adminClient
        .from("platform_config")
        .select("value")
        .eq("key", "whatsapp_keepalive_token")
        .maybeSingle();
      const isAuthenticatedUser = Boolean(user);
      const validKeepalive = Boolean(tokenConfig?.value && keepaliveToken === tokenConfig.value);
      if (!isAuthenticatedUser && !validKeepalive) {
        return jsonResponse({ success: false, error: "Unauthorized keepalive" }, 401);
      }
      let allowedClientId: string | null = null;
      if (isAuthenticatedUser) {
        const requestedClientId = typeof client_id === "string" ? client_id : null;
        if (!requestedClientId) return jsonResponse({ success: false, error: "client_id obrigatório" }, 400);
        const { data: ownedClient } = await adminClient
          .from("clients")
          .select("id")
          .eq("id", requestedClientId)
          .eq("user_id", user.id)
          .maybeSingle();
        if (!ownedClient) return jsonResponse({ success: false, error: "Cliente não autorizado" }, 403);
        allowedClientId = ownedClient.id;
      }
      let query = adminClient
        .from("whatsapp_instances")
        .select("id, bridge_api_key, status, connected_since, is_active")
        .eq("is_active", true)
        .not("bridge_api_key", "is", null)
        .limit(50);
      if (isAuthenticatedUser && allowedClientId) query = query.eq("client_id", allowedClientId);
      const { data: rows, error } = await query;
      if (error) return jsonResponse({ success: false, error: error.message }, 500);
      const results = await Promise.allSettled((rows || []).map(async (inst: any) => {
        const health = await syncInstanceHealth(adminClient, inst);
        if (health.status === "connected") return health;
        return { ...health, reconnect: await tryReconnectInstance(adminClient, inst) };
      }));
      return jsonResponse({ success: true, checked: results.length, results });
    }

    // Resolve client_id
    let resolvedClientId = client_id;
    if (!resolvedClientId) {
      const { data: clientData } = await adminClient
        .from("clients")
        .select("id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      resolvedClientId = clientData?.id;
    }

    if (!resolvedClientId) {
      return new Response(
        JSON.stringify({ error: "Client not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get per-client bridge config
    const { data: clientConfig } = await adminClient
      .from("clients")
      .select("name, whatsapp_bridge_url, whatsapp_bridge_api_key")
      .eq("id", resolvedClientId)
      .single();

    // ========================================================
    // POOL ACTIONS (CRUD de instâncias)
    // ========================================================
    if (action === "list_instances") {
      const { data, error } = await adminClient
        .from("whatsapp_instances")
        .select("id, apelido, phone_number, status, is_active, is_primary, last_send_at, messages_sent_today, messages_sent_today_date, total_sent, total_failed, consecutive_failures, connected_since, last_disconnected_at, notes, bridge_url, created_at, updated_at")
        .eq("client_id", resolvedClientId)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) return jsonResponse({ success: false, error: error.message }, 500);
      const now = Date.now();
      const instances = await Promise.all((data || []).map(async (inst: any) => {
        const lastSendMs = inst.last_send_at ? new Date(inst.last_send_at).getTime() : null;
        const restScore = lastSendMs ? Math.min(1, (now - lastSendMs) / 60000) : 1;
        const { data: logs } = await adminClient
          .from("whatsapp_instance_send_log")
          .select("success")
          .eq("instance_id", inst.id)
          .gte("sent_at", new Date(now - 86400000).toISOString());
        const total = (logs || []).length;
        const ok = (logs || []).filter((l: any) => l.success).length;
        const successRate = total === 0 ? 1 : ok / total;
        return { ...inst, health_score: Math.round((restScore * 0.7 + successRate * 0.3) * 100), success_rate_24h: Math.round(successRate * 100), sent_24h: total };
      }));
      return jsonResponse({ success: true, instances });
    }

    if (action === "create_instance_record") {
      // Verifica se já existe alguma instância para esse cliente
      const { count: existingCount } = await adminClient
        .from("whatsapp_instances")
        .select("id", { count: "exact", head: true })
        .eq("client_id", resolvedClientId);
      const isFirst = (existingCount || 0) === 0;
      const { data, error } = await adminClient
        .from("whatsapp_instances")
        .insert({
          client_id: resolvedClientId,
          apelido: apelido || "Nova Instância",
          status: "disconnected",
          is_active: true,
          is_primary: isFirst,
        })
        .select()
        .single();
      if (error) return jsonResponse({ success: false, error: error.message }, 500);
      return jsonResponse({ success: true, instance: data });
    }

    if (action === "update_instance_record") {
      if (!instance_id) return jsonResponse({ success: false, error: "instance_id required" }, 400);
      const updates: any = {};
      if (apelido !== undefined) updates.apelido = apelido;
      if (bridge_url !== undefined) updates.bridge_url = bridge_url;
      if (bridge_api_key !== undefined) updates.bridge_api_key = bridge_api_key;
      if (is_active !== undefined) updates.is_active = is_active;
      if (newStatus !== undefined) updates.status = newStatus;
      const { error } = await adminClient
        .from("whatsapp_instances")
        .update(updates)
        .eq("id", instance_id)
        .eq("client_id", resolvedClientId);
      if (error) return jsonResponse({ success: false, error: error.message }, 500);
      return jsonResponse({ success: true });
    }

    if (action === "set_primary_instance") {
      if (!instance_id) return jsonResponse({ success: false, error: "instance_id required" }, 400);
      const { error } = await adminClient
        .from("whatsapp_instances")
        .update({ is_primary: true })
        .eq("id", instance_id)
        .eq("client_id", resolvedClientId);
      if (error) return jsonResponse({ success: false, error: error.message }, 500);
      return jsonResponse({ success: true });
    }

    if (action === "delete_instance_record") {
      if (!instance_id) return jsonResponse({ success: false, error: "instance_id required" }, 400);
      const { data: inst } = await adminClient
        .from("whatsapp_instances")
        .select("bridge_api_key")
        .eq("id", instance_id)
        .eq("client_id", resolvedClientId)
        .maybeSingle();
      if (inst?.bridge_api_key) {
        try {
          await fetch(BRIDGE_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Api-Key": inst.bridge_api_key },
            body: JSON.stringify({ action: "delete_instance" }),
          });
        } catch (err) { console.error("delete bridge error:", err); }
      }
      const { error } = await adminClient
        .from("whatsapp_instances")
        .delete()
        .eq("id", instance_id)
        .eq("client_id", resolvedClientId);
      if (error) return jsonResponse({ success: false, error: error.message }, 500);
      return jsonResponse({ success: true });
    }

    // ========================================================
    // Resolução da bridge: por instance_id (novo) ou legado
    // ========================================================
    let activeInstanceRow: any = null;
    if (instance_id) {
      const { data: inst } = await adminClient
        .from("whatsapp_instances")
        .select("id, apelido, bridge_api_key, bridge_url, status, connected_since")
        .eq("id", instance_id)
        .eq("client_id", resolvedClientId)
        .maybeSingle();
      activeInstanceRow = inst;
    }

    const clientApiKey: string | null | undefined = activeInstanceRow
      ? activeInstanceRow.bridge_api_key
      : clientConfig?.whatsapp_bridge_api_key;

    // === CREATE INSTANCE ===
    if (action === "create_instance") {
      // Versão multi-instância
      if (instance_id && activeInstanceRow) {
        if (!bridgeToken) return jsonResponse({ error: "Bridge token não configurado" }, 500);
        if (activeInstanceRow.bridge_api_key) {
          try {
            await fetch(BRIDGE_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-Api-Key": activeInstanceRow.bridge_api_key },
              body: JSON.stringify({ action: "delete_instance" }),
            });
          } catch (err) { console.error("erro delete antigo:", err); }
        }
        const instName = name || activeInstanceRow.apelido || clientConfig?.name || "WhatsApp Bot";
        const bridgeRes = await fetch(BRIDGE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Bridge-Token": bridgeToken },
          body: JSON.stringify({ action: "create_instance", name: instName }),
        });
        const bridgeData = await bridgeRes.json().catch(() => ({}));
        if (bridgeData.api_key) {
          await adminClient
            .from("whatsapp_instances")
            .update({ bridge_url: BRIDGE_URL, bridge_api_key: bridgeData.api_key, status: "connecting" })
            .eq("id", instance_id);
        }
        if ((!bridgeRes.ok || !bridgeData.success) && isQrPendingResponse(bridgeData)) {
          return awaitingQrResponse();
        }
        if (!bridgeRes.ok || !bridgeData.success) {
          return jsonResponse({ success: false, error: bridgeData.error || "Erro ao criar instância", details: sanitizeBridgeData(bridgeData) });
        }
        return jsonResponse({ success: true, qrcode: bridgeData.qrcode, instance: bridgeData.instance, recreated: true });
      }
      return await createClientInstance({
        adminClient,
        bridgeToken,
        clientId: resolvedClientId,
        clientName: clientConfig?.name,
        providedName: name,
        currentApiKey: clientApiKey ?? undefined,
      });
    }

    // === DISCONNECT ===
    if (action === "disconnect") {
      if (instance_id && activeInstanceRow) {
        if (activeInstanceRow.bridge_api_key) {
          try {
            await fetch(BRIDGE_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-Api-Key": activeInstanceRow.bridge_api_key },
              body: JSON.stringify({ action: "delete_instance" }),
            });
          } catch (err) { console.error("erro disconnect bridge:", err); }
        }
        await adminClient
          .from("whatsapp_instances")
          .update({ bridge_api_key: null, status: "disconnected", phone_number: null })
          .eq("id", instance_id);
        return jsonResponse({ success: true, message: "Instância desconectada" });
      }
      await deleteExistingInstance({
        adminClient,
        clientId: resolvedClientId,
        clientApiKey: clientApiKey ?? undefined,
      });
      return jsonResponse({ success: true, message: "Instância deletada com sucesso" });
    }

    // === CHECK BRIDGE (legacy) ===
    if (action === "check_bridge") {
      const configured = !!(clientConfig?.whatsapp_bridge_url && clientApiKey);
      return jsonResponse({ success: true, configured });
    }

    // === SET WEBHOOK (confirmação automática de WhatsApp) ===
    // Registra o webhook da WhatsHub Bridge para apontar para nossa edge function
    // `whatsapp-inbound-webhook`, que confirma o WhatsApp do contato automaticamente
    // assim que ele envia uma mensagem para o número oficial.
    if (action === "set_webhook") {
      if (!instance_id || !activeInstanceRow) {
        return jsonResponse({ success: false, error: "instance_id obrigatório" }, 400);
      }
      if (!activeInstanceRow.bridge_api_key) {
        return jsonResponse({ success: false, error: "Instância sem API key — conecte primeiro" }, 400);
      }
      const webhookUrl = `${supabaseUrl}/functions/v1/whatsapp-inbound-webhook?client_id=${resolvedClientId}`;
      const bridgeRes = await fetch(BRIDGE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": activeInstanceRow.bridge_api_key,
        },
        body: JSON.stringify({
          action: "set_webhook",
          instance_id: instance_id,
          webhook_url: webhookUrl,
        }),
      });
      const bridgeData = await bridgeRes.json().catch(() => ({}));
      if (!bridgeRes.ok) {
        return jsonResponse({
          success: false,
          error: bridgeData?.error || `Bridge respondeu ${bridgeRes.status}`,
          details: sanitizeBridgeData(bridgeData),
        });
      }
      return jsonResponse({ success: true, webhook_url: webhookUrl, bridge: bridgeData });
    }

    if (action === "ensure_connected") {
      if (!instance_id || !activeInstanceRow) {
        return jsonResponse({ success: false, error: "instance_id obrigatório" }, 400);
      }
      const health = await syncInstanceHealth(adminClient, activeInstanceRow);
      if (health.status === "connected") return jsonResponse({ success: true, status: "connected", health });
      if (!clientApiKey) {
        return jsonResponse({ success: false, status: "disconnected", error: "Instância sem credencial; conecte novamente pelo QR Code." });
      }
      const reconnect = await tryReconnectInstance(adminClient, activeInstanceRow);
      const bridgeData = reconnect.details || {};
      if (isQrPendingResponse(bridgeData)) return awaitingQrResponse("Instância caiu. Reconexão iniciada; escaneie o QR Code para estabilizar.");
      return jsonResponse({
        success: reconnect.ok && bridgeData?.success !== false,
        status: reconnect.status || bridgeData?.status || bridgeData?.instance?.status || "connecting",
        qrcode: bridgeData?.qrcode || bridgeData?.instance?.qrcode,
        instance: bridgeData?.instance,
        error: !reconnect.ok || bridgeData?.success === false ? (bridgeData?.error || "Erro ao reconectar") : undefined,
      });
    }

    // === ACTIONS THAT REQUIRE API KEY ===
    if (!clientApiKey) {
      if (action === "reconnect") {
        if (instance_id && activeInstanceRow) {
          if (!bridgeToken) return jsonResponse({ error: "Bridge token não configurado" }, 500);
          const instName = activeInstanceRow.apelido || "WhatsApp Bot";
          const bridgeRes = await fetch(BRIDGE_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Bridge-Token": bridgeToken },
            body: JSON.stringify({ action: "create_instance", name: instName }),
          });
          const bridgeData = await bridgeRes.json().catch(() => ({}));
          if (bridgeData.api_key) {
            await adminClient
              .from("whatsapp_instances")
              .update({ bridge_url: BRIDGE_URL, bridge_api_key: bridgeData.api_key, status: "connecting" })
              .eq("id", instance_id);
          }
          if (isQrPendingResponse(bridgeData)) return awaitingQrResponse();
          return jsonResponse({
            success: bridgeRes.ok && bridgeData.success,
            qrcode: bridgeData.qrcode,
            instance: bridgeData.instance,
            error: !bridgeRes.ok || !bridgeData.success ? (bridgeData.error || "Erro ao reconectar") : undefined,
          });
        }
        return await createClientInstance({
          adminClient,
          bridgeToken,
          clientId: resolvedClientId,
          clientName: clientConfig?.name,
          currentApiKey: null, // No old key since we already checked !clientApiKey
        });
      }

      return jsonResponse({ error: "Instância WhatsApp não configurada. Crie uma instância primeiro." }, 400);
    }

    if ((action === "send" || action === "send_media") && instance_id && activeInstanceRow) {
      const health = await syncInstanceHealth(adminClient, activeInstanceRow);
      // Para envio, o estado ao vivo da ponte manda mais que o status salvo no banco.
      // Antes, um status antigo "connected" podia mascarar um health check recém-falho
      // e o envio seguia mesmo com a ponte dizendo "not connected".
      const currentStatus = health.status;
      // Releitura do estado mais recente do banco — o webhook pode ter acabado
      // de marcar como "disconnected" (vps_reported_disconnected) entre o
      // syncInstanceHealth e este ponto.
      const { data: freshRow } = await adminClient
        .from("whatsapp_instances")
        .select("status, last_disconnected_at, connected_since")
        .eq("id", instance_id)
        .maybeSingle();
      const lastDisc = freshRow?.last_disconnected_at ? new Date(freshRow.last_disconnected_at).getTime() : 0;
      const recentlyDropped = lastDisc > 0 && (Date.now() - lastDisc) < 90_000;
      const dbDisconnected = freshRow?.status === "disconnected";

      if (currentStatus !== "connected" || dbDisconnected || recentlyDropped) {
        const reconnect = await tryReconnectInstance(adminClient, activeInstanceRow);
        if (reconnect.status !== "connected") {
          const error = "Instância WhatsApp desconectada. Reconecte o chip antes de enviar.";
          const bridgeState = String(reconnect.details?.status || reconnect.details?.instance?.status || health.details?.status || health.details?.instance?.status || "").toLowerCase();
          if (isExplicitOfflineStatus(bridgeState)) {
            await markInstanceDisconnected(adminClient, instance_id);
          }
          await logDirectSend(adminClient, { instanceId: instance_id, clientId: resolvedClientId, success: false, error });
          return jsonResponse({ success: false, status: reconnect.status || health.status, error, health, reconnect });
        }
        // Reconexão bem-sucedida: aguarda 2s para o socket WhatsApp estabilizar
        // antes de tentar enviar (envios imediatos pós-reconnect costumam falhar).
        if (recentlyDropped || dbDisconnected) {
          await sleep(2000);
        }
      }
    }

    // Proxy all other actions to bridge with X-Api-Key
    // IMPORTANT: a ponte WhatsApp usada aqui (formato Brasil) só aceita
    // o número SEM o 9º dígito (ex.: 556792248348). O frontend envia o
    // número humano completo (5567992248348) — então normalizamos AQUI
    // antes de chamar a bridge. Sem isso, mensagens são "aceitas" mas
    // nunca chegam ao destinatário.
    const proxyBody: any = { action };
    const normalizedPhone = phone ? normalizeBrazilPhoneForBridge(String(phone)) : "";
    if (normalizedPhone) proxyBody.phone = normalizedPhone;
    if (message) proxyBody.message = message;

    // Envio de mídia (PDF, imagem, áudio etc.) — aceita action "send_media"
    if (action === "send_media") {
      // Mesma normalização do envio de texto
      if (normalizedPhone) proxyBody.phone = normalizedPhone;

      // A bridge espera uma URL pública (`media_uri`/`media_url`), não base64.
      // Se vier base64 em `media`, fazemos upload para o bucket público
      // `whatsapp-media` e geramos a URL assinada/pública para enviar.
      let mediaUrl: string | null = null;

      if (typeof media === "string" && media.length > 0) {
        try {
          // Aceita "data:application/pdf;base64,XXXX" ou só o base64
          const rawBase64 = media.includes(",") ? media.split(",", 2)[1] : media;
          const detectedMime = (media.startsWith("data:") && media.includes(";base64,"))
            ? media.substring(5, media.indexOf(";base64,"))
            : (mimetype || "application/octet-stream");
          const finalMime = mimetype || detectedMime;
          const ext = finalMime === "application/pdf" ? "pdf"
            : finalMime.startsWith("image/") ? finalMime.split("/")[1]
            : finalMime.startsWith("audio/") ? finalMime.split("/")[1]
            : finalMime.startsWith("video/") ? finalMime.split("/")[1]
            : "bin";
          const safeName = (filename || `media-${Date.now()}.${ext}`).replace(/[^\w.\-]/g, "_");
          const objectPath = `outbox/${resolvedClientId || "anon"}/${Date.now()}-${safeName}`;

          // Decodifica base64 → bytes
          const binary = atob(rawBase64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

          const upload = await adminClient.storage
            .from("whatsapp-media")
            .upload(objectPath, bytes, {
              contentType: finalMime,
              upsert: true,
            });
          if (upload.error) throw upload.error;

          const { data: pub } = adminClient.storage
            .from("whatsapp-media")
            .getPublicUrl(objectPath);
          mediaUrl = pub?.publicUrl || null;
          console.log("[manage-whatsapp-instance] media uploaded:", objectPath, "->", mediaUrl);
        } catch (e) {
          console.error("[manage-whatsapp-instance] media upload failed:", e);
          return jsonResponse({ success: false, error: `Falha ao preparar anexo: ${(e as Error).message}` });
        }
      }

      if (mediaUrl) {
        // Cobre múltiplos contratos de bridges
        proxyBody.media_uri = mediaUrl;
        proxyBody.media_url = mediaUrl;
        proxyBody.url = mediaUrl;
      }
      if (mimetype) proxyBody.mimetype = mimetype;
      if (filename) {
        proxyBody.filename = filename;
        proxyBody.fileName = filename;
      }
      if (caption) proxyBody.caption = caption;
      if (mimetype) {
        proxyBody.mediaType = mimetype.startsWith("image/") ? "image"
          : mimetype.startsWith("audio/") ? "audio"
          : mimetype.startsWith("video/") ? "video"
          : "document";
      }
    }

    if (action === "send" && typeof phone === "string" && phone) {
      console.log("[WhatsApp manage-whatsapp-instance] phone recebido no body:", phone);
      console.log("[WhatsApp manage-whatsapp-instance] phone enviado para whatsapp-bridge:", proxyBody.phone);
    }

    const { bridgeRes, bridgeData } = await fetchBridgeAction({
      action,
      apiKey: clientApiKey,
      body: proxyBody,
    });

    if ((action === "send" || action === "send_media") && instance_id && activeInstanceRow) {
      const failure = getSendFailure(bridgeRes.status, bridgeData);
      if (failure) {
        if (isInstanceDisconnectedError(bridgeRes.status, bridgeData)) {
          const reconnect = await tryReconnectInstance(adminClient, activeInstanceRow);
          if (reconnect.status === "connected") {
            await sleep(1500);
            const retry = await fetchBridgeAction({ action, apiKey: clientApiKey, body: proxyBody, retries: 1 });
            const retryFailure = getSendFailure(retry.bridgeRes.status, retry.bridgeData);
            if (!retryFailure) {
              await logDirectSend(adminClient, { instanceId: instance_id, clientId: resolvedClientId, success: true });
              return jsonResponse(retry.bridgeData);
            }
          }
          const bridgeState = String(reconnect.details?.status || reconnect.details?.instance?.status || bridgeData?.status || bridgeData?.instance?.status || "").toLowerCase();
          // Se o ENVIO real diz "Instance not connected", ele é a prova mais forte.
          // Mesmo que o endpoint de status/reconnect diga "connected", não podemos
          // manter a tela como OK enquanto o socket de envio está recusando entrega.
          await markInstanceDisconnected(adminClient, instance_id);
        }
        await logDirectSend(adminClient, { instanceId: instance_id, clientId: resolvedClientId, success: false, error: failure });
        return jsonResponse({ success: false, error: failure, details: sanitizeBridgeData(bridgeData) });
      }
      await logDirectSend(adminClient, { instanceId: instance_id, clientId: resolvedClientId, success: true });
    }

    // Sincroniza status/phone_number na tabela quando consultando uma instância específica
    if (instance_id && activeInstanceRow && action === "instance_status" && bridgeRes.ok) {
      const rawStatus = String(bridgeData?.status || bridgeData?.instance?.status || "").toLowerCase();
      const wasConnected = isConnectedStatus(activeInstanceRow.status);
      let status = isConnectedStatus(rawStatus) ? "connected"
        : rawStatus === "connecting" || rawStatus === "qr" || rawStatus === "awaiting_qr" ? "connecting"
        : isExplicitOfflineStatus(rawStatus) ? "disconnected"
        : (activeInstanceRow.status || "disconnected");
      if (wasConnected && status !== "connected" && !isExplicitOfflineStatus(rawStatus)) status = "connected";
      const updates: any = { status, last_health_check_at: new Date().toISOString() };
      if (status === "connected" && !activeInstanceRow.connected_since) {
        updates.connected_since = new Date().toISOString();
      }
      if (status === "disconnected") {
        updates.connected_since = null;
        updates.last_disconnected_at = new Date().toISOString();
      }
      // Sincroniza telefone sempre que a bridge informar (mesmo em connecting)
      const reportedPhone = bridgeData?.phone_number || bridgeData?.phone
        || bridgeData?.instance?.phone_number || bridgeData?.instance?.phone;
      if (reportedPhone) {
        updates.phone_number = String(reportedPhone).replace(/\D/g, "");
      }
      await adminClient.from("whatsapp_instances").update(updates).eq("id", instance_id);
    }

    if (action === "reconnect" && isInvalidApiKeyResponse(bridgeRes.status, bridgeData)) {
      return await createClientInstance({
        adminClient,
        bridgeToken,
        clientId: resolvedClientId,
        clientName: clientConfig?.name,
        currentApiKey: clientApiKey,
      });
    }

    if (action === "reconnect" && isQrPendingResponse(bridgeData)) {
      return awaitingQrResponse("Reconexão iniciada. Aguardando geração do QR Code.");
    }

    if (action === "instance_status" && isInvalidApiKeyResponse(bridgeRes.status, bridgeData)) {
      return jsonResponse({
        success: false,
        status: "disconnected",
        error: bridgeData.error,
        requires_reconnect: true,
      });
    }

    // Always return 200 so the Supabase SDK can read the body
    if (!bridgeRes.ok) {
      return jsonResponse({ success: false, error: bridgeData?.error || `Erro na ponte (status ${bridgeRes.status})`, details: bridgeData });
    }
    return jsonResponse(bridgeData);
  } catch (err) {
    console.error("manage-whatsapp-instance error:", err);
    return jsonResponse({ success: false, error: (err as Error).message });
  }
});
