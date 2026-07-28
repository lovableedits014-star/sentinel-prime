import { createFileRoute } from "@tanstack/react-router";

// GET /api/public/missao/config/:missionId?code=XXXX&token=YYYY
// Devolve dados públicos da missão + (se token válido) participante já reconhecido.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const Route = createFileRoute("/api/public/missao/config/$missionId")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      GET: async ({ params, request }) => {
        try {
          const mod = await import("@/integrations/supabase/client.server"); const supabaseAdmin = mod.supabaseAdmin as any;
          const url = new URL(request.url);
          const code = (url.searchParams.get("code") || "").trim();
          const token = (url.searchParams.get("token") || "").trim();

          const { data: mission } = await supabaseAdmin
            .from("portal_missions")
            .select("id, client_id, title, tracking_enabled, link_facebook, link_instagram, link_avulso, instructions, post_url, platform")
            .eq("id", params.missionId)
            .maybeSingle();
          if (!mission) {
            return Response.json({ error: "not_found" }, { status: 404, headers: corsHeaders });
          }

          // Nome do cliente (para o cabeçalho da página pública)
          const { data: cli } = await supabaseAdmin
            .from("clients")
            .select("name")
            .eq("id", mission.client_id)
            .maybeSingle();

          let distributionValid = false;
          let groupNameSnapshot: string | null = null;
          if (code && code !== "invalid") {
            const { data: dist } = await supabaseAdmin
              .from("mission_distributions")
              .select("id, group_name_snapshot")
              .eq("short_code", code)
              .eq("mission_id", params.missionId)
              .maybeSingle();
            if (dist) {
              distributionValid = true;
              groupNameSnapshot = dist.group_name_snapshot;
            }
          }

          let participant: { id: string; nome: string } | null = null;
          if (token) {
            const { data: tok } = await supabaseAdmin
              .from("mission_visitor_tokens")
              .select("participant_id, client_id, revoked_at")
              .eq("token", token)
              .maybeSingle();
            if (tok && !tok.revoked_at && tok.client_id === mission.client_id) {
              const { data: p } = await supabaseAdmin
                .from("mission_participants")
                .select("id, nome")
                .eq("id", tok.participant_id)
                .maybeSingle();
              if (p) participant = { id: p.id, nome: p.nome };
            }
          }

          return Response.json({
            mission: {
              id: mission.id,
              title: mission.title,
              tracking_enabled: mission.tracking_enabled,
              link_facebook: mission.link_facebook,
              link_instagram: mission.link_instagram,
              link_avulso: mission.link_avulso,
              instructions: mission.instructions,
              // fallback: se rastreamento desligado no legado, ainda temos post_url
              legacy_post_url: mission.post_url,
              legacy_platform: mission.platform,
            },
            client_name: cli?.name ?? null,
            distribution_valid: distributionValid,
            group_name: groupNameSnapshot,
            participant,
          }, { headers: corsHeaders });
        } catch (e: any) {
          return Response.json({ error: e?.message || "erro" }, { status: 500, headers: corsHeaders });
        }
      },
    },
  },
});
