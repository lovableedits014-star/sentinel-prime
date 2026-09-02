import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { toWhatsAppBR } from "@/lib/phone-utils";

// POST /api/public/missao/identify
// Chama RPC SECURITY DEFINER (public_mission_identify) para operar sem service role.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function detectBot(ua: string | null): boolean {
  if (!ua) return false;
  // O navegador interno do WhatsApp e uma pessoa real. Somente crawlers de
  // preview devem ser excluidos das metricas.
  return /(facebookexternalhit|Twitterbot|LinkedInBot|Slackbot|TelegramBot|bot|crawler|spider|preview)/i.test(ua);
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
          const phone = toWhatsAppBR(body.phone);

          if (!missionId || !nome || !phone) {
            return Response.json({ error: "Dados inválidos" }, { status: 400, headers: corsHeaders });
          }

          const ua = request.headers.get("user-agent");
          const sb = makeClient();
          const { data, error } = await sb.rpc("public_mission_identify", {
            p_mission_id: missionId,
            p_code: code || null,
            p_nome: nome,
            p_phone: phone,
            p_user_agent: ua,
            p_device: detectDevice(ua),
            p_is_bot: detectBot(ua),
          });
          if (error) return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
          const payload: any = data || {};
          if (payload.error) {
            const status = payload.error === "Missão não encontrada" ? 404 : 400;
            return Response.json({ error: payload.error }, { status, headers: corsHeaders });
          }
          return Response.json(payload, { headers: corsHeaders });
        } catch (e: any) {
          return Response.json({ error: e?.message || "Erro" }, { status: 500, headers: corsHeaders });
        }
      },
    },
  },
});
