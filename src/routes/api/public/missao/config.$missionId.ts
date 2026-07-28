import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

// GET /api/public/missao/config/:missionId?code=XXXX&token=YYYY
// Devolve dados públicos da missão + (se token válido) participante já reconhecido.
// Usa RPC SECURITY DEFINER (public_mission_config) para não depender de service role no worker.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function makeClient() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient(url, key, {
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
}

export const Route = createFileRoute("/api/public/missao/config/$missionId")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      GET: async ({ params, request }) => {
        try {
          const url = new URL(request.url);
          const code = (url.searchParams.get("code") || "").trim();
          const token = (url.searchParams.get("token") || "").trim();

          const sb = makeClient();
          const { data, error } = await sb.rpc("public_mission_config", {
            p_mission_id: params.missionId,
            p_code: code || null,
            p_token: token || null,
          });
          if (error) {
            return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
          }
          const payload: any = data || {};
          if (payload.error === "not_found") {
            return Response.json({ error: "not_found" }, { status: 404, headers: corsHeaders });
          }
          return Response.json(payload, { headers: corsHeaders });
        } catch (e: any) {
          return Response.json({ error: e?.message || "erro" }, { status: 500, headers: corsHeaders });
        }
      },
    },
  },
});
