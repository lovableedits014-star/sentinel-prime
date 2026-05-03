import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
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

const DEFAULT_TEMPLATE = `Olá, {nome}! 👋\n\nNotamos que você não acessou o portal da campanha *{campanha}* há {dias} dias.\n\nO seu acesso diário é muito importante: é nele que você confirma sua presença e recebe as missões para interagir nas redes sociais. 🙌\n\nLembre-se: o registro precisa ser feito *todos os dias*. Conto com você!`;

function buildMessage(nome: string, days: number, clientName: string, template?: string | null): string {
  const firstName = nome.split(" ")[0];
  const tpl = template && template.trim() ? template : DEFAULT_TEMPLATE;
  return tpl
    .replace(/\{nome\}/g, firstName)
    .replace(/\{dias\}/g, String(days))
    .replace(/\{campanha\}/g, clientName);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // For manual runs we accept an optional client_id; otherwise process all clients
    let body: { client_id?: string } = {};
    try {
      body = await req.json();
    } catch {
      // empty body is fine
    }

    const { data: clients } = await admin
      .from("clients")
      .select("id, name, presence_absence_days_threshold, presence_absence_message_template, whatsapp_bridge_url, whatsapp_bridge_api_key")
      .match(body.client_id ? { id: body.client_id } : {});

    if (!clients || clients.length === 0) {
      return new Response(JSON.stringify({ message: "No clients" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalSent = 0;
    let totalFailed = 0;
    let totalSkipped = 0;

    for (const client of clients) {
      const threshold = client.presence_absence_days_threshold ?? 3;

      // Resolve bridge: prefer primary instance from pool, fallback to client legacy fields
      let bridgeUrl: string | null = null;
      let bridgeApiKey: string | null = null;

      const { data: primary } = await admin
        .from("whatsapp_instances")
        .select("bridge_url, bridge_api_key, status, is_active")
        .eq("client_id", client.id)
        .eq("is_primary", true)
        .maybeSingle();

      if (primary?.bridge_url && primary?.bridge_api_key && primary.is_active && primary.status === "connected") {
        bridgeUrl = primary.bridge_url;
        bridgeApiKey = primary.bridge_api_key;
      } else {
        bridgeUrl = client.whatsapp_bridge_url ?? null;
        bridgeApiKey = client.whatsapp_bridge_api_key ?? null;
      }

      // Get all absentees with mandatory presence
      const { data: overview, error: ovErr } = await admin.rpc("get_presence_overview", {
        p_client_id: client.id,
      });

      if (ovErr) {
        console.error("overview error", client.id, ovErr);
        continue;
      }

      const absentees = (overview || []).filter(
        (r: any) => r.presenca_obrigatoria === true && r.days_since_checkin >= threshold && !r.notified_at
      );

      if (absentees.length === 0) continue;

      // Always create an admin alert summarizing absentees, even when no bridge is configured
      await admin.from("alertas").insert({
        client_id: client.id,
        tipo: "presenca_ausente",
        severidade: absentees.length >= 5 ? "alta" : "media",
        titulo: `${absentees.length} pessoa(s) sem check-in há ${threshold}+ dias`,
        descricao: absentees
          .slice(0, 10)
          .map((a: any) => `• ${a.nome} (${a.person_type}) — ${a.days_since_checkin === 9999 ? "nunca" : `${a.days_since_checkin}d`}`)
          .join("\n"),
        dados: { absentees: absentees.slice(0, 50) },
      });

      for (const person of absentees) {
        if (!person.telefone) {
          await admin.from("presence_absence_notifications").insert({
            client_id: client.id,
            person_type: person.person_type,
            person_id: person.person_id,
            person_name: person.nome,
            telefone: null,
            days_absent: person.days_since_checkin,
            whatsapp_status: "skipped_no_phone",
          });
          totalSkipped++;
          continue;
        }

        if (!bridgeUrl || !bridgeApiKey) {
          await admin.from("presence_absence_notifications").insert({
            client_id: client.id,
            person_type: person.person_type,
            person_id: person.person_id,
            person_name: person.nome,
            telefone: person.telefone,
            days_absent: person.days_since_checkin,
            whatsapp_status: "skipped_no_bridge",
          });
          totalSkipped++;
          continue;
        }

        try {
          const message = buildMessage(
            person.nome,
            person.days_since_checkin,
            client.name,
            (client as any).presence_absence_message_template,
          );
          const phoneClean = cleanPhoneForBridge(person.telefone);

          const sendRes = await fetch(bridgeUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Api-Key": bridgeApiKey },
            body: JSON.stringify({ action: "send", phone: phoneClean, message }),
          });

          if (sendRes.ok) {
            await admin.from("presence_absence_notifications").insert({
              client_id: client.id,
              person_type: person.person_type,
              person_id: person.person_id,
              person_name: person.nome,
              telefone: person.telefone,
              days_absent: person.days_since_checkin,
              whatsapp_status: "sent",
            });
            totalSent++;
          } else {
            const errText = await sendRes.text();
            await admin.from("presence_absence_notifications").insert({
              client_id: client.id,
              person_type: person.person_type,
              person_id: person.person_id,
              person_name: person.nome,
              telefone: person.telefone,
              days_absent: person.days_since_checkin,
              whatsapp_status: "failed",
              whatsapp_error: errText.slice(0, 300),
            });
            totalFailed++;
          }
        } catch (err) {
          await admin.from("presence_absence_notifications").insert({
            client_id: client.id,
            person_type: person.person_type,
            person_id: person.person_id,
            person_name: person.nome,
            telefone: person.telefone,
            days_absent: person.days_since_checkin,
            whatsapp_status: "failed",
            whatsapp_error: String(err).slice(0, 300),
          });
          totalFailed++;
        }

        await sleep(Math.floor(Math.random() * 5000) + 6000);
      }
    }

    return new Response(
      JSON.stringify({ success: true, sent: totalSent, failed: totalFailed, skipped: totalSkipped }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("check-presence-absences error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});