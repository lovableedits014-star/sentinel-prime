// TEMPORARY restore endpoint — will be deleted after data migration
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const RESTORE_TOKEN = Deno.env.get("RESTORE_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  const auth = req.headers.get("x-restore-token");
  if (!auth || auth !== RESTORE_TOKEN) {
    return new Response("Forbidden", { status: 403 });
  }
  let sql: string;
  try {
    const body = await req.json();
    sql = body.sql;
    if (typeof sql !== "string" || sql.length === 0) throw new Error("missing sql");
  } catch (e) {
    return new Response(`Bad request: ${e instanceof Error ? e.message : e}`, { status: 400 });
  }
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { error } = await sb.rpc("__lovable_migrate_exec", { sql });
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ ok: true, bytes: sql.length }), {
    headers: { "content-type": "application/json" },
  });
});
