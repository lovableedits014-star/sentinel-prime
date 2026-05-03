import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function shouldRunNow(cfg: any, now: Date): boolean {
  if (!cfg.enabled) return false;
  if (now.getUTCHours() !== cfg.hour_utc) return false;
  if (cfg.frequency === "weekly" && now.getUTCDay() !== cfg.weekday) return false;
  if (cfg.last_run_at) {
    const last = new Date(cfg.last_run_at).getTime();
    const minGap = cfg.frequency === "weekly" ? 6 * 24 * 3600 * 1000 : 23 * 3600 * 1000;
    if (now.getTime() - last < minGap) return false;
  }
  return true;
}

async function processClient(admin: any, cfg: any, triggeredBy: string) {
  const startedAt = new Date().toISOString();
  let linked = 0;
  let resolved = 0;
  let status = "success";
  let message: string | null = null;

  try {
    if (cfg.resolve_invalid_ids) {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/resolve-supporter-profiles`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_ROLE}`,
        },
        body: JSON.stringify({ client_id: cfg.client_id }),
      });
      if (res.ok) {
        const json = await res.json().catch(() => ({}));
        resolved = json.resolved ?? json.updated ?? (Array.isArray(json.details) ? json.details.length : 0);
      } else {
        message = `resolve falhou: ${res.status}`;
      }
    }

    if (cfg.relink_orphans) {
      const { data, error } = await admin.rpc("link_orphan_engagement_actions", {
        p_client_id: cfg.client_id,
      });
      if (error) throw error;
      linked = typeof data === "number" ? data : 0;
    }
  } catch (e: any) {
    status = "error";
    message = e?.message ?? String(e);
  }

  await admin.from("engagement_autoresolve_runs").insert({
    client_id: cfg.client_id,
    ran_at: startedAt,
    status,
    linked_count: linked,
    resolved_count: resolved,
    message,
    triggered_by: triggeredBy,
  });

  await admin
    .from("engagement_autoresolve_config")
    .update({
      last_run_at: startedAt,
      last_run_status: status,
      last_run_message: message,
    })
    .eq("client_id", cfg.client_id);

  return { client_id: cfg.client_id, status, linked, resolved, message };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const body = await req.json().catch(() => ({}));
  const force = body?.force === true;
  const onlyClient = body?.client_id as string | undefined;
  const triggeredBy = body?.triggered_by ?? (force ? "manual" : "cron");

  let query = admin.from("engagement_autoresolve_config").select("*").eq("enabled", true);
  if (onlyClient) query = query.eq("client_id", onlyClient);

  const { data: configs, error } = await query;
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const now = new Date();
  const results: any[] = [];
  for (const cfg of configs ?? []) {
    if (!force && !shouldRunNow(cfg, now)) continue;
    results.push(await processClient(admin, cfg, triggeredBy));
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});