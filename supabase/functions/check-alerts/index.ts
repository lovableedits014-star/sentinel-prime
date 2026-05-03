import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AlertPayload {
  client_id: string;
  tipo: string;
  severidade: string;
  titulo: string;
  descricao: string;
  dados?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { client_id } = await req.json();
    if (!client_id) {
      return new Response(JSON.stringify({ error: "client_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const alerts: AlertPayload[] = [];
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // ─── 1. SENTIMENT CRISIS: High volume of negative comments in last 24h ───
    const { data: recentNegative } = await supabase
      .from("comments")
      .select("id, text, author_name, comment_created_time")
      .eq("client_id", client_id)
      .eq("sentiment", "negative")
      .eq("is_page_owner", false)
      .gte("comment_created_time", oneDayAgo.toISOString())
      .order("comment_created_time", { ascending: false })
      .limit(50);

    const { data: recentTotal } = await supabase
      .from("comments")
      .select("id")
      .eq("client_id", client_id)
      .eq("is_page_owner", false)
      .gte("comment_created_time", oneDayAgo.toISOString())
      .limit(200);

    const negCount = recentNegative?.length || 0;
    const totalCount = recentTotal?.length || 0;
    const negRatio = totalCount > 0 ? negCount / totalCount : 0;

    if (negCount >= 5 && negRatio >= 0.4) {
      alerts.push({
        client_id,
        tipo: "crise",
        severidade: "critica",
        titulo: `🚨 Crise detectada: ${negCount} comentários negativos nas últimas 24h`,
        descricao: `${Math.round(negRatio * 100)}% dos comentários recentes são negativos. Ação imediata recomendada.`,
        dados: { negCount, totalCount, ratio: negRatio, samples: recentNegative?.slice(0, 3) },
      });
    } else if (negCount >= 3 && negRatio >= 0.3) {
      alerts.push({
        client_id,
        tipo: "sentimento_negativo",
        severidade: "alta",
        titulo: `⚠️ Sentimento negativo em alta: ${negCount} comentários negativos`,
        descricao: `${Math.round(negRatio * 100)}% dos comentários das últimas 24h são negativos.`,
        dados: { negCount, totalCount, ratio: negRatio },
      });
    }

    // ─── 2. UNANSWERED NEGATIVE: Negative comments pending response for 24h+ ───
    const { data: unansweredNeg } = await supabase
      .from("comments")
      .select("id, text, author_name, comment_created_time")
      .eq("client_id", client_id)
      .eq("sentiment", "negative")
      .eq("status", "pending")
      .eq("is_page_owner", false)
      .lte("comment_created_time", oneDayAgo.toISOString())
      .limit(20);

    if (unansweredNeg && unansweredNeg.length >= 3) {
      alerts.push({
        client_id,
        tipo: "sentimento_negativo",
        severidade: "alta",
        titulo: `🔴 ${unansweredNeg.length} comentários negativos sem resposta há +24h`,
        descricao: "Comentários negativos sem resposta podem escalar. Responda ou gerencie-os.",
        dados: { count: unansweredNeg.length, samples: unansweredNeg.slice(0, 3) },
      });
    }

    // ─── 3. ENGAGEMENT DROP: Compare last 7 days vs previous 7 days ───
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const { data: recentActions } = await supabase
      .from("engagement_actions")
      .select("id")
      .eq("client_id", client_id)
      .gte("action_date", sevenDaysAgo.toISOString())
      .limit(1000);

    const { data: previousActions } = await supabase
      .from("engagement_actions")
      .select("id")
      .eq("client_id", client_id)
      .gte("action_date", fourteenDaysAgo.toISOString())
      .lt("action_date", sevenDaysAgo.toISOString())
      .limit(1000);

    const recentCount = recentActions?.length || 0;
    const previousCount = previousActions?.length || 0;

    if (previousCount > 10 && recentCount < previousCount * 0.5) {
      const dropPct = Math.round((1 - recentCount / previousCount) * 100);
      alerts.push({
        client_id,
        tipo: "queda_engajamento",
        severidade: dropPct >= 70 ? "critica" : "alta",
        titulo: `📉 Engajamento caiu ${dropPct}% na última semana`,
        descricao: `De ${previousCount} para ${recentCount} interações. Considere criar missões ou conteúdo para reativar a base.`,
        dados: { recentCount, previousCount, dropPct },
      });
    }

    // ─── 4. OVERDUE CAMPAIGN TASKS ───
    const { data: overdueTasks } = await supabase
      .from("campanha_tarefas")
      .select("id, titulo, prazo, responsavel_id")
      .eq("client_id", client_id)
      .neq("status", "concluida")
      .lt("prazo", now.toISOString().split("T")[0])
      .limit(20);

    if (overdueTasks && overdueTasks.length >= 2) {
      alerts.push({
        client_id,
        tipo: "tarefa_atrasada",
        severidade: overdueTasks.length >= 5 ? "alta" : "media",
        titulo: `⏰ ${overdueTasks.length} tarefas de campanha atrasadas`,
        descricao: "Tarefas passaram do prazo definido. Verifique o Modo Campanha.",
        dados: { count: overdueTasks.length, tasks: overdueTasks.slice(0, 5) },
      });
    }

    // ─── 5. SUPPORTER INACTIVITY: No check-ins in 3 days ───
    const { data: recentCheckins } = await supabase
      .from("supporter_checkins")
      .select("id")
      .eq("client_id", client_id)
      .gte("checkin_date", threeDaysAgo.toISOString().split("T")[0])
      .limit(1);

    const { data: totalAccounts } = await supabase
      .from("supporter_accounts")
      .select("id")
      .eq("client_id", client_id)
      .limit(1);

    if (totalAccounts && totalAccounts.length > 0 && (!recentCheckins || recentCheckins.length === 0)) {
      alerts.push({
        client_id,
        tipo: "inatividade",
        severidade: "media",
        titulo: "😴 Nenhum check-in nos últimos 3 dias",
        descricao: "Apoiadores não fizeram check-in recentemente. Envie uma notificação push ou crie novas missões.",
      });
    }

    // ─── Deduplicate: Don't create if same tipo alert exists in last 6 hours ───
    const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    const { data: existingAlerts } = await supabase
      .from("alertas")
      .select("tipo")
      .eq("client_id", client_id)
      .eq("descartado", false)
      .gte("created_at", sixHoursAgo.toISOString());

    const existingTypes = new Set(existingAlerts?.map(a => a.tipo) || []);
    const newAlerts = alerts.filter(a => !existingTypes.has(a.tipo));

    // Insert new alerts
    if (newAlerts.length > 0) {
      await supabase.from("alertas").insert(newAlerts);
    }

    return new Response(
      JSON.stringify({
        analyzed: true,
        alerts_generated: newAlerts.length,
        alerts_skipped: alerts.length - newAlerts.length,
        types: newAlerts.map(a => a.tipo),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
