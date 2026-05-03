import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Get all clients with birthday config enabled
    const { data: configs } = await admin
      .from("whatsapp_birthday_config")
      .select("*")
      .eq("enabled", true);

    if (!configs || configs.length === 0) {
      return new Response(JSON.stringify({ message: "No birthday configs enabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Bridge config is now per-client, loaded inside the loop

    let totalSent = 0;
    let totalFailed = 0;

    for (const config of configs) {
      const clientId = config.client_id;

      // Prefer the PRIMARY WhatsApp instance from the pool.
      // Fallback to legacy single-bridge config on the client record if no primary is set.
      let bridgeUrl: string | null = null;
      let bridgeApiKey: string | null = null;

      const { data: primaryInstance } = await admin
        .from("whatsapp_instances")
        .select("bridge_url, bridge_api_key, status, is_active")
        .eq("client_id", clientId)
        .eq("is_primary", true)
        .maybeSingle();

      if (
        primaryInstance?.bridge_url &&
        primaryInstance?.bridge_api_key &&
        primaryInstance.is_active &&
        primaryInstance.status === "connected"
      ) {
        bridgeUrl = primaryInstance.bridge_url;
        bridgeApiKey = primaryInstance.bridge_api_key;
      } else {
        const { data: clientData } = await admin
          .from("clients")
          .select("whatsapp_bridge_url, whatsapp_bridge_api_key")
          .eq("id", clientId)
          .single();
        bridgeUrl = clientData?.whatsapp_bridge_url ?? null;
        bridgeApiKey = clientData?.whatsapp_bridge_api_key ?? null;
      }

      if (!bridgeUrl || !bridgeApiKey) continue; // Skip clients without any usable bridge

      // Find people with birthday today (month + day match)
      const today = new Date();
      const month = String(today.getMonth() + 1).padStart(2, "0");
      const day = String(today.getDate()).padStart(2, "0");
      const birthdayPattern = `%-${month}-${day}%`;

      const { data: aniversariantes } = await admin
        .from("pessoas")
        .select("id, nome, telefone, data_nascimento")
        .eq("client_id", clientId)
        .not("telefone", "is", null)
        .not("data_nascimento", "is", null)
        .like("data_nascimento", birthdayPattern);

      if (!aniversariantes || aniversariantes.length === 0) continue;

      // Check which ones already received today
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { data: alreadySent } = await admin
        .from("whatsapp_birthday_log")
        .select("pessoa_id")
        .eq("client_id", clientId)
        .eq("status", "enviado")
        .gte("enviado_em", todayStart.toISOString());

      const sentIds = new Set((alreadySent || []).map((s: any) => s.pessoa_id));
      const toSend = aniversariantes.filter((p: any) => !sentIds.has(p.id));

      if (toSend.length === 0) continue;

      for (const pessoa of toSend) {
        try {
          const personalizedMsg = config.mensagem_template.replace(/{nome}/g, pessoa.nome);
          const phoneClean = cleanPhoneForBridge(pessoa.telefone);

          // Send via Bridge API (text only — images handled externally)
          const sendRes = await fetch(bridgeUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Api-Key": bridgeApiKey,
            },
            body: JSON.stringify({
              action: "send",
              phone: phoneClean,
              message: personalizedMsg,
            }),
          });

          if (sendRes.ok) {
            await admin.from("whatsapp_birthday_log").insert({
              client_id: clientId,
              pessoa_id: pessoa.id,
              pessoa_nome: pessoa.nome,
              telefone: pessoa.telefone,
              status: "enviado",
            });
            totalSent++;
          } else {
            const errText = await sendRes.text();
            await admin.from("whatsapp_birthday_log").insert({
              client_id: clientId,
              pessoa_id: pessoa.id,
              pessoa_nome: pessoa.nome,
              telefone: pessoa.telefone,
              status: "falha",
              erro: errText.slice(0, 200),
            });
            totalFailed++;
          }
        } catch (err) {
          await admin.from("whatsapp_birthday_log").insert({
            client_id: clientId,
            pessoa_id: pessoa.id,
            pessoa_nome: pessoa.nome,
            telefone: pessoa.telefone,
            status: "falha",
            erro: String(err).slice(0, 200),
          });
          totalFailed++;
        }

        // Conservative delay between birthday messages (8-15s)
        await sleep(Math.floor(Math.random() * 7000) + 8000);
      }
    }

    return new Response(
      JSON.stringify({ success: true, sent: totalSent, failed: totalFailed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-birthday-messages error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
