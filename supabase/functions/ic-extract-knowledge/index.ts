import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callLLM, getClientLLMConfig } from "../_shared/llm-router.ts";
import { corsHeaders, errorResponse, jsonResponse, parseLooseJson } from "../_shared/ic-utils.ts";
import { generateEmbedding, buildDocEmbeddingText, EMBEDDING_MODEL } from "../_shared/embeddings.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type SourceType = "transcription" | "post" | "comment" | "manual" | "pdf" | "url" | "manual_doc";

const DOC_MODE_TYPES = new Set<SourceType>(["transcription", "pdf", "url", "manual_doc"]);
const TIPO_DOCUMENTO_MAP: Record<string, string> = {
  transcription: "transcricao",
  pdf: "pdf",
  url: "url",
  manual_doc: "nota_manual",
};

interface ExtractRequest {
  clientId: string;
  sourceType: SourceType;
  sourceId?: string;
  sourceUrl?: string;
  sourceDate?: string;
  text: string;
  triggerSuggestions?: boolean;
  providerOverride?: string;
  modelOverride?: string;
  apiKeyOverride?: string;
  extractionRunId?: string;
  // novo
  documentTitleHint?: string;
  audioUrl?: string;
}

const VALID_TIPOS = new Set([
  "promessa","proposta","bandeira","bairro","pessoa","adversario",
  "historia","bordao","numero","evento","dado","outro",
]);

/* =========================================================================
 * MODO DOCUMENTO (transcrições, discursos, entrevistas, posts longos)
 * - single-shot quando o texto cabe (≤ ~24k chars)
 * - map-reduce-consolidate quando é maior, mas SEMPRE produzindo 1 documento
 * - fatos derivados do documento, linkados a document_id
 * ========================================================================= */

const DOC_SYSTEM = `Você é um analista político brasileiro sênior. Sua missão é transformar uma fala/transcrição/entrevista do candidato em um DOCUMENTO ESTRUTURADO de memória.

Você NUNCA inventa. Tudo que aparecer no documento deve estar respaldado pelo texto original. Se um campo não tem informação no texto, devolva lista vazia ou string vazia.

Você produz um JSON único e coeso (não fragmentado). O objetivo é que esse documento sirva como fonte de verdade para outros sistemas (DNA do candidato, redator de matérias, sugestões de disparo, etc.).`;

function docUserPrompt(text: string, hint?: string) {
  return `${hint ? `CONTEXTO/TÍTULO SUGERIDO: ${hint}\n\n` : ""}TEXTO COMPLETO PARA ANÁLISE:
"""
${text}
"""

Extraia um documento estruturado em JSON puro (sem markdown, sem comentários):

{
  "titulo": "string curta e descritiva (até 80 chars). Capture tema central. Ex: 'Visita à UBS Moreninha — promessa de novo PSF'",
  "resumo_executivo": "3 a 5 frases que sintetizam a fala inteira em linguagem editorial, na 3ª pessoa",
  "pontos_principais": ["bullet 1", "bullet 2", "..."],
  "propostas": [
    { "titulo": "string", "descricao": "string", "bairro": "string|null", "tema": "saude|educacao|seguranca|...", "prazo": "string|null" }
  ],
  "promessas": [
    { "texto": "compromisso assumido", "tema": "string", "para_quem": "string|null" }
  ],
  "bandeiras": [
    { "tema": "string", "posicao": "como o candidato se posiciona, 1 frase" }
  ],
  "bordoes": [
    { "frase": "frase exata entre aspas no original", "ocorrencias": 1 }
  ],
  "pessoas_citadas": [
    { "nome": "string", "papel": "apoiador|liderança|familiar|adversário|outro", "contexto": "1 frase" }
  ],
  "bairros_citados": [
    { "nome": "nome exato como apareceu", "contexto": "o que disse sobre", "tipo_mencao": "visita|proposta|reclamacao|elogio" }
  ],
  "adversarios_citados": [
    { "nome_ou_referencia": "string", "tipo": "ataque|defesa|comparacao", "trecho": "trecho curto" }
  ],
  "numeros_e_dados": [
    { "valor": "ex: '3 creches' ou 'R$ 2 milhões'", "contexto": "1 frase" }
  ],
  "tom_emocional": "esperançoso|indignado|conciliador|combativo|empático|tecnico|outro",
  "tags": ["tema1", "tema2", "..."]
}

REGRAS:
- Não invente. Só extraia o que ESTÁ no texto.
- Bordões: só frases curtas e marcantes que se repetem ou que claramente são assinatura do candidato.
- Bairros: nome exato como apareceu (sem normalizar).
- Se o texto for muito curto/irrelevante, devolva o JSON com listas vazias mas com titulo + resumo.`;
}

