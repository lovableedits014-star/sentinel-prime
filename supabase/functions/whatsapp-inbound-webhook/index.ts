// Webhook público que recebe mensagens recebidas pela bridge WhatsApp
// e confirma automaticamente o WhatsApp do contato no banco.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key, x-bridge-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/**
 * Tenta extrair o telefone do remetente em vários formatos comuns
 * de payload de webhooks de WhatsApp (uazapi, evolution, baileys, etc).
 */
function extractSenderPhone(payload: any): string | null {
  if (!payload || typeof payload !== "object") return null;

  const candidates: any[] = [
    payload.senderPn,
    payload.participantPn,
    payload.remoteJidAlt,
    payload.data?.senderPn,
    payload.data?.participantPn,
    payload.data?.remoteJidAlt,
    payload.from,
    payload.sender,
    payload.phone,
    payload.number,
    payload.remoteJid,
    payload.chatId,
    payload.data?.from,
    payload.data?.sender,
    payload.data?.phone,
    payload.data?.key?.remoteJid,
    payload.message?.from,
    payload.message?.sender,
    payload.message?.key?.remoteJid,
    payload.key?.remoteJid,
  ];

  for (const c of candidates) {
    if (typeof c === "string" && c.length > 0) {
      // Remove sufixos do whatsapp (@s.whatsapp.net, @c.us, :número)
      const cleaned = c.split("@")[0].split(":")[0];
      const digits = cleaned.replace(/\D/g, "");
      if (digits.length >= 10) return digits;
    }
  }
  return null;
}

/**
 * Detecta se o evento corresponde a uma mensagem RECEBIDA (não enviada por nós).
 */
