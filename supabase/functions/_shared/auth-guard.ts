// Shared auth guard for edge functions.
// Verifies a Bearer JWT and that the authenticated user owns or is a team member of the requested client.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token",
};

export type GuardResult =
  | { ok: true; userId: string; admin: ReturnType<typeof createClient> }
  | { ok: false; response: Response };

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Build an admin (service-role) client. */
export function getAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

/** Validates JWT + client membership. clientId may be null to only validate JWT. */
export async function requireClientAccess(
  req: Request,
  clientId: string | null | undefined,
): Promise<GuardResult> {
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return { ok: false, response: jsonError("unauthorized", 401) };

  const admin = getAdminClient();
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) {
    return { ok: false, response: jsonError("unauthorized", 401) };
  }
  const userId = userData.user.id;

  if (clientId) {
    const [{ data: owned }, { data: tm }] = await Promise.all([
      admin.from("clients").select("id").eq("id", clientId).eq("user_id", userId).maybeSingle(),
      admin.from("team_members").select("id").eq("client_id", clientId).eq("user_id", userId).maybeSingle(),
    ]);
    if (!owned && !tm) {
      return { ok: false, response: jsonError("forbidden", 403) };
    }
  }

  return { ok: true, userId, admin };
}

/** Returns true if the request is authenticated as a cron job via shared CRON_SECRET. */
export function isCronCaller(req: Request): boolean {
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret) return false;
  const cronHeader = req.headers.get("x-cron-token");
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  return cronHeader === cronSecret || bearer === cronSecret;
}
