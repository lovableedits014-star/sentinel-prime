import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callLLM, getClientLLMConfig } from "../_shared/llm-router.ts";
import { corsHeaders, errorResponse, jsonResponse, parseLooseJson } from "../_shared/ic-utils.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { clientId, draftText, platform = "facebook" } = await req.json();
    if (!clientId) return errorResponse("clientId é obrigatório", 400);
    if (!draftText || draftText.length < 10) return errorResponse("draftText muito curto", 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Estatísticas de militantes
    const { data: militantStats } = await supabase
      .from("social_militants")
      .select("current_badge")
      .eq("client_id", clientId);
    const badgeCount: Record<string, number> = {};
    for (const m of militantStats ?? []) {
      const b = m.current_badge ?? "observador";
      badgeCount[b] = (badgeCount[b] ?? 0) + 1;
    }

    // Posts próprios recentes para baseline (últimos 30d)
    const { data: ownPosts } = await supabase
      .from("comments")
      .select("post_message, post_id, sentiment, comment_created_time")
      .eq("client_id", clientId)
      .eq("is_page_owner", true)
      .neq("post_message", null)
      .order("created_at", { ascending: false })
      .limit(50);

    const baseline = (ownPosts ?? [])
      .slice(0, 8)
      .map((p: any, i: number) => `[${i + 1}] "${(p.post_message ?? "").slice(0, 200)}"`)
      .join("\n") || "(sem posts próprios para baseline)";

    const llmConfig = await getClientLLMConfig(supabase, clientId);

    const systemPrompt = `Você é um analista preditivo de comunicação política brasileira.
Você NUNCA publica — apenas projeta como um texto provavelmente seria recebido.
Retorne APENAS JSON válido, sem markdown, no formato:
{
  "engajamento_esperado": "baixo"|"medio"|"alto",
  "engajamento_justificativa": string,
  "sentimento_provavel": {"positive": number, "negative": number, "neutral": number},  // soma 100
  "risco_crise": number,  // 0-100
  "palavras_gatilho": [string],  // palavras do texto que aumentam risco
  "quem_reage": {"defensores": "alto"|"medio"|"baixo", "criticos": "alto"|"medio"|"baixo", "novos_rostos": "alto"|"medio"|"baixo"},
  "sugestoes_ajuste": [{"problema": string, "sugestao": string, "trecho_substituir": string|null, "trecho_novo": string|null}]
}
Liste 3 sugestões de ajuste. "trecho_substituir" e "trecho_novo" devem permitir substituição direta no texto.`;

    const userPrompt = `RASCUNHO (plataforma: ${platform}):
"""
${draftText}
"""

CONTEXTO DA BASE:
- Militantes por perfil: ${JSON.stringify(badgeCount)}
- Últimos posts próprios (baseline de comparação):
${baseline}

Projete a recepção provável. Responda APENAS com o JSON.`;

    const resp = await callLLM(llmConfig, {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      maxTokens: 1800,
      temperature: 0.4,
    });

    const parsed = parseLooseJson<any>(resp.content);
    return jsonResponse({ projection: parsed, provider: resp.provider });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("ic-project error:", msg);
    return errorResponse(msg);
  }
});