import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

function detectBot(ua: string | null): boolean {
  if (!ua) return false;
  return /(facebookexternalhit|Twitterbot|LinkedInBot|Slackbot|TelegramBot|bot|crawler|spider|preview)/i.test(ua);
}

function detectDevice(ua: string | null): string {
  if (!ua) return "unknown";
  const value = ua.toLowerCase();
  if (/iphone|ipad|ios/.test(value)) return "ios";
  if (/android/.test(value)) return "android";
  if (/windows/.test(value)) return "windows";
  if (/mac os/.test(value)) return "mac";
  return "other";
}

function makeClient() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined as any },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input as any, { ...init, headers });
      },
    },
  });
}

function safeRedirect(destination: string) {
  const url = new URL(destination);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Destino invalido");
  return new Response(null, {
    status: 302,
    headers: {
      Location: url.toString(),
      "Cache-Control": "no-store, max-age=0",
      "Referrer-Policy": "no-referrer",
    },
  });
}

async function legacyDestination(
  supabase: ReturnType<typeof makeClient>,
  missionId: string,
  linkKey: string,
) {
  const { data } = await supabase.rpc("public_mission_config", {
    p_mission_id: missionId,
    p_code: null,
    p_token: null,
  });
  const config = data as any;
  const mission = config?.mission;
  if (!mission) return null;
  if (linkKey === "facebook") return mission.link_facebook || (mission.legacy_platform === "facebook" ? mission.legacy_post_url : null);
  if (linkKey === "instagram") return mission.link_instagram || (mission.legacy_platform === "instagram" ? mission.legacy_post_url : null);
  if (linkKey === "avulso") return mission.link_avulso || null;
  return (config.links || []).find((link: { id: string; url: string }) => link.id === linkKey)?.url || null;
}

export const Route = createFileRoute("/api/public/missao/go/$missionId/$linkKey")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        try {
          const requestUrl = new URL(request.url);
          const token = (requestUrl.searchParams.get("token") || "").trim();
          const code = (requestUrl.searchParams.get("code") || "").trim();
          if (!token) return new Response("Identificacao invalida", { status: 401 });

          const userAgent = request.headers.get("user-agent");
          const supabase = makeClient();
          const { data, error } = await supabase.rpc("public_mission_follow_link" as any, {
            p_mission_id: params.missionId,
            p_code: code || null,
            p_token: token,
            p_link_key: params.linkKey,
            p_user_agent: userAgent,
            p_device: detectDevice(userAgent),
            p_is_bot: detectBot(userAgent),
          } as any);
          if (error) {
            // Compatibilidade durante rollout: nunca bloqueia uma missao que ja
            // foi compartilhada se a migration ainda estiver propagando.
            const fallback = await legacyDestination(supabase, params.missionId, params.linkKey);
            return fallback ? safeRedirect(fallback) : new Response("Link indisponivel", { status: 500 });
          }

          const result = (data || {}) as { ok?: boolean; destination?: string; error?: string };
          if (!result.ok || !result.destination) {
            return new Response(result.error || "Link indisponivel", { status: 400 });
          }

          return safeRedirect(result.destination);
        } catch {
          return new Response("Nao foi possivel abrir este link", { status: 500 });
        }
      },
    },
  },
});
