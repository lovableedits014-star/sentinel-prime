import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

// GET /api/public/m/:missionId/d/:code
// Endpoint curto que os grupos WhatsApp recebem. Valida o short_code
// (via RPC público) e redireciona para a página pública da missão.

export const Route = createFileRoute("/api/public/m/$missionId/d/$code")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const url = new URL(request.url);
        const origin = `${url.protocol}//${url.host}`;
        const fallback = `${origin}/missao/${encodeURIComponent(params.missionId)}?d=${encodeURIComponent(params.code)}`;

        try {
          const supaUrl = process.env.SUPABASE_URL!;
          const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
          const sb = createClient(supaUrl, key, {
            auth: { persistSession: false, autoRefreshToken: false, storage: undefined as any },
            global: {
              fetch: (input, init) => {
                const h = new Headers(init?.headers);
                if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
                h.set("apikey", key);
                return fetch(input as any, { ...init, headers: h });
              },
            },
          });
          const { data } = await sb.rpc("public_mission_config", {
            p_mission_id: params.missionId,
            p_code: params.code,
            p_token: null,
          });
          const payload: any = data || {};
          if (payload?.error === "not_found" || payload?.distribution_valid === false) {
            return Response.redirect(`${origin}/missao/${encodeURIComponent(params.missionId)}?d=invalid`, 302);
          }
        } catch {
          // Se falhar, ainda redireciona para o fallback — a página cuida do resto.
        }
        return Response.redirect(fallback, 302);
      },
    },
  },
});
