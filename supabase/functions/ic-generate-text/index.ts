import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callLLM, getClientLLMConfig } from "../_shared/llm-router.ts";
import { corsHeaders, errorResponse, jsonResponse, parseLooseJson } from "../_shared/ic-utils.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      clientId,
      tema,
      angulo,
      cta,
      tomOverride,
      plataformas = ["facebook", "instagram"],
      applyDna = true,
      formats = ["facebook", "instagram", "roteiro_falado", "brief_visual", "resposta_padrao"],
    } = await req.json();

    if (!clientId) return errorResponse("clientId é obrigatório", 400);
    if (!tema) return errorResponse("tema é obrigatório", 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // DNA opcional
    let dnaBlock = "";
    if (applyDna) {
      const { data: dna } = await supabase.from("content_dna").select("*").eq("client_id", clientId).maybeSingle();
      if (dna) {
        dnaBlock = `\n\nDNA EDITORIAL DO CANDIDATO (siga este estilo):
- Tom: ${dna.tom ?? "não calibrado"}
- Vocabulário recorrente: ${(dna.vocabulario ?? []).slice(0, 15).join(", ") || "—"}
- Emojis assinatura: ${(dna.emojis_assinatura ?? []).join(" ") || "—"}
- Tamanho ideal: ${JSON.stringify(dna.tamanho_ideal ?? {})}
- Estruturas frequentes: ${JSON.stringify(dna.estruturas ?? {})}`;
      }
    }

    // Identidade do candidato (se houver)
    const { data: identity } = await supabase
      .from("candidate_identity")
      .select("*")
      .eq("client_id", clientId)
      .maybeSingle();

    const identityBlock = identity
      ? `\n\nIDENTIDADE: ${JSON.stringify(identity).slice(0, 800)}`
      : "";

    const llmConfig = await getClientLLMConfig(supabase, clientId);

    const formatsDesc: Record<string, string> = {
      facebook: '"facebook": texto longo (200-400 caracteres) com narrativa, emoção e CTA',
      instagram: '"instagram": caption curta (80-160 caracteres) + sugestão de 5-8 hashtags em "hashtags": [string]',
      roteiro_falado: '"roteiro_falado": script falado de ~30 segundos para Reels/Stories (gancho+desenvolvimento+CTA)',
      brief_visual: '"brief_visual": descrição em texto da imagem/vídeo ideal para acompanhar (composição, cores, elementos — SEM gerar imagem)',
      resposta_padrao: '"resposta_padrao": resposta sugerida para responder a comentários sobre este tema',
    };

    const requestedFormats = formats.map((f: string) => formatsDesc[f]).filter(Boolean).join("\n- ");

    const systemPrompt = `Você é um redator político brasileiro experiente.
Você NUNCA publica nada — apenas oferece sugestões de texto para o candidato revisar e usar manualmente.
Tom padrão: ${tomOverride || "alinhado ao DNA fornecido (ou claro, próximo, mobilizador se não houver DNA)"}.

Retorne APENAS JSON válido, sem markdown, no formato:
{
${formats.includes("facebook") ? '  "facebook": string,\n' : ""}${formats.includes("instagram") ? '  "instagram": string,\n  "hashtags": [string],\n' : ""}${formats.includes("roteiro_falado") ? '  "roteiro_falado": string,\n' : ""}${formats.includes("brief_visual") ? '  "brief_visual": string,\n' : ""}${formats.includes("resposta_padrao") ? '  "resposta_padrao": string,\n' : ""}}`;

    const userPrompt = `BRIEFING:
- Tema: ${tema}
- Ângulo: ${angulo || "(livre)"}
- CTA: ${cta || "(opcional)"}
- Plataformas-alvo: ${plataformas.join(", ")}

FORMATOS PEDIDOS:
- ${requestedFormats}
${dnaBlock}${identityBlock}

Gere as variantes pedidas. Responda APENAS com o JSON.`;

    const resp = await callLLM(llmConfig, {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      maxTokens: 2200,
      temperature: 0.8,
    });

    const parsed = parseLooseJson<any>(resp.content);

    return jsonResponse({ generated: parsed, provider: resp.provider });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("ic-generate-text error:", msg);
    return errorResponse(msg);
  }
});