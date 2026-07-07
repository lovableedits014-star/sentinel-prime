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

// Janela horária segura para envios automáticos (evita disparar 2h da manhã).
const WINDOW_START_HOUR = 8;
const WINDOW_END_HOUR = 20;

function isWithinBirthdayWindow(now = new Date()): boolean {
  const h = now.getHours();
  return h >= WINDOW_START_HOUR && h < WINDOW_END_HOUR;
}

// Preflight: só confirma envio se a ponte retornar status connected/open ao vivo.
async function preflightBridge(bridgeUrl: string, bridgeApiKey: string): Promise<boolean> {
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
    const status = String((data as any)?.status || (data as any)?.instance?.status || "").toLowerCase();
    return status === "connected" || status === "open";
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Guarda global de janela horária: se estiver fora, nem carrega configs.
    if (!isWithinBirthdayWindow()) {
      return new Response(
        JSON.stringify({ success: true, skipped: "fora_da_janela", window: `${WINDOW_START_HOUR}h-${WINDOW_END_HOUR}h` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

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

    let totalSent = 0;
    let totalFailed = 0;

    for (const config of configs) {
      const clientId = config.client_id;

      // Prefer the PRIMARY WhatsApp instance from the pool.
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

      // Preflight ao vivo — evita disparar contra bridge marcada connected mas caída.
      const bridgeAlive = await preflightBridge(bridgeUrl, bridgeApiKey);
      if (!bridgeAlive) {
        console.warn(`[birthday] bridge não confirmou connected para client=${clientId} — pulando`);
        continue;
      }

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
        // Reverifica janela dentro do loop (batches longos podem ultrapassar 20h)
        if (!isWithinBirthdayWindow()) {
          console.log(`[birthday] saiu da janela horária durante o loop — parando client=${clientId}`);
          break;
        }
        try {
          const personalizedMsg = config.mensagem_template.replace(/{nome}/g, pessoa.nome);
          const phoneClean = cleanPhoneForBridge(pessoa.telefone);

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

          const sendData: any = await sendRes.json().catch(() => ({}));
          // Mesma regra flexível do dispatch: 2xx + sem sinal explícito de falha = enviado.
          const failed = !sendRes.ok
            || sendData?.success === false
            || sendData?.delivered === false;

          if (!failed) {
            await admin.from("whatsapp_birthday_log").insert({
              client_id: clientId,
              pessoa_id: pessoa.id,
              pessoa_nome: pessoa.nome,
              telefone: pessoa.telefone,
              status: "enviado",
            });
            totalSent++;
          } else {
            const errText = String(sendData?.error || sendRes.statusText || "sem detalhe").slice(0, 200);
            await admin.from("whatsapp_birthday_log").insert({
              client_id: clientId,
              pessoa_id: pessoa.id,
              pessoa_nome: pessoa.nome,
              telefone: pessoa.telefone,
              status: "falha",
              erro: errText,
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