interface DocumentJson {
  titulo: string;
  resumo_executivo: string;
  pontos_principais: string[];
  propostas: any[];
  promessas: any[];
  bandeiras: any[];
  bordoes: any[];
  pessoas_citadas: any[];
  bairros_citados: any[];
  adversarios_citados: any[];
  numeros_e_dados: any[];
  tom_emocional?: string;
  tags?: string[];
}

const SINGLE_SHOT_LIMIT = 24000; // chars
const CHUNK_SIZE = 12000;
const CHUNK_OVERLAP = 400;

function splitIntoChunks(text: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  if (text.length <= size) return [text];
  const out: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + size, text.length);
    out.push(text.slice(start, end));
    if (end >= text.length) break;
    start = end - overlap;
  }
  return out;
}

function emptyDoc(): DocumentJson {
  return {
    titulo: "Documento sem título",
    resumo_executivo: "",
    pontos_principais: [],
    propostas: [],
    promessas: [],
    bandeiras: [],
    bordoes: [],
    pessoas_citadas: [],
    bairros_citados: [],
    adversarios_citados: [],
    numeros_e_dados: [],
    tom_emocional: "outro",
    tags: [],
  };
}

async function extractDocSingleShot(
  llmConfig: any,
  text: string,
  hint?: string,
): Promise<DocumentJson> {
  const resp = await callLLM(llmConfig, {
    messages: [
      { role: "system", content: DOC_SYSTEM },
      { role: "user", content: docUserPrompt(text, hint) },
    ],
    maxTokens: 4500,
    temperature: 0.2,
  });
  const parsed = parseLooseJson<DocumentJson>(resp.content);
  return { ...emptyDoc(), ...parsed };
}

async function extractDocMapReduce(
  llmConfig: any,
  text: string,
  hint?: string,
): Promise<DocumentJson> {
  const chunks = splitIntoChunks(text);
  console.log(`[ic-extract-knowledge] map-reduce com ${chunks.length} chunks`);
  const partials: DocumentJson[] = [];
  for (let i = 0; i < chunks.length; i++) {
    try {
      const partial = await extractDocSingleShot(
        llmConfig,
        chunks[i],
        `${hint ?? ""} (parte ${i + 1}/${chunks.length} — extração parcial)`.trim(),
      );
      partials.push(partial);
    } catch (e) {
      console.error(`[ic-extract-knowledge] chunk ${i + 1}/${chunks.length} falhou`, e);
    }
  }
  if (partials.length === 0) return emptyDoc();
  if (partials.length === 1) return partials[0];

  // Consolidação: pede para o LLM unificar os JSONs parciais em UM coeso.
  const consolidationPrompt = `Você recebeu ${partials.length} extrações PARCIAIS de uma mesma fala/transcrição.
Sua tarefa é CONSOLIDAR tudo em UM ÚNICO documento estruturado, removendo duplicatas e mantendo coerência narrativa.

JSONs parciais:
${partials.map((p, i) => `--- PARTE ${i + 1} ---\n${JSON.stringify(p)}`).join("\n\n")}

Devolva APENAS o JSON consolidado no mesmo formato (titulo, resumo_executivo, pontos_principais, propostas, promessas, bandeiras, bordoes, pessoas_citadas, bairros_citados, adversarios_citados, numeros_e_dados, tom_emocional, tags). Sem markdown.`;

  const resp = await callLLM(llmConfig, {
    messages: [
      { role: "system", content: DOC_SYSTEM },
      { role: "user", content: consolidationPrompt },
    ],
    maxTokens: 5000,
    temperature: 0.2,
  });
  const merged = parseLooseJson<DocumentJson>(resp.content);
  return { ...emptyDoc(), ...merged };
}

async function extractDocument(
  llmConfig: any,
  text: string,
  hint?: string,
): Promise<DocumentJson> {
  if (text.length <= SINGLE_SHOT_LIMIT) return extractDocSingleShot(llmConfig, text, hint);
  return extractDocMapReduce(llmConfig, text, hint);
}

/* ---------- derivação de fatos a partir do documento ---------- */

interface DerivedFact {
  tipo: string;
  tema?: string;
  texto: string;
  contexto?: string;
  entidades?: any;
  confidence?: number;
}

