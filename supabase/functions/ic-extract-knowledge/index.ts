import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callLLM, getClientLLMConfig } from "../_shared/llm-router.ts";
import { corsHeaders, errorResponse, jsonResponse, parseLooseJson } from "../_shared/ic-utils.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type SourceType = "transcription" | "post" | "comment" | "manual";

interface ExtractRequest {
  clientId: string;
  sourceType: SourceType;
  sourceId?: string;
  sourceUrl?: string;
  sourceDate?: string; // ISO
  text: string;
  triggerSuggestions?: boolean; // default true
  providerOverride?: string;
  modelOverride?: string;
  apiKeyOverride?: string;
  extractionRunId?: string;
}

interface ExtractedFact {
  tipo: string;
  tema?: string;
  texto: string;
  contexto?: string;
  entidades?: { bairros?: string[]; pessoas?: string[]; valores?: string[]; datas?: string[] };
  confidence?: number;
}

const VALID_TIPOS = new Set(["promessa","proposta","bandeira","bairro","pessoa","adversario","historia","bordao","numero","evento","dado","outro"]);

const SYSTEM_PROMPT = `Você é um analista político brasileiro especialista em extrair fatos estruturados de falas, postagens e comunicações de candidatos.

Sua tarefa: ler o texto fornecido e extrair TODOS os fatos relevantes, classificando cada um.

TIPOS PERMITIDOS:
- "promessa": compromisso assumido ("vou lutar por", "me comprometo")
- "proposta": ação concreta ("vamos construir 3 creches em X")
- "bandeira": pauta/causa defendida (saúde, segurança...)
- "bairro": menção a bairro/região
- "pessoa": pessoa citada nominalmente (apoiador, liderança, adversário)
- "adversario": ataque sofrido ou mencionado de adversário
- "historia": história pessoal/anedota usada como exemplo
- "bordao": frase marcante repetida que define o estilo do candidato
- "numero": dado/estatística citada ("60% das escolas")
- "evento": evento passado ("ontem visitei X")
- "dado": outro dado factual relevante
- "outro": só se nada acima encaixar

Para cada fato, extraia:
- texto: a frase resumida do fato (1 a 2 linhas, em português, na 3ª pessoa OU citação literal entre aspas se for um bordão)
- contexto: o trecho original em volta (até 200 caracteres) que originou o fato
- tema: rótulo curto normalizado (saude, seguranca, educacao, mobilidade, infraestrutura, economia, cultura, esporte, meio_ambiente, social, etc.)
- entidades.bairros: lista de bairros mencionados (use o nome exato como apareceu)
- entidades.pessoas: nomes próprios de pessoas citadas
- entidades.valores: números/valores ("3 creches", "R$ 2 milhões")
- entidades.datas: datas/períodos
- confidence: 0.0 a 1.0

REGRAS:
- Não invente fatos. Só extraia o que está explicitamente no texto.
- Se a mesma proposta aparece 2x, registre 1x.
- Bordões só se forem frases curtas e marcantes (não confunda com proposta).
- Se o texto for muito curto ou irrelevante, retorne lista vazia.`;

const CHUNK_SIZE = 12000;
const CHUNK_OVERLAP = 500;

function splitIntoChunks(text: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  if (text.length <= size) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + size, text.length);
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    start = end - overlap;
  }
  return chunks;
}

async function extractFactsFromChunk(
  llmConfig: any,
  chunk: string,
  chunkIdx: number,
  totalChunks: number,
): Promise<ExtractedFact[]> {
  const header =
    totalChunks > 1
      ? `PARTE ${chunkIdx + 1} de ${totalChunks} de uma TRANSCRIÇÃO ÍNTEGRA. Extraia fatos APENAS desta parte, mas mantenha coerência sabendo que o texto faz parte de um todo maior.\n\n`
      : "";

  const userPrompt = `${header}TEXTO PARA ANÁLISE:
"""
${chunk}
"""

Retorne APENAS um JSON no formato:
{
  "fatos": [
    { "tipo": "...", "tema": "...", "texto": "...", "contexto": "...", "entidades": { "bairros": [], "pessoas": [], "valores": [], "datas": [] }, "confidence": 0.85 }
  ]
}
Sem markdown, sem comentários.`;

  const resp = await callLLM(llmConfig, {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    maxTokens: 3500,
    temperature: 0.2,
  });

  const parsed = parseLooseJson<{ fatos?: ExtractedFact[] }>(resp.content);
  return Array.isArray(parsed?.fatos) ? parsed.fatos : [];
}

