import { createFileRoute } from "@tanstack/react-router";

// POST /api/public/missao/switch
// body: { token } — revoga o token para permitir "Não é você? Trocar participante".

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const Route = createFileRoute("/api/public/missao/switch")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        try {
          const body = await request.json().catch(() => ({}));
          const token = String(body.token || "").trim();
          if (!token) return Response.json({ ok: true }, { headers: corsHeaders });
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin
            .from("mission_visitor_tokens")
            .update({ revoked_at: new Date().toISOString() })
            .eq("token", token);
          return Response.json({ ok: true }, { headers: corsHeaders });
        } catch (e: any) {
          return Response.json({ error: e?.message || "erro" }, { status: 500, headers: corsHeaders });
        }
      },
    },
  },
});