function deriveFacts(doc: DocumentJson): DerivedFact[] {
  const facts: DerivedFact[] = [];

  for (const p of doc.propostas ?? []) {
    facts.push({
      tipo: "proposta",
      tema: p.tema,
      texto: p.titulo || p.descricao || "",
      contexto: p.descricao,
      entidades: { bairros: p.bairro ? [p.bairro] : [], valores: p.prazo ? [p.prazo] : [] },
      confidence: 0.9,
    });
  }
  for (const p of doc.promessas ?? []) {
    facts.push({ tipo: "promessa", tema: p.tema, texto: p.texto || "", confidence: 0.9 });
  }
  for (const b of doc.bandeiras ?? []) {
    facts.push({ tipo: "bandeira", tema: b.tema, texto: b.posicao || b.tema || "", confidence: 0.85 });
  }
  for (const b of doc.bordoes ?? []) {
    if (b.frase) facts.push({ tipo: "bordao", texto: `"${b.frase}"`, confidence: 0.8 });
  }
  for (const p of doc.pessoas_citadas ?? []) {
    if (p.nome) {
      facts.push({
        tipo: p.papel === "adversário" ? "adversario" : "pessoa",
        texto: `${p.nome}${p.papel ? ` (${p.papel})` : ""}`,
        contexto: p.contexto,
        entidades: { pessoas: [p.nome] },
        confidence: 0.8,
      });
    }
  }
  for (const b of doc.bairros_citados ?? []) {
    if (b.nome) {
      facts.push({
        tipo: "bairro",
        texto: `${b.nome}${b.tipo_mencao ? ` — ${b.tipo_mencao}` : ""}`,
        contexto: b.contexto,
        entidades: { bairros: [b.nome] },
        confidence: 0.85,
      });
    }
  }
  for (const a of doc.adversarios_citados ?? []) {
    facts.push({
      tipo: "adversario",
      texto: `${a.nome_ou_referencia}${a.tipo ? ` (${a.tipo})` : ""}`,
      contexto: a.trecho,
      confidence: 0.8,
    });
  }
  for (const n of doc.numeros_e_dados ?? []) {
    facts.push({ tipo: "numero", texto: n.valor || "", contexto: n.contexto, confidence: 0.85 });
  }
  return facts.filter((f) => f.texto && f.texto.trim().length > 1);
}

/* =========================================================================
 * MODO LEGADO (post / comment / manual) — mantém comportamento de chunks
 * ========================================================================= */

const LEGACY_SYSTEM = `Você é um analista político brasileiro extraindo fatos curtos de posts/comentários.
Tipos: promessa, proposta, bandeira, bairro, pessoa, adversario, historia, bordao, numero, evento, dado, outro.
Retorne JSON: { "fatos": [{ "tipo","tema","texto","contexto","entidades":{"bairros":[],"pessoas":[],"valores":[],"datas":[]}, "confidence": 0.0 }] }`;

async function extractLegacyFacts(llmConfig: any, text: string): Promise<DerivedFact[]> {
  const resp = await callLLM(llmConfig, {
    messages: [
      { role: "system", content: LEGACY_SYSTEM },
      {
        role: "user",
        content: `TEXTO:\n"""${text.slice(0, CHUNK_SIZE)}"""\n\nResponda APENAS o JSON.`,
      },
    ],
    maxTokens: 2500,
    temperature: 0.2,
  });
  const parsed = parseLooseJson<{ fatos?: DerivedFact[] }>(resp.content);
  return Array.isArray(parsed?.fatos) ? parsed.fatos : [];
}

