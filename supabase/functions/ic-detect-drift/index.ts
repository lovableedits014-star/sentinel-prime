// Detecta drift (mudança) de discurso por tema entre janelas temporais.
// Agrupa documentos em períodos (default: trimestres dos últimos 12 meses),
// agrupa por tema (tags), e usa LLM para detectar mudanças relevantes
// entre o período mais recente e os anteriores.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callLLM, getClientLLMConfig } from "../_shared/llm-router.ts";
import { corsHeaders, errorResponse, jsonResponse, parseLooseJson } from "../_shared/ic-utils.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Req {
  clientId: string;
  janelas?: number;        // quantas janelas (default 4 → 4 trimestres)
  janelaDias?: number;     // tamanho de cada janela em dias (default 90)
  replace?: boolean;       // apaga análises antigas com status "novo"
  minDocsPorTema?: number; // mínimo de docs por tema p/ analisar (default 2)
}

const SYSTEM = `Você é um analista político brasileiro sênior, especializado em evolução de discurso de candidatos.
Sua missão: detectar MUDANÇAS REAIS no discurso do mesmo candidato entre dois períodos sobre um mesmo tema.

Tipos de mudança:
- "intensificacao": tema ganhou muito mais espaço/ênfase
- "abandono": tema sumiu ou ficou marginal
- "mudanca_posicao": posição/visão sobre o tema mudou
- "mudanca_tom": tom emocional mudou (ex: combativo → conciliador)
- "novo_recorte": mesmo tema, mas com foco/ângulo diferente
- "promessa_nova": apareceram promessas/propostas novas
- "estavel": discurso se mantém — NÃO emita drift nesse caso

Regras:
- NUNCA invente. Só aponte drift se houver evidência clara nos textos.
- Diferenças mínimas de palavras NÃO são drift.
- Severidade: "alta" (mudança estratégica visível), "media" (notável), "baixa" (sutil).`;

function ymd(d: Date) { return d.toISOString().slice(0, 10); }

function buildUserPrompt(tema: string, janelaA: any, janelaB: any) {
  const compact = (j: any) => ({
    periodo: `${j.inicio} a ${j.fim}`,
    n_documentos: j.docs.length,
    tom_predominante: j.tomPredominante,
    documentos: j.docs.slice(0, 12).map((d: any) => ({
      data: d.data_evento,
      titulo: d.titulo,
      resumo: (d.resumo_executivo || "").slice(0, 400),
      propostas: (d.propostas || []).slice(0, 6),
      promessas: (d.promessas || []).slice(0, 6),
      bordoes: (d.bordoes || []).slice(0, 4),
    })),
  });
  return `Tema: "${tema}"

PERÍODO ANTERIOR:
${JSON.stringify(compact(janelaA), null, 2)}

PERÍODO ATUAL (mais recente):
${JSON.stringify(compact(janelaB), null, 2)}

Compare os dois períodos sobre este tema. Devolva JSON puro:
{
  "mudou": true|false,
  "tipo": "intensificacao|abandono|mudanca_posicao|mudanca_tom|novo_recorte|promessa_nova|estavel",
  "severidade": "alta|media|baixa",
  "titulo": "frase curta (até 90 chars) descrevendo a mudança",
  "descricao": "2-4 frases explicando a mudança com base nas evidências",
  "exemplos": [
    { "periodo": "anterior|atual", "trecho": "citação ou paráfrase curta", "data": "YYYY-MM-DD" }
  ]
}

Se o discurso permaneceu estável, devolva {"mudou": false}.`;
}

