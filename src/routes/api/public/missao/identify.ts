import { createFileRoute } from "@tanstack/react-router";
import { normalizeBRPhone } from "@/lib/phone-utils";

// POST /api/public/missao/identify
// body: { missionId, code, nome, phone, existingToken? }
// Faz upsert do participante por (client_id, phone_e164), gera token de visitante,
// registra evento 'open' já associado ao participante e devolve { token, participant }.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function detectBot(ua: string | null): boolean {
  if (!ua) return false;
  return /(facebookexternalhit|WhatsApp\/|Twitterbot|LinkedInBot|Slackbot|TelegramBot|bot|crawler|spider|preview)/i.test(ua);
}

function detectDevice(ua: string | null): string {
  if (!ua) return "unknown";
  const s = ua.toLowerCase();
  if (/iphone|ipad|ios/.test(s)) return "ios";
  if (/android/.test(s)) return "android";
  if (/windows/.test(s)) return "windows";
  if (/mac os/.test(s)) return "mac";
  return "other";
}

export const Route = createFileRoute("/api/public/missao/identify")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        try {
          const body = await request.json().catch(() => ({}));
          const missionId = String(body.missionId || "").trim();
          const code = String(body.code || "").trim();
          const nome = String(body.nome || "").trim().slice(0, 100);
          const phone = normalizeBRPhone(body.phone);

          if (!missionId || !nome || !phone) {
            return Response.json({ error: "Dados inválidos" }, { status: 400, headers: corsHeaders });
          }

          const mod = await import("@/integrations/supabase/client.server"); const supabaseAdmin = mod.supabaseAdmin as any;

          // Resolve missão + distribuição
          const { data: mission } = await supabaseAdmin
            .from("portal_missions")
            .select("id, client_id, tracking_enabled")
            .eq("id", missionId)
            .maybeSingle();
          if (!mission) {
            return Response.json({ error: "Missão não encontrada" }, { status: 404, headers: corsHeaders });
          }

          let distId: string | null = null;
          if (code && code !== "invalid") {
            const { data: dist } = await supabaseAdmin
              .from("mission_distributions")
              .select("id")
              .eq("short_code", code)
              .eq("mission_id", missionId)
              .maybeSingle();
            distId = dist?.id ?? null;
          }

          // Upsert participante
          const nowIso = new Date().toISOString();
          const { data: existing } = await supabaseAdmin
            .from("mission_participants")
            .select("id, nome")
            .eq("client_id", mission.client_id)
            .eq("phone_e164", phone)
            .maybeSingle();

          let participantId: string;
          if (existing) {
            participantId = existing.id;
            await supabaseAdmin
              .from("mission_participants")
              .update({ nome, last_seen_at: nowIso })
              .eq("id", participantId);
          } else {
            const { data: inserted, error: insErr } = await supabaseAdmin
              .from("mission_participants")
              .insert({
                client_id: mission.client_id,
                phone_e164: phone,
                nome,
                first_seen_at: nowIso,
                last_seen_at: nowIso,
              })
              .select("id")
              .single();
            if (insErr || !inserted) {
              return Response.json({ error: "Falha ao cadastrar" }, { status: 500, headers: corsHeaders });
            }
            participantId = inserted.id;
          }

          const ua = request.headers.get("user-agent");
          const isBot = detectBot(ua);
          const deviceCat = detectDevice(ua);

          // Gera token opaco
          const bytes = new Uint8Array(24);
          crypto.getRandomValues(bytes);
          const token = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");

          await supabaseAdmin.from("mission_visitor_tokens").insert({
            token,
            participant_id: participantId,
            client_id: mission.client_id,
            user_agent: ua,
            device_hint: deviceCat,
          });

          // Registra 'open' já vinculado ao participante
          await supabaseAdmin.from("mission_events").insert({
            mission_id: missionId,
            distribution_id: distId,
            participant_id: participantId,
            client_id: mission.client_id,
            event_type: "open",
            user_agent: ua,
            device_category: deviceCat,
            is_bot: isBot,
          });

          return Response.json(
            { token, participant: { id: participantId, nome } },
            { headers: corsHeaders }
          );
        } catch (e: any) {
          return Response.json({ error: e?.message || "Erro" }, { status: 500, headers: corsHeaders });
        }
      },
    },
  },
});