async function extractFactsViaLLM(
  supabase: any,
  clientId: string,
  text: string,
  sourceType: SourceType,
  override?: { provider?: string; model?: string; apiKey?: string },
): Promise<{ facts: ExtractedFact[]; provider: string; model: string }> {
  const baseConfig = await getClientLLMConfig(supabase, clientId);
  const llmConfig = {
    provider: (override?.provider as any) || baseConfig.provider,
    model: override?.model || (override?.provider ? undefined : baseConfig.model),
    apiKey: override?.apiKey || baseConfig.apiKey,
  } as any;
  // Se o provider mudou e não veio modelo, deixa o callLLM/router escolher default
  if (!llmConfig.model) llmConfig.model = baseConfig.model;

  // Para transcrições, GARANTIR que o texto INTEIRO seja a fonte da memória.
  // Para outros tipos (post/comment/manual) usamos um único chunk truncado.
  const isTranscription = sourceType === "transcription";
  const chunks = isTranscription ? splitIntoChunks(text) : [text.slice(0, CHUNK_SIZE)];

  console.log(
    `[ic-extract-knowledge] sourceType=${sourceType} fullLen=${text.length} chunks=${chunks.length} ${
      isTranscription ? "(modo TRANSCRIÇÃO ÍNTEGRA)" : "(modo single-chunk)"
    }`,
  );

  const all: ExtractedFact[] = [];
  for (let i = 0; i < chunks.length; i++) {
    try {
      const facts = await extractFactsFromChunk(llmConfig, chunks[i], i, chunks.length);
      all.push(...facts);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[ic-extract-knowledge] chunk ${i + 1}/${chunks.length} falhou:`, msg);
      // segue para o próximo chunk — não perdemos a transcrição inteira por causa de um erro
    }
  }

  // Dedup local por (tipo + texto normalizado) para evitar repetições do overlap
  const seen = new Set<string>();
  const dedup: ExtractedFact[] = [];
  for (const f of all) {
    if (!f?.texto || !f?.tipo) continue;
    const key = `${f.tipo}::${f.texto.trim().toLowerCase().slice(0, 200)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push(f);
  }
  return { facts: dedup, provider: llmConfig.provider, model: llmConfig.model };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as ExtractRequest;
    const { clientId, sourceType, sourceId, sourceUrl, sourceDate, text, triggerSuggestions = true } = body || ({} as ExtractRequest);

    if (!clientId) return errorResponse("clientId é obrigatório", 400);
    if (!sourceType) return errorResponse("sourceType é obrigatório", 400);
    if (!text || text.trim().length < 30) {
      return jsonResponse({ extracted: 0, skipped: "texto curto demais" });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { providerOverride, modelOverride, apiKeyOverride, extractionRunId } = body;
    const runId = extractionRunId || crypto.randomUUID();
    const { facts: fatos, provider: usedProvider, model: usedModel } =
      await extractFactsViaLLM(admin, clientId, text, sourceType, {
        provider: providerOverride,
        model: modelOverride,
        apiKey: apiKeyOverride,
      });
    if (!fatos.length) {
      return jsonResponse({ extracted: 0 });
    }

    let inserted = 0;
    const insertedRows: any[] = [];
    for (const f of fatos) {
      if (!f?.texto || !VALID_TIPOS.has(f.tipo)) continue;
      const row = {
        client_id: clientId,
        source_type: sourceType,
        source_id: sourceId ?? null,
        source_url: sourceUrl ?? null,
        source_date: sourceDate ?? null,
        tipo: f.tipo,
        tema: f.tema?.toLowerCase().slice(0, 60) ?? null,
        texto: f.texto.slice(0, 1000),
        contexto: f.contexto?.slice(0, 1500) ?? null,
        entidades: f.entidades ?? {},
        confidence: typeof f.confidence === "number" ? Math.max(0, Math.min(1, f.confidence)) : 0.7,
        extraction_run_id: runId,
        provider: usedProvider,
        model: usedModel,
      };
      // Dedup manual: evita depender de UNIQUE constraint (source_id pode ser NULL)
      let dupQuery = admin
        .from("candidate_knowledge")
        .select("id, tipo, tema, texto, entidades")
        .eq("client_id", clientId)
        .eq("source_type", sourceType)
        .eq("tipo", row.tipo)
        .eq("texto", row.texto)
        .limit(1);
      if (sourceId) dupQuery = dupQuery.eq("source_id", sourceId);
      else dupQuery = dupQuery.is("source_id", null);
      const { data: existing } = await dupQuery.maybeSingle();
      if (existing) {
        insertedRows.push(existing);
        continue;
      }
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

    // Dispara sugestões em background (fire-and-forget)
    if (triggerSuggestions && insertedRows.length > 0) {
      const hasBairros = insertedRows.some((r) => Array.isArray(r?.entidades?.bairros) && r.entidades.bairros.length > 0);
      const hasPessoas = insertedRows.some((r) => Array.isArray(r?.entidades?.pessoas) && r.entidades.pessoas.length > 0);
      if (hasBairros || hasPessoas) {
        // não esperamos a resposta
        fetch(`${SUPABASE_URL}/functions/v1/ic-suggest-dispatches`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_KEY}`,
          },
          body: JSON.stringify({ clientId, knowledgeIds: insertedRows.map((r) => r.id) }),
        }).catch((e) => console.error("[ic-extract-knowledge] suggest fire failed:", e));
      }
    }

    return jsonResponse({
      extracted: inserted,
      total_proposed: fatos.length,
      extraction_run_id: runId,
      provider: usedProvider,
      model: usedModel,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("ic-extract-knowledge error:", msg);
    return errorResponse(msg);
  }
});
