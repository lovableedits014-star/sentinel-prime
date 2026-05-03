import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callLLM, getClientLLMConfig } from "../_shared/llm-router.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { themes, commentSamples, clientId } = await req.json();

    if (!clientId) {
      return new Response(
        JSON.stringify({ error: "clientId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!themes || themes.length === 0) {
      return new Response(
        JSON.stringify({ suggestions: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const llmConfig = await getClientLLMConfig(supabase, clientId);

    const themeSummary = themes
      .map((t: any) => `- ${t.label}: ${t.total} menções, crescimento ${t.growthPct ?? 0}%`)
      .join("\n");

    const sampleText = (commentSamples || [])
      .slice(0, 20)
      .map((c: string) => `"${c}"`)
      .join("\n");

    const systemPrompt = `Você é um estrategista político digital brasileiro.
Sua tarefa é sugerir missões de engajamento para apoiadores nas redes sociais.

Uma "missão" é uma ação simples que apoiadores podem fazer, como:
- Comentar em um post específico com uma mensagem positiva
- Compartilhar um conteúdo nas redes
- Reagir/curtir uma publicação
- Criar conteúdo sobre um tema

As sugestões devem ser:
- Práticas e fáceis de executar
- Relacionadas aos temas políticos em alta
- Com linguagem motivacional e clara
- Focadas em mobilização digital positiva

Retorne EXATAMENTE 3-5 sugestões em JSON puro, sem markdown, no formato:
{
  "suggestions": [
    {
      "title": "string",
      "description": "string",
      "theme": "string",
      "platform": "facebook" | "instagram" | "ambos",
      "priority": "alta" | "media" | "baixa"
    }
  ]
}`;

    const userPrompt = `Analise os temas políticos em alta e sugira missões de engajamento:

TEMAS EM ALTA:
${themeSummary}

${sampleText ? `EXEMPLOS DE COMENTÁRIOS RECENTES:\n${sampleText}` : ""}

Crie missões de engajamento relevantes para esses temas. Responda APENAS com o JSON, sem texto adicional.`;

    const response = await callLLM(llmConfig, {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      maxTokens: 1500,
      temperature: 0.7,
    });

    // Parse JSON from response (handle markdown code fences if present)
    let parsed: { suggestions?: any[] } = {};
    try {
      const cleaned = response.content
        .replace(/```json\s*/gi, "")
        .replace(/```\s*$/g, "")
        .trim();
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error("Failed to parse LLM JSON output:", response.content);
      throw new Error("LLM did not return valid JSON");
    }

    return new Response(
      JSON.stringify({
        suggestions: parsed.suggestions || [],
        provider: response.provider,
        usage: response.usage,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("suggest-missions error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
