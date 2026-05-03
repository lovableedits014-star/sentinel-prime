import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) throw new Error("Unauthorized");

    const { clientId } = await req.json();
    if (!clientId) throw new Error("clientId required");

    // Verify ownership
    const { data: client } = await supabase
      .from("clients")
      .select("id")
      .eq("id", clientId)
      .eq("user_id", user.id)
      .single();
    if (!client) throw new Error("Client not found");

    const now = new Date();
    // Current week start (Monday)
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
    weekStart.setHours(0, 0, 0, 0);
    const weekStartStr = weekStart.toISOString().split("T")[0];

    // 30 days ago
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);

    // 60 days ago (for growth comparison)
    const sixtyDaysAgo = new Date(now);
    sixtyDaysAgo.setDate(now.getDate() - 60);

    // ── 1. SENTIMENT SCORE (0-100) ──
    // Ratio of positive comments vs total analyzed
    const { data: comments } = await supabase
      .from("comments")
      .select("sentiment")
      .eq("client_id", clientId)
      .not("text", "eq", "__post_stub__")
      .eq("is_page_owner", false)
      .not("sentiment", "is", null)
      .gte("comment_created_time", thirtyDaysAgo.toISOString());

    const totalAnalyzed = comments?.length || 0;
    const positiveCount = comments?.filter(c => c.sentiment === "positive").length || 0;
    const negativeCount = comments?.filter(c => c.sentiment === "negative").length || 0;
    const neutralCount = comments?.filter(c => c.sentiment === "neutral").length || 0;

    // Weighted: positive=100, neutral=50, negative=0
    let sentimentScore = 0;
    if (totalAnalyzed > 0) {
      sentimentScore = Math.round(
        ((positiveCount * 100) + (neutralCount * 50) + (negativeCount * 0)) / totalAnalyzed
      );
    }

    // ── 2. GROWTH SCORE (0-100) ──
    // Crescimento da base política (pessoas) nos últimos 30 dias vs 30 anteriores
    const { count: recentPessoas } = await supabase
      .from("pessoas")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .gte("created_at", thirtyDaysAgo.toISOString());

    const { count: previousPessoas } = await supabase
      .from("pessoas")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .gte("created_at", sixtyDaysAgo.toISOString())
      .lt("created_at", thirtyDaysAgo.toISOString());

    const { count: totalPessoas } = await supabase
      .from("pessoas")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId);

    let growthScore = 0;
    const recent = recentPessoas || 0;
    const previous = previousPessoas || 0;
    if (previous > 0) {
      const growthRate = ((recent - previous) / previous) * 100;
      growthScore = Math.round(Math.max(0, Math.min(100, 50 + growthRate / 2)));
    } else if (recent > 0) {
      growthScore = 80;
    } else {
      growthScore = (totalPessoas || 0) > 0 ? 30 : 0;
    }

    // ── 3. ENGAGEMENT SCORE (0-100) ──
    // % de pessoas com nível de apoio "apoiador"/"militante" + interações registradas
    const { count: totalApoio } = await supabase
      .from("pessoas")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .in("nivel_apoio", ["apoiador", "militante"]);

    const { count: totalInteracoes30d } = await supabase
      .from("interacoes_pessoa")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .gte("criado_em", thirtyDaysAgo.toISOString());

    const apoioRatio = (totalPessoas || 0) > 0
      ? Math.min(1, (totalApoio || 0) / (totalPessoas || 1))
      : 0;
    // Meta: pelo menos 1 interação por pessoa nos últimos 30 dias
    const interacoesRatio = (totalPessoas || 0) > 0
      ? Math.min(1, (totalInteracoes30d || 0) / (totalPessoas || 1))
      : 0;
    const engagementScore = Math.round(apoioRatio * 100 * 0.6 + interacoesRatio * 100 * 0.4);

    // ── 4. CHECK-IN SCORE (0-100) ──
    // Frequência de check-ins de contratados + funcionários com presença obrigatória
    const { count: contratadosObrig } = await supabase
      .from("contratados")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .eq("presenca_obrigatoria", true)
      .eq("status", "ativo");

    const { count: funcionariosObrig } = await supabase
      .from("funcionarios")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .eq("presenca_obrigatoria", true)
      .eq("status", "ativo");

    const { count: contratadoCheckins } = await supabase
      .from("contratado_checkins")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .gte("checkin_at", thirtyDaysAgo.toISOString());

    const { count: funcionarioCheckins } = await supabase
      .from("funcionario_checkins")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .gte("checkin_at", thirtyDaysAgo.toISOString());

    const totalObrig = (contratadosObrig || 0) + (funcionariosObrig || 0);
    const totalCheckins = (contratadoCheckins || 0) + (funcionarioCheckins || 0);
    let checkinScore = 0;
    if (totalObrig > 0) {
      // Ideal: ~22 dias úteis em 30 dias por pessoa com presença obrigatória
      const idealCheckins = totalObrig * 22;
      checkinScore = Math.round(Math.min(100, (totalCheckins / idealCheckins) * 100));
    } else if (totalCheckins > 0) {
      checkinScore = 50; // Há check-ins mas ninguém marcado como obrigatório
    }

    // ── FINAL IED SCORE ──
    // Weighted average
    const finalScore = Math.round(
      sentimentScore * 0.30 +
      growthScore * 0.25 +
      engagementScore * 0.25 +
      checkinScore * 0.20
    );

    const details = {
      sentiment: { total: totalAnalyzed, positive: positiveCount, negative: negativeCount, neutral: neutralCount },
      growth: { recent, previous, total: totalPessoas || 0 },
      engagement: {
        pessoasAltoApoio: totalApoio || 0,
        totalPessoas: totalPessoas || 0,
        interacoes30d: totalInteracoes30d || 0,
      },
      checkins: {
        contratadoCheckins: contratadoCheckins || 0,
        funcionarioCheckins: funcionarioCheckins || 0,
        totalObrigatorios: totalObrig,
      },
    };

    // Upsert score for current week
    const { error: upsertError } = await supabase
      .from("ied_scores")
      .upsert({
        client_id: clientId,
        score: finalScore,
        sentiment_score: sentimentScore,
        growth_score: growthScore,
        engagement_score: engagementScore,
        checkin_score: checkinScore,
        week_start: weekStartStr,
        details,
      }, { onConflict: "client_id,week_start" });

    if (upsertError) {
      console.error("Upsert error:", upsertError);
      throw new Error("Failed to save IED score");
    }

    // Fetch last 12 weeks of history
    const { data: history } = await supabase
      .from("ied_scores")
      .select("*")
      .eq("client_id", clientId)
      .order("week_start", { ascending: true })
      .limit(12);

    return new Response(JSON.stringify({
      success: true,
      current: {
        score: finalScore,
        sentiment_score: sentimentScore,
        growth_score: growthScore,
        engagement_score: engagementScore,
        checkin_score: checkinScore,
        details,
      },
      history: history || [],
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("IED calc error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
