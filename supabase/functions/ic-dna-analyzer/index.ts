import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callLLM, getClientLLMConfig } from "../_shared/llm-router.ts";
import { corsHeaders, errorResponse, jsonResponse, parseLooseJson } from "../_shared/ic-utils.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { clientId } = await req.json();
    if (!clientId) return errorResponse("clientId é obrigatório", 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Posts próprios dos últimos 90 dias (post_message única por post_id)
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: rows } = await supabase
      .from("comments")
      .select("post_id, post_message, platform, comment_created_time, created_at")
      .eq("client_id", clientId)
      .eq("is_page_owner", true)
      .neq("post_message", null)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500);

    if (!rows || rows.length === 0) {
      return errorResponse("Sem posts próprios suficientes nos últimos 90 dias para calibrar o DNA. Sincronize a Meta primeiro.", 400);
    }

    // Dedup por post_id
    const seen = new Set<string>();
    const posts = rows
      .filter((r: any) => {
        if (seen.has(r.post_id)) return false;
        seen.add(r.post_id);
        return !!r.post_message;
      })
      .slice(0, 60);

    if (posts.length < 3) {
      return errorResponse("São necessários pelo menos 3 posts próprios para calibrar o DNA.", 400);
    }

    const postsBlock = posts
      .map((p: any, i: number) => `[${i + 1}] (${p.platform}) "${(p.post_message ?? "").slice(0, 400)}"`)
      .join("\n");

    const llmConfig = await getClientLLMConfig(supabase, clientId);

    const systemPrompt = `Você é um analista de comunicação política. A partir dos posts próprios do candidato, extraia o "DNA editorial".
Retorne APENAS JSON válido, sem markdown:
{
  "tom": string,  // ex: "combativo-empático", "técnico-acessível"
  "vocabulario": [string],  // 15-20 palavras-chave recorrentes (sem stopwords)
  "estruturas": object,  // {"pergunta_retorica": 0.0-1.0, "dado_emocao": 0.0-1.0, "storytelling": 0.0-1.0, "lista": 0.0-1.0, "cta_direto": 0.0-1.0}
  "emojis_assinatura": [string],  // emojis recorrentes
  "tamanho_ideal": {"facebook": number, "instagram": number}  // tamanho médio em caracteres por plataforma
}`;

    const userPrompt = `Analise estes ${posts.length} posts próprios e extraia o DNA editorial:

${postsBlock}

Responda APENAS com o JSON.`;

    const resp = await callLLM(llmConfig, {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      maxTokens: 1500,
      temperature: 0.3,
    });

    const parsed = parseLooseJson<any>(resp.content);

    // Calcula horários de pico a partir dos timestamps
    const horariosPico: Record<string, number[]> = {};
    const days = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
    for (const p of posts) {
      const ts = p.comment_created_time || p.created_at;
      if (!ts) continue;
      const d = new Date(ts);
      const day = days[d.getDay()];
      const hour = d.getHours();
      if (!horariosPico[day]) horariosPico[day] = [];
      horariosPico[day].push(hour);
    }
    // Pega top 2 horas por dia
    const topHorarios: Record<string, number[]> = {};
    for (const [day, hours] of Object.entries(horariosPico)) {
      const counts: Record<number, number> = {};
      hours.forEach((h) => (counts[h] = (counts[h] ?? 0) + 1));
      topHorarios[day] = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([h]) => parseInt(h));
    }

    const dnaData = {
      client_id: clientId,
      tom: parsed.tom ?? null,
      vocabulario: parsed.vocabulario ?? [],
      estruturas: parsed.estruturas ?? {},
      emojis_assinatura: parsed.emojis_assinatura ?? [],
      tamanho_ideal: parsed.tamanho_ideal ?? {},
      horarios_pico: topHorarios,
      sample_size: posts.length,
      updated_at: new Date().toISOString(),
    };

    await supabase.from("content_dna").upsert(dnaData, { onConflict: "client_id" });

    return jsonResponse({ dna: dnaData });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("ic-dna-analyzer error:", msg);
    return errorResponse(msg);
  }
});