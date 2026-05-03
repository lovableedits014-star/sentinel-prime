import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callLLM, getClientLLMConfig } from "../_shared/llm-router.ts";
import { corsHeaders, errorResponse, jsonResponse, parseLooseJson } from "../_shared/ic-utils.ts";

/**
 * Gera 5 ideias por cliente. Pode ser chamada:
 *  - manualmente: { clientId }
 *  - via cron sem clientId: itera por todos os clientes ativos
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let clientIds: string[] = [];
    if (body.clientId) {
      clientIds = [body.clientId];
    } else {
      const { data: clients } = await supabase.from("clients").select("id");
      clientIds = (clients ?? []).map((c: any) => c.id);
    }

    const results: any[] = [];
    for (const clientId of clientIds) {
      try {
        const r = await generateForClient(supabase, clientId);
        results.push({ clientId, ok: true, ideas: r.length });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[ic-daily-ideas] client ${clientId} falhou: ${msg}`);
        results.push({ clientId, ok: false, error: msg });
      }
    }

    return jsonResponse({ results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("ic-daily-ideas error:", msg);
    return errorResponse(msg);
  }
});

async function generateForClient(supabase: any, clientId: string) {
  // Pega último snapshot do radar (se houver)
  const { data: snap } = await supabase
    .from("content_radar_snapshots")
    .select("*")
    .eq("client_id", clientId)
    .order("snapshot_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  // IED recente
  const { data: ied } = await supabase
    .from("ied_scores")
    .select("score, sentiment_score, growth_score, engagement_score, week_start")
    .eq("client_id", clientId)
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  const llmConfig = await getClientLLMConfig(supabase, clientId);

  const radarBlock = snap
    ? `RADAR (${snap.snapshot_date}):
- Temas quentes: ${JSON.stringify(snap.hot_topics).slice(0, 1500)}
- Perguntas em aberto: ${JSON.stringify(snap.open_questions).slice(0, 800)}
- Narrativas hostis: ${JSON.stringify(snap.hostile_narratives).slice(0, 800)}
- Pautas mobilizadoras: ${JSON.stringify(snap.mobilizing_pautas).slice(0, 800)}`
    : "(sem radar disponível)";

  const iedBlock = ied
    ? `IED da semana ${ied.week_start}: total ${ied.score}, sentimento ${ied.sentiment_score}, crescimento ${ied.growth_score}, engajamento ${ied.engagement_score}`
    : "(sem IED disponível)";

  const systemPrompt = `Você é um diretor de conteúdo político brasileiro.
Sugira 5 ideias de conteúdo acionáveis, variadas em formato e propósito.
Você NÃO publica nada — apenas oferece ideias para o candidato avaliar.
Retorne APENAS JSON, sem markdown:
{
  "ideas": [
    {
      "titulo": string,  // máx 80 chars
      "descricao": string,  // 1-2 frases
      "tema": string,  // ex: "saúde", "segurança"
      "tipo": "oportunidade"|"pergunta"|"contra-narrativa"|"mobilizacao"|"data",
      "score": number  // 0-100 relevância dado o contexto
    }
  ]
}`;

  const userPrompt = `Contexto:
${radarBlock}

${iedBlock}

Sugira 5 ideias variadas (misture tipos). Responda APENAS com o JSON.`;

  const resp = await callLLM(llmConfig, {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    maxTokens: 1800,
    temperature: 0.8,
  });

  const parsed = parseLooseJson<{ ideas: any[] }>(resp.content);
  const ideas = (parsed.ideas ?? []).slice(0, 5);

  // Insere no banco
  const inserts = ideas.map((i) => ({
    client_id: clientId,
    titulo: i.titulo ?? "Ideia sem título",
    descricao: i.descricao ?? null,
    tema: i.tema ?? null,
    tipo: i.tipo ?? "oportunidade",
    origem: "ai-daily",
    score: typeof i.score === "number" ? Math.max(0, Math.min(100, i.score)) : 60,
    status: "pendente",
    source_refs: { snapshot_date: snap?.snapshot_date ?? null },
  }));

  if (inserts.length > 0) {
    await supabase.from("content_ideas").insert(inserts);
  }
  return ideas;
}