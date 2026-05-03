import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/**
 * Limpeza periódica de dados antigos para conter o crescimento do banco.
 *
 * Regras (conservadoras — nada que esteja vinculado a CRM ou ações é apagado):
 *  - comments  : > 180 dias E is_processed = true E sem engagement_action vinculada
 *  - action_logs : > 90 dias
 *  - dispatch_items : > 60 dias E status em ('sent','failed','delivered','read','blocked')
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const result: Record<string, number | string> = {};

  try {
    const now = new Date();
    const days = (d: number) => new Date(now.getTime() - d * 86400_000).toISOString();

    // 1) comments antigos sem ação vinculada
    const { data: oldComments, error: e1 } = await admin
      .from("comments")
      .select("id")
      .lt("created_at", days(180))
      .eq("is_processed", true)
      .limit(5000);
    if (e1) throw e1;

    let deletedComments = 0;
    if (oldComments && oldComments.length > 0) {
      const ids = oldComments.map((c: any) => c.id);
      // Filtrar os que NÃO têm engagement_action
      const { data: linked } = await admin
        .from("engagement_actions")
        .select("comment_id")
        .in("comment_id", ids);
      const linkedSet = new Set((linked ?? []).map((l: any) => l.comment_id));
      const safeToDelete = ids.filter((id) => !linkedSet.has(id));
      if (safeToDelete.length > 0) {
        const { error } = await admin.from("comments").delete().in("id", safeToDelete);
        if (!error) deletedComments = safeToDelete.length;
      }
    }
    result.comments_deleted = deletedComments;

    // 2) action_logs > 90 dias
    const { count: alCount, error: e2 } = await admin
      .from("action_logs")
      .delete({ count: "exact" })
      .lt("created_at", days(90));
    if (e2) result.action_logs_error = e2.message;
    result.action_logs_deleted = alCount ?? 0;

    // 3) dispatch_items finais > 60 dias
    const { count: diCount, error: e3 } = await admin
      .from("dispatch_items")
      .delete({ count: "exact" })
      .lt("created_at", days(60))
      .in("status", ["sent", "failed", "delivered", "read", "blocked"]);
    if (e3) result.dispatch_items_error = e3.message;
    result.dispatch_items_deleted = diCount ?? 0;

    result.ran_at = now.toISOString();
    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message ?? String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});