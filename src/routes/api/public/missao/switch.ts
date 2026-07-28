import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

// POST /api/public/missao/switch — revoga token via RPC SECURITY DEFINER.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

export const Route = createFileRoute("/api/public/missao/switch")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        try {
          const body = await request.json().catch(() => ({}));
          const token = String(body.token || "").trim();
          if (!token) return Response.json({ ok: true }, { headers: corsHeaders });
          const sb = makeClient();
          await sb.rpc("public_mission_switch", { p_token: token });
          return Response.json({ ok: true }, { headers: corsHeaders });
        } catch (e: any) {
          return Response.json({ error: e?.message || "erro" }, { status: 500, headers: corsHeaders });
        }
      },
    },
  },
});
