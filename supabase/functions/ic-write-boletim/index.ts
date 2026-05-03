import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callLLM, getClientLLMConfig } from "../_shared/llm-router.ts";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/ic-utils.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface BoletimRequest {
  clientId: string;
  since?: string; // ISO date — default = hoje - 7 dias
  until?: string; // ISO date — default = hoje
  tema?: string;
  incluir?: { posts?: boolean; acoes?: boolean; visitas?: boolean };
  providerOverride?: string;
  modelOverride?: string;
  apiKeyOverride?: string;
  reprocessMateriaId?: string;
  briefing?: string; // orientação extra (usada na reescrita)
}

function startOfDay(iso: string) {
  const d = new Date(iso);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}
function endOfDay(iso: string) {
  const d = new Date(iso);
  d.setUTCHours(23, 59, 59, 999);
  return d.toISOString();
}
function fmtBR(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as BoletimRequest;
    const {
      clientId,
      since,
      until,
      tema,
      incluir = { posts: true, acoes: true, visitas: true },
      providerOverride,
      modelOverride,
      apiKeyOverride,
      reprocessMateriaId,
      briefing,
    } = body || ({} as BoletimRequest);

    if (!clientId) return errorResponse("clientId é obrigatório", 400);

    const today = new Date();
    const sevenAgo = new Date(today.getTime() - 7 * 86400000);
    const sinceIso = startOfDay(since || sevenAgo.toISOString());
    const untilIso = endOfDay(until || today.toISOString());

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: client } = await admin
      .from("clients")
      .select("name, cargo")
      .eq("id", clientId)
      .maybeSingle();

    // Período da semana ANTERIOR (mesma duração) — para comparativos
    const sinceMs = new Date(sinceIso).getTime();
    const untilMs = new Date(untilIso).getTime();
    const durationMs = untilMs - sinceMs;
    const prevSinceIso = new Date(sinceMs - durationMs - 86400000).toISOString();
    const prevUntilIso = new Date(sinceMs - 1).toISOString();

    // === COLETA: Posts (agregando por post_id na tabela comments) ===
    let postsAgg: any[] = [];
    let prevTotalComments = 0;
    let prevTotalPosts = 0;
    let respondidosPeloTime = 0;
    if (incluir.posts !== false) {
      const { data: rowsByCommentTime, error: rowsError } = await admin
        .from("comments")
        .select("post_id, post_message, post_permalink_url, post_full_picture, platform, comment_created_time, created_at, sentiment, text, status")
        .eq("client_id", clientId)
        .not("post_id", "is", null)
        .gte("comment_created_time", sinceIso)
        .lte("comment_created_time", untilIso)
        .limit(5000);
      if (rowsError) throw rowsError;
      const { data: rowsByCreatedAt, error: fallbackRowsError } = await admin
        .from("comments")
        .select("post_id, post_message, post_permalink_url, post_full_picture, platform, comment_created_time, created_at, sentiment, text, status")
        .eq("client_id", clientId)
        .not("post_id", "is", null)
        .is("comment_created_time", null)
        .gte("created_at", sinceIso)
        .lte("created_at", untilIso)
        .limit(1000);
      if (fallbackRowsError) throw fallbackRowsError;
      const rows = [...(rowsByCommentTime || []), ...(rowsByCreatedAt || [])];
      const map = new Map<string, any>();
      for (const r of rows || []) {
        if (!r.post_id) continue;
        const rowDate = r.comment_created_time || r.created_at;
        let p = map.get(r.post_id);
        if (!p) {
          p = {
            post_id: r.post_id,
            message: r.post_message || "",
            url: r.post_permalink_url || null,
            picture: r.post_full_picture || null,
            platform: r.platform || null,
            first_seen: rowDate,
            total: 0, pos: 0, neg: 0, neu: 0,
            comentarios_amostra: [] as string[],
          };
          map.set(r.post_id, p);
        }
        if (r.post_message && (!p.message || p.message.length < r.post_message.length)) p.message = r.post_message;
        if (r.post_permalink_url) p.url = r.post_permalink_url;
        if (r.post_full_picture) p.picture = r.post_full_picture;
        if (rowDate && (!p.first_seen || rowDate < p.first_seen)) p.first_seen = rowDate;
        p.total += 1;
        if (r.sentiment === "positive") p.pos += 1;
        else if (r.sentiment === "negative") p.neg += 1;
        else if (r.sentiment === "neutral") p.neu += 1;
        if (r.status === "responded" || r.status === "respondido") respondidosPeloTime += 1;
        if (p.comentarios_amostra.length < 3 && r.text && r.text !== "__post_stub__" && r.text.length > 8) {
          p.comentarios_amostra.push(String(r.text).slice(0, 140));
        }
      }
      postsAgg = Array.from(map.values()).sort((a, b) =>
        (a.first_seen || "").localeCompare(b.first_seen || ""),
      );

      // Comparativo: semana anterior (apenas contagem)
      const { data: prevRowsByCommentTime, error: prevRowsError } = await admin
        .from("comments")
        .select("post_id")
        .eq("client_id", clientId)
        .not("post_id", "is", null)
        .gte("comment_created_time", prevSinceIso)
        .lte("comment_created_time", prevUntilIso)
        .limit(5000);
      if (prevRowsError) throw prevRowsError;
      const { data: prevRowsByCreatedAt, error: prevFallbackRowsError } = await admin
        .from("comments")
        .select("post_id")
        .eq("client_id", clientId)
        .not("post_id", "is", null)
        .is("comment_created_time", null)
        .gte("created_at", prevSinceIso)
        .lte("created_at", prevUntilIso)
        .limit(1000);
      if (prevFallbackRowsError) throw prevFallbackRowsError;
      const prevRows = [...(prevRowsByCommentTime || []), ...(prevRowsByCreatedAt || [])];
      const prevSet = new Set<string>();
      for (const r of prevRows || []) { prevTotalComments++; if (r.post_id) prevSet.add(r.post_id); }
      prevTotalPosts = prevSet.size;
    }

    // === COLETA: Ações externas / agenda ===
    let acoes: any[] = [];
    if (incluir.acoes !== false) {
      const { data } = await admin
        .from("acoes_externas")
        .select("id, titulo, descricao, local, data_inicio, data_fim, cadastros_coletados, meta_cadastros, status, tag_nome")
        .eq("client_id", clientId)
        .gte("data_inicio", sinceIso)
        .lte("data_inicio", untilIso)
        .order("data_inicio", { ascending: true });
      acoes = data || [];
    }

    // === COLETA: Visitas registradas ===
    let visitas: any[] = [];
    if (incluir.visitas !== false) {
      const { data } = await admin
        .from("narrativa_visitas_realizadas")
        .select("id, uf, municipio, data_visita, temas_abordados, bairros_visitados, observacoes, resultado_percebido")
        .eq("client_id", clientId)
        .gte("data_visita", sinceIso.slice(0, 10))
        .lte("data_visita", untilIso.slice(0, 10))
        .order("data_visita", { ascending: true });
      visitas = data || [];
    }

    if (postsAgg.length === 0 && acoes.length === 0 && visitas.length === 0) {
      return jsonResponse({
        noData: true,
        saved: null,
        message: `Ainda não há postagens, ações ou visitas registradas entre ${fmtBR(sinceIso)} e ${fmtBR(untilIso)}. Sincronize as redes sociais ou amplie o período para gerar o boletim.`,
        periodo: { since: sinceIso, until: untilIso },
        stats: { posts: 0, comentarios: 0, acoes: 0, visitas: 0 },
      });
    }

    // === Estatísticas ===
    const totalComments = postsAgg.reduce((s, p) => s + p.total, 0);
    const totalPos = postsAgg.reduce((s, p) => s + p.pos, 0);
    const totalNeg = postsAgg.reduce((s, p) => s + p.neg, 0);
    const totalNeu = postsAgg.reduce((s, p) => s + p.neu, 0);
    const sentClassif = totalPos + totalNeg + totalNeu;
    const tomGeral = sentClassif === 0
      ? "neutro"
      : totalPos / sentClassif > 0.55 ? "positivo"
      : totalNeg / sentClassif > 0.40 ? "negativo"
      : "misto";
    const taxaResposta = totalComments > 0 ? Math.round((respondidosPeloTime / totalComments) * 100) : 0;
    const variacaoComentarios = prevTotalComments > 0
      ? Math.round(((totalComments - prevTotalComments) / prevTotalComments) * 100)
      : null;
    const variacaoPosts = prevTotalPosts > 0
      ? Math.round(((postsAgg.length - prevTotalPosts) / prevTotalPosts) * 100)
      : null;
    const topPosts = [...postsAgg].sort((a, b) => b.total - a.total).slice(0, 5);
    const stats = {
      posts: postsAgg.length,
      comentarios: totalComments,
      sentimento_positivo: totalPos,
      sentimento_negativo: totalNeg,
      sentimento_neutro: totalNeu,
      tom_geral: tomGeral,
      respondidos: respondidosPeloTime,
      taxa_resposta_pct: taxaResposta,
      acoes: acoes.length,
      visitas: visitas.length,
      semana_anterior: {
        comentarios: prevTotalComments,
        posts: prevTotalPosts,
        variacao_comentarios_pct: variacaoComentarios,
        variacao_posts_pct: variacaoPosts,
      },
      top_posts: topPosts.map((p, i) => ({
        rank: i + 1,
        platform: p.platform,
        message: (p.message || "").slice(0, 200),
        total: p.total,
        pos: p.pos,
        neg: p.neg,
        url: p.url,
      })),
    };

    // === Material bruto para a IA ===
    // Trim defensivo: garante que não estoure TPM mesmo com semana cheia.
    const MAX_POSTS = 25;
    const postsTrim = postsAgg.slice(-MAX_POSTS);
    const postsTxt = postsTrim
      .map((p, i) => {
        const data = p.first_seen ? fmtBR(p.first_seen) : "?";
        const sent = p.total > 0 ? `(${p.pos}👍 ${p.neg}👎 de ${p.total} comentários)` : "";
        return `[P${i + 1}] ${data} · ${p.platform || "?"} · ${sent}\n"${(p.message || "(sem texto)").slice(0, 350)}"${p.url ? `\nURL: ${p.url}` : ""}`;
      })
      .join("\n\n");

    const acoesTxt = acoes
      .map((a, i) => {
        const data = a.data_inicio ? fmtBR(a.data_inicio) : "?";
        const meta = a.meta_cadastros ? ` (meta: ${a.cadastros_coletados || 0}/${a.meta_cadastros} cadastros)` : "";
        return `[A${i + 1}] ${data} · ${a.titulo}${a.local ? ` em ${a.local}` : ""}${meta}${a.descricao ? ` — ${String(a.descricao).slice(0, 200)}` : ""}`;
      })
      .join("\n");

    const visitasTxt = visitas
      .map((v, i) => {
        const temas = Array.isArray(v.temas_abordados) ? v.temas_abordados.join(", ") : "";
        const bairros = Array.isArray(v.bairros_visitados) ? v.bairros_visitados.join(", ") : "";
        return `[V${i + 1}] ${v.data_visita} · ${v.municipio || "?"}/${v.uf || "?"}${bairros ? ` · bairros: ${bairros}` : ""}${temas ? ` · temas: ${temas}` : ""}${v.observacoes ? ` — ${String(v.observacoes).slice(0, 200)}` : ""}`;
      })
      .join("\n");

    const candidato = client?.name || "o candidato";
    const cargo = client?.cargo || "candidato";
    const periodoLabel = `${fmtBR(sinceIso)} a ${fmtBR(untilIso)}`;

    const systemPrompt = `Você é um redator político brasileiro experiente. Escreva um BOLETIM SEMANAL DETALHADO de ${candidato} (${cargo}) cobrindo o período de ${periodoLabel}.

REGRAS DE CONTEÚDO:
- USE APENAS o material da semana fornecido abaixo (postagens, ações, visitas). NÃO invente nada.
- NÃO use clichês como "agradeceu", "reafirmou compromisso", "destacou a importância". Só fatos concretos: o que foi feito, onde, com quem, quanto.
- Se um post não tem fato concreto (foi só agradecimento), não inclua.

ESTRUTURA OBRIGATÓRIA EM MARKDOWN:
1. PARÁGRAFO DE ABERTURA (4-6 linhas): contextualize a semana, o tom geral da recepção (${tomGeral}) e os 2-3 destaques mais relevantes. Cite números reais.
2. "## Panorama da semana" — 1 parágrafo analítico interpretando os indicadores: volume vs semana anterior, tom dos comentários, engajamento da base.
3. "## Em números" — bullets concisos com TODOS os indicadores fornecidos (postagens, comentários, tom, ações, visitas, taxa de resposta, variação vs semana anterior).
4. "## Destaques por tema" — Detecte 3 a 5 TEMAS dos posts/ações (ex: Saúde, Mobilidade, Educação, Agenda Comunitária, Eventos). Para cada um: ### Tema, seguido de 2-4 bullets curtos com fato + local/data + link "[ver post](URL)" quando houver. Se houver comentário relevante na amostra, cite entre aspas brevemente.
5. "## Top postagens" — Liste em bullets as 3-5 postagens com mais engajamento (use o ranking fornecido), com formato: "**N. [plataforma]** — resumo do post (X comentários · Y👍 Z👎). [Ver post](URL)".
6. "## Recepção da base" — 1 parágrafo + bullets sobre como a base reagiu (sentimento, comentários frequentes da amostra, tópicos que geraram mais discussão).
7. "## Agenda e território" — bullets cobrindo ações externas, visitas e bairros tocados (datas, locais, resultados).
8. "## Próxima semana — recomendações" — 3 a 5 bullets com sugestões de pauta/ação baseadas no que faltou ou no que pegou bem.

FORMATAÇÃO:
- Use markdown completo: '## ' para seções, '### ' para subseções, '- ' para bullets, '**negrito**' para datas/números-chave, '[texto](url)' para links.
- Linha em branco entre blocos.
- Tom jornalístico-analítico em Português do Brasil. Frases curtas e diretas.

Retorne JSON ESTRITO:
{
  "titulo": "Boletim semanal — ${periodoLabel}",
  "subtitulo": "1 frase resumindo a semana",
  "corpo": "markdown completo do boletim",
  "destaques": ["3 a 5 frases curtas com os principais fatos"],
  "temas_predominantes": ["lista de 3-5 temas detectados nos posts"],
  "recomendacoes_proxima_semana": ["3 a 5 sugestões objetivas"],
  "avisos": "string vazia ou observação relevante"
}
Sem markdown ao redor do JSON, sem comentários extras.`;

    const userPrompt = `PERÍODO: ${periodoLabel}
CANDIDATO: ${candidato} — ${cargo}
REGIÃO: não informada
${tema ? `\nTEMA/FOCO ESPECÍFICO: ${tema}\n` : ""}${
      reprocessMateriaId && briefing && briefing.trim().length >= 5
        ? `\n============ ORIENTAÇÃO DE CORREÇÃO (PRIORIDADE MÁXIMA) ============\n"""${briefing.trim()}"""\n`
        : ""
    }
============ ESTATÍSTICAS DA SEMANA ============
- Postagens: ${stats.posts}
- Comentários recebidos: ${stats.comentarios} (👍${stats.sentimento_positivo} / 👎${stats.sentimento_negativo} / 😐${stats.sentimento_neutro})
- Tom geral da recepção: ${tomGeral.toUpperCase()}
- Respondidos pela equipe: ${respondidosPeloTime} (${taxaResposta}% do total)
- Comparativo com semana anterior: ${variacaoComentarios !== null ? `${variacaoComentarios > 0 ? "+" : ""}${variacaoComentarios}% comentários` : "sem dados anteriores"}${variacaoPosts !== null ? ` · ${variacaoPosts > 0 ? "+" : ""}${variacaoPosts}% postagens` : ""}
- Ações externas: ${stats.acoes}
- Visitas registradas: ${stats.visitas}

============ TOP POSTAGENS (mais comentadas) ============
${topPosts.map((p, i) => `[T${i + 1}] ${p.platform || "?"} · ${p.total} coments (👍${p.pos} 👎${p.neg}) — "${(p.message || "").slice(0, 200)}"${p.url ? `\n   URL: ${p.url}` : ""}`).join("\n") || "(nenhuma)"}

============ POSTAGENS DA SEMANA ============
${postsTxt || "(nenhuma postagem registrada no período)"}

============ AMOSTRA DE COMENTÁRIOS DA BASE ============
${postsTrim.flatMap((p, i) => (p.comentarios_amostra || []).map((c: string) => `[P${i + 1}] "${c}"`)).slice(0, 25).join("\n") || "(sem amostra)"}

============ AÇÕES EXTERNAS / AGENDA ============
${acoesTxt || "(nenhuma ação registrada)"}

============ VISITAS REALIZADAS ============
${visitasTxt || "(nenhuma visita registrada)"}`;

    const baseConfig = await getClientLLMConfig(admin, clientId);
    const llmConfig: any = providerOverride
      ? { provider: providerOverride, model: modelOverride || undefined, apiKey: apiKeyOverride || baseConfig.apiKey }
      : { ...baseConfig, model: modelOverride || baseConfig.model };
    if (!llmConfig.model) llmConfig.model = baseConfig.model;
    // Auto-upgrade Groq: o default `llama-3.1-8b-instant` tem TPM de 6000 e estoura
    // facilmente com payloads de boletim. Sobe para 70b-versatile (12k TPM).
    if (llmConfig.provider === "groq" && !modelOverride && (!llmConfig.model || llmConfig.model.includes("8b-instant"))) {
      llmConfig.model = "llama-3.3-70b-versatile";
    }

    const resp = await callLLM(llmConfig, {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      maxTokens: 5000,
      temperature: 0.45,
    });

    // Parse defensivo
    let parsed: any;
    try {
      const cleaned = resp.content.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      const slice = cleaned.slice(start, end + 1);
      const sanitize = (raw: string) => {
        let out = ""; let inStr = false; let esc = false;
        for (let i = 0; i < raw.length; i++) {
          const ch = raw[i];
          if (esc) { out += ch; esc = false; continue; }
          if (ch === "\\") { out += ch; esc = true; continue; }
          if (ch === '"') { inStr = !inStr; out += ch; continue; }
          if (inStr) {
            if (ch === "\n") { out += "\\n"; continue; }
            if (ch === "\r") { out += "\\r"; continue; }
            if (ch === "\t") { out += "\\t"; continue; }
            const c = ch.charCodeAt(0);
            if (c < 0x20) { out += "\\u" + c.toString(16).padStart(4, "0"); continue; }
          }
          out += ch;
        }
        return out;
      };
      try { parsed = JSON.parse(slice); } catch { parsed = JSON.parse(sanitize(slice)); }
    } catch (e) {
      console.error("[ic-write-boletim] parse error:", e, resp.content?.slice(0, 400));
      return errorResponse("LLM retornou formato inválido", 500);
    }

    const fontesPayload = {
      tipo: "boletim",
      periodo: { since: sinceIso, until: untilIso },
      stats,
      posts_referenciados: postsAgg.map((p, i) => ({
        label: `P${i + 1}`,
        post_id: p.post_id,
        platform: p.platform,
        url: p.url,
        picture: p.picture,
        message: (p.message || "").slice(0, 280),
        first_seen: p.first_seen,
        total: p.total, pos: p.pos, neg: p.neg, neu: p.neu,
      })),
      acoes_referenciadas: acoes.map((a) => ({
        id: a.id, titulo: a.titulo, local: a.local, data_inicio: a.data_inicio,
        cadastros: a.cadastros_coletados, meta: a.meta_cadastros,
      })),
      visitas_referenciadas: visitas.map((v) => ({
        id: v.id, municipio: v.municipio, uf: v.uf, data_visita: v.data_visita,
        bairros: v.bairros_visitados, temas: v.temas_abordados,
      })),
    };

    const metadataPayload = {
      avisos: parsed.avisos || "",
      destaques: Array.isArray(parsed.destaques) ? parsed.destaques : [],
      temas_predominantes: Array.isArray(parsed.temas_predominantes) ? parsed.temas_predominantes : [],
      recomendacoes: Array.isArray(parsed.recomendacoes_proxima_semana) ? parsed.recomendacoes_proxima_semana : [],
      provider: resp.provider,
      model: resp.model,
      reprocessed_from: reprocessMateriaId || null,
    };

    let saved: any = null;
    if (reprocessMateriaId) {
      const { data: current } = await admin
        .from("materias_geradas")
        .select("*").eq("id", reprocessMateriaId).eq("client_id", clientId).maybeSingle();
      if (!current) return errorResponse("Boletim a reprocessar não encontrado", 404);
      const currentVersao = current.versao || 1;
      await admin.from("materias_versions").insert({
        materia_id: current.id,
        client_id: clientId,
        versao: currentVersao,
        provider: current.provider || current.metadata?.provider || null,
        model: current.model || current.metadata?.model || null,
        titulo: current.titulo,
        subtitulo: current.subtitulo,
        corpo: current.corpo,
        fontes: current.fontes || {},
        prompt_input: current.prompt_input,
        metadata: current.metadata || {},
      });
      const { data } = await admin
        .from("materias_geradas")
        .update({
          tipo: "boletim",
          tom: current.tom || "jornalistico",
          tema: tema ?? current.tema ?? null,
          titulo: (parsed.titulo || `Boletim ${periodoLabel}`).slice(0, 300),
          subtitulo: parsed.subtitulo ? String(parsed.subtitulo).slice(0, 500) : null,
          corpo: parsed.corpo || "",
          fontes: fontesPayload,
          status: "rascunho",
          prompt_input: briefing || `Boletim semanal ${periodoLabel}`,
          metadata: metadataPayload,
          versao: currentVersao + 1,
          provider: resp.provider,
          model: resp.model,
          updated_at: new Date().toISOString(),
        })
        .eq("id", reprocessMateriaId)
        .select("*").maybeSingle();
      saved = data;
    } else {
      const { data, error } = await admin
        .from("materias_geradas")
        .insert({
          client_id: clientId,
          tipo: "boletim",
          tom: "jornalistico",
          tema: tema ?? null,
          titulo: (parsed.titulo || `Boletim ${periodoLabel}`).slice(0, 300),
          subtitulo: parsed.subtitulo ? String(parsed.subtitulo).slice(0, 500) : null,
          corpo: parsed.corpo || "",
          fontes: fontesPayload,
          status: "rascunho",
          prompt_input: `Boletim semanal ${periodoLabel}`,
          metadata: metadataPayload,
          provider: resp.provider,
          model: resp.model,
          versao: 1,
        })
        .select("*").maybeSingle();
      if (error) console.error("[ic-write-boletim] save error:", error);
      saved = data;
    }

    return jsonResponse({
      boletim: parsed,
      saved,
      provider: resp.provider,
      model: resp.model,
      stats,
      periodo: { since: sinceIso, until: untilIso },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("ic-write-boletim error:", msg);
    return errorResponse(msg);
  }
});