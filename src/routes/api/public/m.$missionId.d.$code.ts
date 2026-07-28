import { createFileRoute } from "@tanstack/react-router";

// GET /api/public/m/:missionId/d/:code
// Endpoint curto que os grupos WhatsApp recebem. Só valida o short_code
// e redireciona para a página pública da missão. O registro de "open"
// acontece no client (após identificar o participante).

export const Route = createFileRoute("/api/public/m/$missionId/d/$code")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const url = new URL(request.url);
        const origin = `${url.protocol}//${url.host}`;
        const fallback = `${origin}/missao/${encodeURIComponent(params.missionId)}?d=${encodeURIComponent(params.code)}`;

        try {
          const { data: dist } = await supabaseAdmin
            .from("mission_distributions")
            .select("id, mission_id")
            .eq("short_code", params.code)
            .maybeSingle();
          if (!dist || dist.mission_id !== params.missionId) {
            return Response.redirect(`${origin}/missao/${encodeURIComponent(params.missionId)}?d=invalid`, 302);
          }
        } catch {
          // Se não conseguirmos consultar, ainda redireciona: a página cuida do resto.
        }
        return Response.redirect(fallback, 302);
      },
    },
  },
});
