import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callLLM, getClientLLMConfig } from "../_shared/llm-router.ts";
import { corsHeaders, errorResponse, jsonResponse, parseLooseJson, sample } from "../_shared/ic-utils.ts";

// ===== Helpers para Radar++ =====
function ymd(d: Date) { return d.toISOString().slice(0, 10); }

function variation(curr: number, prev: number): { delta_pct: number; trend: "up" | "down" | "flat" | "new" } {
  if (prev === 0 && curr === 0) return { delta_pct: 0, trend: "flat" };
  if (prev === 0) return { delta_pct: 100, trend: "new" };
  const pct = Math.round(((curr - prev) / prev) * 100);
  return { delta_pct: pct, trend: pct >= 15 ? "up" : pct <= -15 ? "down" : "flat" };
}

/** Calcula score 0-100 de oportunidade. */
function opportunityScore(input: {
  volume: number;        // 0-N comentários no tema
  growthPct: number;     // variação semana vs semana
  sentimentScore: number; // -1 (muito negativo) a +1 (muito positivo)
  defenderEcho: number;   // 0-1 (quanto defensores 🔥 estão engajados no tema)
}): number {
  const volNorm = Math.min(input.volume / 30, 1) * 30;          // até 30 pts
  const growthNorm = Math.max(0, Math.min(input.growthPct / 200, 1)) * 25; // até 25 pts
  const sentNorm = ((input.sentimentScore + 1) / 2) * 20;       // até 20 pts
  const echoNorm = input.defenderEcho * 25;                     // até 25 pts
  return Math.round(volNorm + growthNorm + sentNorm + echoNorm);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { clientId, force = false, deep = false } = await req.json();
    if (!clientId) return errorResponse("clientId é obrigatório", 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Cache do dia
    const today = ymd(new Date());
    if (!force) {
      const { data: cached } = await supabase
        .from("content_radar_snapshots")
        .select("*")
        .eq("client_id", clientId)
        .eq("snapshot_date", today)
        .maybeSingle();
      if (cached) return jsonResponse({ snapshot: cached, cached: true });
    }

    // Janela: 7 dias (padrão) ou 14 (deep)
    const windowDays = deep ? 14 : 7;
    const sinceDate = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const since = sinceDate.toISOString();
    // Janela anterior (mesma duração) para comparação
    const prevSince = new Date(sinceDate.getTime() - windowDays * 24 * 60 * 60 * 1000).toISOString();

    // === FONTE 1: comentários da audiência (atual + janela anterior) em paralelo ===
    const [commentsCurr, commentsPrev, militants, alertasAtivos, recentPessoas, recentCheckins, holidaysResp] =
      await Promise.all([
        supabase.from("comments")
          .select("comment_id, text, sentiment, author_name, platform, post_message, comment_created_time, platform_user_id")
          .eq("client_id", clientId).eq("is_page_owner", false).neq("text", "__post_stub__")
          .gte("created_at", since).order("created_at", { ascending: false }).limit(800),
        supabase.from("comments")
          .select("text, sentiment, platform_user_id", { count: "exact", head: false })
          .eq("client_id", clientId).eq("is_page_owner", false).neq("text", "__post_stub__")
          .gte("created_at", prevSince).lt("created_at", since).limit(800),
        supabase.from("social_militants")
          .select("platform, platform_user_id, current_badge, author_name, total_30d_positive, total_30d_negative, last_seen_at")
          .eq("client_id", clientId),
        supabase.from("alertas")
          .select("id, tipo, severidade, titulo, descricao, dados, created_at")
          .eq("client_id", clientId).eq("descartado", false).eq("lido", false)
          .gte("created_at", since).order("created_at", { ascending: false }).limit(20),
        supabase.from("pessoas")
          .select("id, cidade, bairro, created_at, origem_contato")
          .eq("client_id", clientId).gte("created_at", since).limit(500),
        supabase.from("supporter_checkins")
          .select("id, checkin_date").eq("client_id", clientId)
          .gte("checkin_date", ymd(sinceDate)).limit(1000),
        // Feriados próximos (7 dias à frente) — invocação interna
        fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/holidays-fetch`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ year: new Date().getFullYear() }),
        }).then((r) => r.ok ? r.json() : null).catch(() => null),
      ]);

    const comments = commentsCurr.data ?? [];
    const prevComments = commentsPrev.data ?? [];

    if (comments.length === 0 && prevComments.length === 0) {
      const empty = {
        client_id: clientId,
        snapshot_date: today,
        hot_topics: [],
        open_questions: [],
        hostile_narratives: [],
        mobilizing_pautas: [],
        crisis_alerts: [],
        defender_pulse: [],
        calendar_hooks: [],
        base_signals: [],
        meta: { sample_size: 0, window_days: windowDays },
        total_signals: 0,
      };
      await supabase.from("content_radar_snapshots").upsert(empty, { onConflict: "client_id,snapshot_date" });
      return jsonResponse({ snapshot: empty, cached: false, empty: true });
    }

    // === Mapas de militância e badges ===
    const militantMap = new Map<string, string>();
    const defenderUsers = new Set<string>();
    const haterUsers = new Set<string>();
    for (const m of militants.data ?? []) {
      militantMap.set(`${m.platform}:${m.platform_user_id}`, m.current_badge ?? "observador");
      if (m.current_badge === "defensor" || m.current_badge === "elite") defenderUsers.add(`${m.platform}:${m.platform_user_id}`);
      if (m.current_badge === "hater" || m.current_badge === "critico") haterUsers.add(`${m.platform}:${m.platform_user_id}`);
    }

    // Enriquece comentários com badge
    const enriched = comments.map((c: any) => ({
      ...c,
      badge: militantMap.get(`${c.platform}:${c.platform_user_id}`) ?? "observador",
    }));

    // Sample para LLM (cabe em TPM de 6k do Groq)
    const sampleComments = sample(enriched, deep ? 60 : 40);
    const commentText = sampleComments
      .map((c: any, i: number) =>
        `[${i + 1}](${c.platform[0]}/${(c.sentiment ?? "?")[0]}/${c.badge[0]}) ${(c.text ?? "").replace(/\s+/g, " ").trim().slice(0, 140)}`
      )
      .join("\n");

    // === Variação semana vs semana (só por volume bruto e sentimento) ===
    const currStats = {
      total: comments.length,
      neg: comments.filter((c: any) => c.sentiment === "negative").length,
      pos: comments.filter((c: any) => c.sentiment === "positive").length,
    };
    const prevStats = {
      total: prevComments.length,
      neg: prevComments.filter((c: any) => c.sentiment === "negative").length,
      pos: prevComments.filter((c: any) => c.sentiment === "positive").length,
    };
    const totalVar = variation(currStats.total, prevStats.total);
    const negVar = variation(currStats.neg, prevStats.neg);
    const posVar = variation(currStats.pos, prevStats.pos);

    const llmConfig = await getClientLLMConfig(supabase, clientId);

    // === LLM: extrai temas e narrativas (mesmo prompt anterior, ligeiramente expandido) ===
    const systemPrompt = `Você é um analista político brasileiro especializado em escutar redes sociais.
A partir de comentários da audiência de um candidato, identifique sinais acionáveis para a comunicação.
Retorne APENAS JSON válido, sem markdown, no formato:
{
  "hot_topics": [{"tema": string, "volume": number, "sentimento_predominante": "positive"|"negative"|"neutral", "defensor_echo": number, "exemplos": [string]}],
  "open_questions": [{"pergunta": string, "frequencia": number, "exemplos": [string]}],
  "hostile_narratives": [{"narrativa": string, "autores_count": number, "exemplos": [string]}],
  "mobilizing_pautas": [{"pauta": string, "defensores_engajados": number, "exemplos": [string]}],
  "defender_pulse": [{"pauta": string, "principais_defensores": [string], "exemplos": [string]}]
}
Cada lista no máximo 5 itens, ordenados por relevância. "exemplos" = 1-2 trechos curtos REAIS.
"defensor_echo" é 0.0-1.0 (proporção de defensores entre quem comentou esse tema).
"defender_pulse" = pautas que os defensores 🔥 estão puxando ESPONTANEAMENTE (oportunidade de amplificar).`;

    const userPrompt = `Analise estes ${sampleComments.length} comentários (de ${comments.length} totais nos últimos ${windowDays} dias) e extraia o radar.

COMENTÁRIOS:
${commentText}

Identifique:
- TEMAS QUENTES: assuntos que mais aparecem (saúde, segurança, economia, etc.)
- PERGUNTAS EM ABERTO: dúvidas que aparecem várias vezes e ainda parecem sem resposta
- NARRATIVAS HOSTIS: ataques recorrentes (vindos principalmente de badges hater/critico)
- PAUTAS QUE MOBILIZAM: temas em que defensores (badges defensor/elite) reagem positivamente
- PULSO DOS DEFENSORES: pautas que os 🔥 estão puxando por conta própria (use o nome real deles em "principais_defensores" se aparecer)

Responda APENAS com o JSON.`;

    const resp = await callLLM(llmConfig, {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      maxTokens: deep ? 2200 : 1700,
      temperature: 0.4,
    });

    const parsed = parseLooseJson<any>(resp.content);

    // === Enriquecer hot_topics com score e variação ===
    const hot_topics = (parsed.hot_topics ?? []).slice(0, 5).map((t: any) => {
      const sentScore = t.sentimento_predominante === "positive" ? 0.6
        : t.sentimento_predominante === "negative" ? -0.6 : 0;
      const echo = typeof t.defensor_echo === "number" ? Math.max(0, Math.min(t.defensor_echo, 1)) : 0;
      const score = opportunityScore({
        volume: Number(t.volume) || 0,
        growthPct: totalVar.delta_pct, // proxy global da semana
        sentimentScore: sentScore,
        defenderEcho: echo,
      });
      return { ...t, score, week_trend: totalVar.trend, week_delta_pct: totalVar.delta_pct };
    }).sort((a: any, b: any) => b.score - a.score);

    // === FONTE 2: Crises ativas (a partir de alertas) ===
    const crisis_alerts = (alertasAtivos.data ?? [])
      .filter((a: any) => a.severidade === "critica" || a.severidade === "alta" || a.tipo?.includes("crise") || a.tipo?.includes("sentimento"))
      .slice(0, 5)
      .map((a: any) => ({
        alerta_id: a.id,
        titulo: a.titulo,
        descricao: a.descricao,
        severidade: a.severidade,
        tipo: a.tipo,
        urgent: a.severidade === "critica",
      }));
    // Se houve pico de negativos, adiciona alerta sintético
    if (negVar.trend === "up" && negVar.delta_pct >= 100 && currStats.neg >= 10) {
      crisis_alerts.unshift({
        titulo: `Comentários negativos subiram ${negVar.delta_pct}% nesta semana`,
        descricao: `${currStats.neg} negativos agora vs ${prevStats.neg} na semana anterior`,
        severidade: negVar.delta_pct >= 200 ? "critica" : "alta",
        tipo: "pico_negativo",
        urgent: negVar.delta_pct >= 200,
      });
    }

    // === FONTE 3: Defender Pulse (vem da LLM, mas filtramos pelo cruzamento real) ===
    const defender_pulse = (parsed.defender_pulse ?? []).slice(0, 5).map((d: any) => ({
      ...d,
      defenders_engajados: defenderUsers.size,
    }));

    // === FONTE 4: Calendar Hooks (próximos 7 dias) ===
    const calendar_hooks: any[] = [];
    const holidays = holidaysResp?.holidays ?? [];
    const todayDate = new Date();
    for (const h of holidays) {
      const hDate = new Date(h.date + "T12:00:00");
      const diffDays = Math.round((hDate.getTime() - todayDate.getTime()) / 86400000);
      if (diffDays >= 0 && diffDays <= 7) {
        calendar_hooks.push({
          date: h.date,
          nome: h.localName || h.name,
          dias_ate: diffDays,
          label: diffDays === 0 ? "Hoje" : diffDays === 1 ? "Amanhã" : `Em ${diffDays} dias`,
        });
      }
    }
    calendar_hooks.sort((a, b) => a.dias_ate - b.dias_ate);

    // === FONTE 5: Sinais da Base (CRM) ===
    const base_signals: any[] = [];
    if ((recentPessoas.data ?? []).length > 0) {
      const novosPorBairro: Record<string, number> = {};
      for (const p of recentPessoas.data ?? []) {
        const key = `${p.bairro || "?"} / ${p.cidade || "?"}`;
        novosPorBairro[key] = (novosPorBairro[key] ?? 0) + 1;
      }
      const topBairros = Object.entries(novosPorBairro)
        .filter(([k]) => k !== "? / ?")
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
      if (topBairros.length > 0) {
        base_signals.push({
          tipo: "novos_cadastros",
          titulo: `${recentPessoas.data?.length ?? 0} novos cadastros nos últimos ${windowDays} dias`,
          detalhe: topBairros.map(([k, n]) => `${k}: ${n}`).join(" · "),
        });
      }
    }
    const totalCheckins = recentCheckins.data?.length ?? 0;
    if (totalCheckins > 0) {
      base_signals.push({
        tipo: "checkins",
        titulo: `${totalCheckins} check-ins de apoiadores nos últimos ${windowDays} dias`,
        detalhe: "Base ativa — pauta de gratidão pode performar bem.",
      });
    }

    const total_signals =
      hot_topics.length +
      (parsed.open_questions?.length ?? 0) +
      (parsed.hostile_narratives?.length ?? 0) +
      (parsed.mobilizing_pautas?.length ?? 0) +
      crisis_alerts.length +
      defender_pulse.length +
      calendar_hooks.length +
      base_signals.length;

    const snapshot = {
      client_id: clientId,
      snapshot_date: today,
      hot_topics,
      open_questions: parsed.open_questions ?? [],
      hostile_narratives: parsed.hostile_narratives ?? [],
      mobilizing_pautas: parsed.mobilizing_pautas ?? [],
      crisis_alerts,
      defender_pulse,
      calendar_hooks,
      base_signals,
      meta: {
        sample_size: sampleComments.length,
        total: comments.length,
        window_days: windowDays,
        deep,
        prev_window: { total: prevStats.total, neg: prevStats.neg, pos: prevStats.pos },
        curr_window: currStats,
        variation: { total: totalVar, neg: negVar, pos: posVar },
        defenders_count: defenderUsers.size,
        haters_count: haterUsers.size,
      },
      total_signals,
    };

    await supabase.from("content_radar_snapshots").upsert(snapshot, { onConflict: "client_id,snapshot_date" });

    return jsonResponse({ snapshot, cached: false });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("ic-radar error:", msg);
    return errorResponse(msg);
  }
});