function isInboundMessage(payload: any): boolean {
  if (!payload || typeof payload !== "object") return false;

  // Marcadores comuns de "fromMe" devem ser falsos
  const fromMeFlags = [
    payload.fromMe,
    payload.from_me,
    payload.data?.fromMe,
    payload.data?.key?.fromMe,
    payload.message?.fromMe,
    payload.message?.key?.fromMe,
    payload.key?.fromMe,
  ];
  if (fromMeFlags.some((f) => f === true)) return false;

  // Tipo do evento — aceita "message", "messages.upsert", "messages", etc.
  const eventType = String(
    payload.event || payload.type || payload.action || ""
  ).toLowerCase();

  // Se não tem tipo definido, aceita pela presença de payload de mensagem
  if (!eventType) return true;

  return (
    eventType.includes("message") ||
    eventType.includes("inbound") ||
    eventType.includes("receive")
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    // O client_id vem como query string no URL configurado na bridge
    const clientId = url.searchParams.get("client_id");

    if (!clientId) {
      return json({ error: "client_id query param is required" }, 400);
    }

    // Shared-secret authentication. The bridge must present WHATSAPP_BRIDGE_TOKEN
    // via header (x-bridge-token / x-webhook-secret / Authorization: Bearer) OR query (?token=).
    const expectedToken = Deno.env.get("WHATSAPP_BRIDGE_TOKEN");
    if (!expectedToken) {
      console.error("[whatsapp-inbound-webhook] WHATSAPP_BRIDGE_TOKEN not configured");
      return json({ error: "server misconfigured" }, 500);
    }
    const headerToken =
      req.headers.get("x-bridge-token") ||
      req.headers.get("x-webhook-secret") ||
      (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") ||
      url.searchParams.get("token") ||
      "";
    if (headerToken !== expectedToken) {
      console.warn("[whatsapp-inbound-webhook] invalid bridge token");
      return json({ error: "unauthorized" }, 401);
    }

    const payload = await req.json().catch(() => ({}));
    console.log("[whatsapp-inbound-webhook] FULL PAYLOAD", clientId, JSON.stringify(payload));

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // === Eventos de status da ponte (disconnected / connected / health_check) ===
    // A ponte envia esses eventos quando a sessão WhatsApp cai ou volta.
    // Refletimos no banco IMEDIATAMENTE para evitar envios "fantasma" (status
    // OK no banco enquanto a sessão real está caída).
    const eventName = String(payload?.event || payload?.type || "").toLowerCase();
    const instanceId = payload?.instance_id || payload?.instanceId || payload?.data?.instance_id;

    // Verify instance belongs to the client_id in the URL before any status mutation
    let instanceOwnedByClient = false;
    if (instanceId) {
      const { data: inst } = await admin
        .from("whatsapp_instances")
        .select("id, client_id")
        .eq("id", instanceId)
        .maybeSingle();
      instanceOwnedByClient = !!inst && (inst as any).client_id === clientId;
      if (!instanceOwnedByClient) {
        console.warn("[whatsapp-inbound-webhook] instance/client mismatch", { instanceId, clientId, found: inst });
      }
    }

    if (instanceId && instanceOwnedByClient && (eventName === "disconnected" || eventName.includes("logout") || eventName.includes("banned"))) {
      // Eventos `logout`/`banned` são terminais — marca offline imediatamente.
      const isTerminal = eventName.includes("logout") || eventName.includes("banned");
      let confirmedOffline = isTerminal;

      const TERMINAL = new Set(["disconnected", "offline", "closed", "logged_out", "logout", "banned"]);
      if (!isTerminal) {
        // Para `disconnected` simples, re-checa na ponte antes de marcar offline.
        // Só marcamos como offline se a ponte CONFIRMAR estado terminal. Qualquer
        // outra resposta (connected/open/connecting/vazia/erro de rede) é tratada
        // como oscilação — não derrubamos a instância no banco.
        let confirmedTerminal = false;
        try {
          const { data: instRow } = await admin
            .from("whatsapp_instances")
            .select("bridge_url, bridge_api_key")
            .eq("id", instanceId)
            .maybeSingle();
          if (instRow?.bridge_url && instRow?.bridge_api_key) {
            await new Promise((r) => setTimeout(r, 3000));
            const ctrl = new AbortController();
            const tid = setTimeout(() => ctrl.abort(), 8000);
            const verifyRes = await fetch((instRow as any).bridge_url, {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-Api-Key": (instRow as any).bridge_api_key },
              body: JSON.stringify({ action: "instance_status" }),
              signal: ctrl.signal,
            }).catch(() => null);
            clearTimeout(tid);
            const vData = verifyRes ? await verifyRes.json().catch(() => ({})) : {};
            const vStatus = String((vData as any)?.status || (vData as any)?.instance?.status || "").toLowerCase();
            if (TERMINAL.has(vStatus)) {
              confirmedTerminal = true;
            } else {
              console.log("[whatsapp-inbound-webhook] disconnected event ignorado — status na ponte:", instanceId, vStatus || "vazio");
              await admin.from("whatsapp_instances").update({
                last_health_check_at: new Date().toISOString(),
              }).eq("id", instanceId).eq("client_id", clientId);
              return json({ ok: true, handled: "disconnected_ignored", instance_id: instanceId, verified_status: vStatus || "transient" });
            }
          }
        } catch (err) {
          console.warn("[whatsapp-inbound-webhook] falha ao reverificar status, ignorando evento:", (err as Error).message);
          await admin.from("whatsapp_instances").update({
            last_health_check_at: new Date().toISOString(),
          }).eq("id", instanceId).eq("client_id", clientId);
          return json({ ok: true, handled: "disconnected_ignored_verify_error", instance_id: instanceId });
        }
        confirmedOffline = confirmedTerminal;
      }

      if (confirmedOffline) {
        const { error: upErr } = await admin.from("whatsapp_instances").update({
          status: "disconnected",
          connected_since: null,
          last_disconnected_at: new Date().toISOString(),
        }).eq("id", instanceId).eq("client_id", clientId);
        if (upErr) console.error("[whatsapp-inbound-webhook] failed to mark disconnected:", upErr);
        else console.log("[whatsapp-inbound-webhook] instance marked disconnected:", instanceId, "reason=", payload?.data?.reason);
        return json({ ok: true, handled: "disconnected", instance_id: instanceId });
      }
    }

    if (instanceId && instanceOwnedByClient && (eventName === "connected" || eventName === "ready" || eventName === "open")) {
      await admin.from("whatsapp_instances").update({
        status: "connected",
        connected_since: new Date().toISOString(),
        last_health_check_at: new Date().toISOString(),
      }).eq("id", instanceId).eq("client_id", clientId);
      return json({ ok: true, handled: "connected", instance_id: instanceId });
    }

    if (instanceId && instanceOwnedByClient && eventName === "health_check") {
      await admin.from("whatsapp_instances").update({
        last_health_check_at: new Date().toISOString(),
      }).eq("id", instanceId).eq("client_id", clientId);
      // não retorna — health_check pode coexistir com payload de mensagem
    }

    if (!isInboundMessage(payload)) {
      console.log("[whatsapp-inbound-webhook] ignored not_inbound_message. event=", payload?.event, "type=", payload?.type);
      return json({ ok: true, ignored: "not_inbound_message", event: payload?.event ?? payload?.type ?? null });
    }

    const senderPhone = extractSenderPhone(payload);
    if (!senderPhone) {
      console.log("[whatsapp-inbound-webhook] ignored no_sender_phone. payload keys=", Object.keys(payload || {}));
      return json({ ok: true, ignored: "no_sender_phone" });
    }

    const { data, error } = await admin.rpc("confirm_whatsapp_by_phone", {
      p_client_id: clientId,
      p_phone: senderPhone,
    });

    if (error) {
      console.error("[whatsapp-inbound-webhook] RPC error:", error);
      return json({ error: error.message }, 500);
    }

    console.log("[whatsapp-inbound-webhook] confirm result:", data);
    return json({ ok: true, sender: senderPhone, result: data });
  } catch (err) {
    console.error("[whatsapp-inbound-webhook] error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});