function tomFreq(docs: any[]): string {
  const map = new Map<string, number>();
  for (const d of docs) {
    const t = (d.tom_emocional || "").toString().trim().toLowerCase();
    if (!t) continue;
    map.set(t, (map.get(t) || 0) + 1);
  }
  let best = ""; let bestN = 0;
  for (const [k, v] of map.entries()) if (v > bestN) { best = k; bestN = v; }
  return best || "indefinido";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = (await req.json().catch(() => ({}))) as Req;
    const { clientId, replace = true } = body || ({} as Req);
    const janelas = Math.max(2, Math.min(6, body.janelas ?? 4));
    const janelaDias = Math.max(15, Math.min(180, body.janelaDias ?? 90));
    const minDocsPorTema = Math.max(1, body.minDocsPorTema ?? 2);
    if (!clientId) return errorResponse("clientId obrigatório", 400);

    const { requireClientAccess } = await import("../_shared/auth-guard.ts");
    const guard = await requireClientAccess(req, clientId);
    if (!guard.ok) return guard.response;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Janela total = janelas * janelaDias
    const totalDias = janelas * janelaDias;
    const inicioGeral = new Date(); inicioGeral.setDate(inicioGeral.getDate() - totalDias);

    const { data: docs, error } = await admin
      .from("ic_knowledge_documents")
      .select("id, titulo, resumo_executivo, data_evento, created_at, tags, propostas, promessas, bordoes, tom_emocional")
      .eq("client_id", clientId)
      .gte("data_evento", ymd(inicioGeral))
      .order("data_evento", { ascending: true });
    if (error) return errorResponse(error.message);

    if (!docs || docs.length < 4) {
      return jsonResponse({ ok: true, mensagem: "Documentos insuficientes para análise (mínimo 4).", drifts: 0, docs: docs?.length ?? 0 });
    }

    // Monta janelas (mais recentes primeiro)
    const hoje = new Date();
    const buckets: { inicio: string; fim: string; docs: any[]; tomPredominante: string }[] = [];
    for (let i = 0; i < janelas; i++) {
      const fim = new Date(hoje); fim.setDate(fim.getDate() - i * janelaDias);
      const inicio = new Date(fim); inicio.setDate(inicio.getDate() - janelaDias);
      const inWindow = docs.filter((d: any) => {
        const dt = new Date(d.data_evento || d.created_at);
        return dt > inicio && dt <= fim;
      });
      buckets.push({ inicio: ymd(inicio), fim: ymd(fim), docs: inWindow, tomPredominante: tomFreq(inWindow) });
    }
    // buckets[0] = atual, buckets[1..n] = anteriores

    // Coleta temas (tags) por janela com contagem
    const temasGlobais = new Map<string, number>();
    for (const d of docs) {
      for (const t of (d.tags || [])) {
        const tema = (typeof t === "string" ? t : t?.nome || "").toString().trim().toLowerCase();
        if (!tema || tema.length < 3) continue;
        temasGlobais.set(tema, (temasGlobais.get(tema) || 0) + 1);
      }
    }
    // Filtra temas que aparecem em pelo menos minDocsPorTema docs
    const temasCandidatos = [...temasGlobais.entries()]
      .filter(([, n]) => n >= minDocsPorTema)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([t]) => t);

    if (temasCandidatos.length === 0) {
      return jsonResponse({ ok: true, mensagem: "Nenhum tema recorrente encontrado.", drifts: 0 });
    }

    // Função que filtra docs de uma janela por tema
    function filtrarPorTema(janela: typeof buckets[0], tema: string) {
      return {
        ...janela,
        docs: janela.docs.filter((d: any) =>
          (d.tags || []).some((t: any) => {
            const x = (typeof t === "string" ? t : t?.nome || "").toString().trim().toLowerCase();
            return x === tema;
          }),
        ),
      };
    }

    // LLM
    let llmConfig;
    try { llmConfig = await getClientLLMConfig(admin, clientId); }
    catch (e: any) { return errorResponse(`LLM não configurado: ${e?.message || e}`, 400); }

    const atual = buckets[0];
    const drifts: any[] = [];

    for (const tema of temasCandidatos) {
      const aTema = filtrarPorTema(atual, tema);
      // Compara com a janela imediatamente anterior que tenha dados desse tema
      let comparacao: typeof buckets[0] | null = null;
      for (let i = 1; i < buckets.length; i++) {
        const b = filtrarPorTema(buckets[i], tema);
        if (b.docs.length > 0) { comparacao = b; break; }
      }
      if (!comparacao) continue;
      // Precisa ter algo em ao menos uma das duas janelas
      if (aTema.docs.length === 0 && comparacao.docs.length === 0) continue;

      try {
        const resp = await callLLM(llmConfig, {
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: buildUserPrompt(tema, comparacao, aTema) },
          ],
          temperature: 0.3,
          maxTokens: 800,
        });
        const parsed = parseLooseJson<any>(resp.content);
        if (!parsed?.mudou || parsed?.tipo === "estavel") continue;

        drifts.push({
          client_id: clientId,
          tema,
          periodo_inicio: comparacao.inicio,
          periodo_fim: atual.fim,
          tipo_mudanca: parsed.tipo || "mudanca",
          severidade: parsed.severidade || "media",
          titulo: (parsed.titulo || `Mudança no discurso sobre ${tema}`).slice(0, 200),
          descricao: parsed.descricao || "",
          exemplos: Array.isArray(parsed.exemplos) ? parsed.exemplos.slice(0, 6) : [],
          documentos_analisados: aTema.docs.length + comparacao.docs.length,
          metadata: {
            janela_atual: { inicio: atual.inicio, fim: atual.fim, n: aTema.docs.length, tom: aTema.tomPredominante },
            janela_anterior: { inicio: comparacao.inicio, fim: comparacao.fim, n: comparacao.docs.length, tom: comparacao.tomPredominante },
            llm_provider: resp.provider,
            llm_model: resp.model,
          },
        });
      } catch (e: any) {
        console.error(`[ic-detect-drift] tema "${tema}":`, e?.message);
      }
    }

    if (replace) {
      await admin.from("ic_drift_analyses")
        .delete()
        .eq("client_id", clientId)
        .eq("status", "novo");
    }

    if (drifts.length > 0) {
      const { error: insErr } = await admin.from("ic_drift_analyses").insert(drifts);
      if (insErr) return errorResponse(insErr.message);
    }

    return jsonResponse({
      ok: true,
      drifts: drifts.length,
      temas_analisados: temasCandidatos.length,
      docs_total: docs.length,
    });
  } catch (e: any) {
    console.error("[ic-detect-drift]", e?.message);
    return errorResponse(e?.message || "Erro");
  }
});
