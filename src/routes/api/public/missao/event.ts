import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

// POST /api/public/missao/event
// Registra evento via RPC SECURITY DEFINER (public_mission_event).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const ALLOWED = new Set([
  "open",
  "click_facebook",
  "click_instagram",
  "click_avulso",
  "click_link",
  "declared_done",
]);

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
          const linkId = String(body.linkId || "").trim();

          if (!missionId || !ALLOWED.has(type)) {
            return Response.json({ error: "Dados inválidos" }, { status: 400, headers: corsHeaders });
          }

          const ua = request.headers.get("user-agent");
          const sb = makeClient();
          const { data, error } = await sb.rpc("public_mission_event", {
            p_mission_id: missionId,
            p_code: code || null,
            p_token: token || null,
            p_type: type,
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
          return Response.json({ ok: true }, { headers: corsHeaders });
        } catch (e: any) {
          return Response.json({ error: e?.message || "Erro" }, { status: 500, headers: corsHeaders });
        }
      },
    },
  },
});
