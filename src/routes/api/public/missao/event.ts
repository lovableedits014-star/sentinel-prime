import { createFileRoute } from "@tanstack/react-router";

// POST /api/public/missao/event
// body: { missionId, code?, token?, type: 'click_facebook'|'click_instagram'|'click_avulso'|'declared_done'|'open' }
// Registra evento. Se o token for válido, associa ao participante.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const ALLOWED = new Set(["open", "click_facebook", "click_instagram", "click_avulso", "declared_done"]);

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

export const Route = createFileRoute("/api/public/missao/event")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        try {
          const body = await request.json().catch(() => ({}));
          const missionId = String(body.missionId || "").trim();
          const code = String(body.code || "").trim();
          const token = String(body.token || "").trim();
          const type = String(body.type || "").trim();

          if (!missionId || !ALLOWED.has(type)) {
            return Response.json({ error: "Dados inválidos" }, { status: 400, headers: corsHeaders });
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const { data: mission } = await supabaseAdmin
            .from("portal_missions")
            .select("id, client_id")
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

          let participantId: string | null = null;
          if (token) {
            const { data: tok } = await supabaseAdmin
              .from("mission_visitor_tokens")
              .select("participant_id, client_id, revoked_at")
              .eq("token", token)
              .maybeSingle();
            if (tok && !tok.revoked_at && tok.client_id === mission.client_id) {
              participantId = tok.participant_id;
              await supabaseAdmin
                .from("mission_visitor_tokens")
                .update({ last_used_at: new Date().toISOString() })
                .eq("token", token);
              await supabaseAdmin
                .from("mission_participants")
                .update({ last_seen_at: new Date().toISOString() })
                .eq("id", participantId);
            }
          }

          const ua = request.headers.get("user-agent");
          const isBot = detectBot(ua);

          await supabaseAdmin.from("mission_events").insert({
            mission_id: missionId,
            distribution_id: distId,
            participant_id: participantId,
            client_id: mission.client_id,
            event_type: type,
            user_agent: ua,
            device_category: detectDevice(ua),
            is_bot: isBot,
          });

          return Response.json({ ok: true }, { headers: corsHeaders });
        } catch (e: any) {
          return Response.json({ error: e?.message || "Erro" }, { status: 500, headers: corsHeaders });
        }
      },
    },
  },
});