/* =========================================================================
 * Handler principal
 * ========================================================================= */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as ExtractRequest;
    const {
      clientId, sourceType, sourceId, sourceUrl, sourceDate, text,
      triggerSuggestions = true, providerOverride, modelOverride, apiKeyOverride,
      extractionRunId, documentTitleHint, audioUrl,
    } = body || ({} as ExtractRequest);

    if (!clientId) return errorResponse("clientId é obrigatório", 400);
    if (!sourceType) return errorResponse("sourceType é obrigatório", 400);
    if (!text || text.trim().length < 30) return jsonResponse({ extracted: 0, skipped: "texto curto demais" });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const baseConfig = await getClientLLMConfig(admin, clientId);
    const llmConfig = {
      provider: (providerOverride as any) || baseConfig.provider,
      model: modelOverride || (providerOverride ? undefined : baseConfig.model),
      apiKey: apiKeyOverride || baseConfig.apiKey,
    } as any;
    if (!llmConfig.model) llmConfig.model = baseConfig.model;

    const runId = extractionRunId || crypto.randomUUID();
    const isDocMode = sourceType === "transcription"; // hoje, só transcrição vira documento

    let documentId: string | null = null;
    let derivedFacts: DerivedFact[] = [];

    if (isDocMode) {
      console.log(`[ic-extract-knowledge] DOC MODE — ${text.length} chars`);
      const doc = await extractDocument(llmConfig, text, documentTitleHint);

      // Apaga documento anterior dessa transcrição (re-processa) — fatos descem em cascata
      if (sourceId) {
        await admin
          .from("ic_knowledge_documents")
          .delete()
          .eq("client_id", clientId)
          .eq("transcription_id", sourceId);
      }

      const docRow = {
        client_id: clientId,
        transcription_id: sourceId ?? null,
        tipo_documento: "transcricao",
        titulo: (doc.titulo || documentTitleHint || "Transcrição").slice(0, 200),
        data_evento: sourceDate ?? null,
        texto_integral: text,
        resumo_executivo: doc.resumo_executivo || "",
        pontos_principais: doc.pontos_principais ?? [],
        propostas: doc.propostas ?? [],
        promessas: doc.promessas ?? [],
        bandeiras: doc.bandeiras ?? [],
        bordoes: doc.bordoes ?? [],
        pessoas_citadas: doc.pessoas_citadas ?? [],
        bairros_citados: doc.bairros_citados ?? [],
        adversarios_citados: doc.adversarios_citados ?? [],
        numeros_e_dados: doc.numeros_e_dados ?? [],
        tom_emocional: doc.tom_emocional ?? null,
        tags: Array.isArray(doc.tags) ? doc.tags.slice(0, 30) : [],
        status: "revisado",
        audio_url: audioUrl ?? null,
        provider: llmConfig.provider,
        model: llmConfig.model,
        extraction_run_id: runId,
      };

      const { data: insertedDoc, error: docErr } = await admin
        .from("ic_knowledge_documents")
        .insert(docRow)
        .select("id")
        .maybeSingle();
      if (docErr) {
        console.error("[ic-extract-knowledge] erro ao salvar documento:", docErr.message);
        return errorResponse("Falha ao salvar documento: " + docErr.message);
      }
      documentId = insertedDoc?.id ?? null;
      derivedFacts = deriveFacts(doc);

      // Gera embedding (best-effort) para busca semântica
      if (documentId) {
        try {
          const embText = buildDocEmbeddingText({ ...docRow, ...doc });
          const embedding = await generateEmbedding(embText);
          await admin
            .from("ic_knowledge_documents")
            .update({
              embedding: embedding as any,
              embedding_model: EMBEDDING_MODEL,
              embedded_at: new Date().toISOString(),
            })
            .eq("id", documentId);
        } catch (e: any) {
          console.warn("[ic-extract-knowledge] embedding falhou:", e?.message);
        }
      }
    } else {
      derivedFacts = await extractLegacyFacts(llmConfig, text);
    }

    // Limpa fatos antigos da mesma fonte (idempotência)
    if (sourceId) {
      await admin
        .from("candidate_knowledge")
        .delete()
        .eq("client_id", clientId)
        .eq("source_type", sourceType)
        .eq("source_id", sourceId);
    }

    let inserted = 0;
    const insertedRows: any[] = [];
    for (const f of derivedFacts) {
      if (!f?.texto || !VALID_TIPOS.has(f.tipo)) continue;
      const row: any = {
        client_id: clientId,
        source_type: sourceType,
        source_id: sourceId ?? null,
        source_url: sourceUrl ?? null,
        source_date: sourceDate ?? null,
        document_id: documentId,
        tipo: f.tipo,
        tema: f.tema?.toLowerCase().slice(0, 60) ?? null,
        texto: f.texto.slice(0, 1000),
        contexto: f.contexto?.slice(0, 1500) ?? null,
        entidades: f.entidades ?? {},
        confidence: typeof f.confidence === "number" ? Math.max(0, Math.min(1, f.confidence)) : 0.8,
        extraction_run_id: runId,
        provider: llmConfig.provider,
        model: llmConfig.model,
      };
      const { data, error } = await admin
        .from("candidate_knowledge")
        .insert(row)
        .select("id, tipo, tema, texto, entidades")
        .maybeSingle();
      if (!error && data) {
        inserted++;
        insertedRows.push(data);
      } else if (error) {
        console.log("[ic-extract-knowledge] skip:", error.message);
      }
    }

    if (triggerSuggestions && insertedRows.length > 0) {
      const hasBairros = insertedRows.some((r) => Array.isArray(r?.entidades?.bairros) && r.entidades.bairros.length > 0);
      const hasPessoas = insertedRows.some((r) => Array.isArray(r?.entidades?.pessoas) && r.entidades.pessoas.length > 0);
      if (hasBairros || hasPessoas) {
        fetch(`${SUPABASE_URL}/functions/v1/ic-suggest-dispatches`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
          body: JSON.stringify({ clientId, knowledgeIds: insertedRows.map((r) => r.id) }),
        }).catch((e) => console.error("[ic-extract-knowledge] suggest fire failed:", e));
      }
    }

    return jsonResponse({
      extracted: inserted,
      total_proposed: derivedFacts.length,
      extraction_run_id: runId,
      provider: llmConfig.provider,
      model: llmConfig.model,
      document_id: documentId,
      mode: isDocMode ? "document" : "facts",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("ic-extract-knowledge error:", msg);
    return errorResponse(msg);
  }
});
