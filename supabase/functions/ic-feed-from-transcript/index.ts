import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callLLM, getClientLLMConfig } from "../_shared/llm-router.ts";
import { corsHeaders, errorResponse, jsonResponse, parseLooseJson } from "../_shared/ic-utils.ts";

/**
 * Gera um post pronto para o feed (Facebook/Instagram) a partir de uma transcrição.
 * Reconhece automaticamente o candidato dono do client (nome + cargo) e aplica o DNA
 * editorial se houver. NÃO copia a legenda ao pé da letra — entende o contexto e
 * gera um texto editorial com emojis e hashtags.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { clientId, transcriptionId, transcriptText, tomOverride } = await req.json();
    if (!clientId) return errorResponse("clientId é obrigatório", 400);
    if (!transcriptionId && !transcriptText) return errorResponse("transcriptionId ou transcriptText é obrigatório", 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Texto da transcrição
    let texto = transcriptText as string | undefined;
    let filename = "";
    if (!texto && transcriptionId) {
      const { data: tr, error } = await supabase
        .from("ic_transcriptions")
        .select("text, segments, filename")
        .eq("id", transcriptionId)
        .eq("client_id", clientId)
        .maybeSingle();
      if (error) throw error;
      if (!tr) return errorResponse("Transcrição não encontrada", 404);
      texto = tr.text || (Array.isArray(tr.segments) ? tr.segments.map((s: any) => s.text).join(" ") : "");
      filename = tr.filename ?? "";
    }
    if (!texto || texto.trim().length < 20) return errorResponse("Transcrição muito curta", 400);

    // Limita tamanho para o LLM
    const MAX_CHARS = 12000;
    const transcript = texto.length > MAX_CHARS ? texto.slice(0, MAX_CHARS) + "…" : texto;

    // 2. Identidade do candidato (do client)
    const { data: client } = await supabase
      .from("clients")
      .select("name, cargo")
      .eq("id", clientId)
      .maybeSingle();
    const candidato = client?.name?.trim() || "o candidato";
    const cargo = client?.cargo?.trim() || "";

    // 3. DNA editorial
    const { data: dna } = await supabase
      .from("content_dna")
      .select("tom, vocabulario, emojis_assinatura, tamanho_ideal, estruturas")
      .eq("client_id", clientId)
      .maybeSingle();

    const dnaBlock = dna
      ? `\nDNA EDITORIAL (siga este estilo):
- Tom: ${dna.tom ?? "—"}
- Vocabulário recorrente: ${(dna.vocabulario ?? []).slice(0, 15).join(", ") || "—"}
- Emojis assinatura: ${(dna.emojis_assinatura ?? []).join(" ") || "—"}
- Tamanho ideal: ${JSON.stringify(dna.tamanho_ideal ?? {})}
- Estruturas frequentes: ${JSON.stringify(dna.estruturas ?? {})}`
      : "\nDNA EDITORIAL: ainda não calibrado — use tom claro, próximo, mobilizador.";

    const llmConfig = await getClientLLMConfig(supabase, clientId);

    const systemPrompt = `Você é um redator político brasileiro experiente, ghostwriter de ${candidato}${cargo ? ` (${cargo})` : ""}.
Sua tarefa: a partir de uma TRANSCRIÇÃO de fala/vídeo, gerar UM POST PRONTO para o feed.

REGRAS CRÍTICAS:
- NÃO copie a transcrição ao pé da letra. Entenda o CONTEXTO, a MENSAGEM CENTRAL, e reescreva em formato de post.
- Escreva em PRIMEIRA PESSOA como ${candidato}.
- Use emojis com moderação (2-5 ao longo do texto, não no início obrigatoriamente).
- Termine com 5-8 hashtags relevantes (locais + tema + assinatura do candidato).
- Tom: ${tomOverride || "alinhado ao DNA fornecido"}.
- Plataforma alvo: post ÚNICO que serve para Facebook E Instagram (220-450 caracteres — narrativo mas sem ficar gigante).
- Você NUNCA publica — apenas entrega o texto para revisão manual.

Responda APENAS JSON válido, sem markdown:
{
  "titulo_interno": string (resumo curto do post para listar),
  "texto": string (o post pronto, com emojis no meio do texto, SEM as hashtags),
  "hashtags": [string] (5-8 hashtags com #, ex: "#JuniorCoringa"),
  "resumo_contexto": string (1 frase explicando o que entendeu da transcrição)
}`;

    const userPrompt = `CANDIDATO: ${candidato}${cargo ? ` — ${cargo}` : ""}
ARQUIVO ORIGEM: ${filename || "(transcrição manual)"}
${dnaBlock}

TRANSCRIÇÃO BRUTA (entenda o contexto, NÃO copie literalmente):
"""
${transcript}
"""

Gere o post pronto para o feed. Responda APENAS com o JSON.`;

    const resp = await callLLM(llmConfig, {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      maxTokens: 1500,
      temperature: 0.8,
    });

    const parsed = parseLooseJson<any>(resp.content);

    return jsonResponse({
      generated: parsed,
      candidato,
      cargo,
      provider: resp.provider,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("ic-feed-from-transcript error:", msg);
    return errorResponse(msg);
  }
});