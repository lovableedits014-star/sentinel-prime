import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callLLM, getClientLLMConfig } from "../_shared/llm-router.ts";
import { corsHeaders, errorResponse, jsonResponse, parseLooseJson } from "../_shared/ic-utils.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Req { clientId: string; replace?: boolean }

const SYSTEM = `Você é um analista político brasileiro sênior especializado em coerência de discurso.
Sua missão é detectar CONTRADIÇÕES reais entre falas/promessas/propostas do mesmo candidato em diferentes momentos.

Regras:
- NUNCA invente. Só aponte uma contradição se houver evidência clara nos textos.
- Diferenças de ênfase ou recorte temático NÃO são contradições.
- Considere contradição: mudança de posição em mesmo tema, promessas incompatíveis (ex: prometer obra X em dois lugares com mesmo orçamento), prazos conflitantes, valores numéricos divergentes, alianças/adversários trocados.
- Severidade: "alta" (mudança de posição clara), "media" (promessas incompatíveis), "baixa" (tom/ênfase).`;

function buildUserPrompt(docs: any[]) {
  const compact = docs.map((d) => ({
    id: d.id,
    data: d.data_evento,
    titulo: d.titulo,
    resumo: d.resumo_executivo,
    propostas: (d.propostas || []).slice(0, 10),
    promessas: (d.promessas || []).slice(0, 10),
    bandeiras: (d.bandeiras || []).slice(0, 10),
    adversarios: (d.adversarios_citados || []).slice(0, 10),
  }));
  return `Analise os documentos abaixo (mesmo candidato, momentos diferentes) e identifique CONTRADIÇÕES.

DOCUMENTOS:
${JSON.stringify(compact, null, 2)}

Devolva JSON puro:
{
  "contradicoes": [
    {
      "document_a_id": "uuid do doc mais antigo",
      "document_b_id": "uuid do doc mais novo",
      "tema": "string curta (ex: 'Saúde - UBS Moreninha')",
      "tipo": "mudanca_posicao|promessa_incompativel|prazo_conflitante|valor_divergente|alianca_trocada",
      "trecho_a": "citação curta do doc A",
      "trecho_b": "citação curta do doc B",
      "explicacao": "1-3 frases explicando a contradição",
      "severidade": "alta|media|baixa"
    }
  ]
}

Se não houver contradições reais, devolva {"contradicoes": []}.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { clientId, replace = true } = (await req.json()) as Req;
    if (!clientId) return errorResponse("clientId obrigatório", 400);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: docs, error } = await supabase
      .from("ic_knowledge_documents")
      .select("id, data_evento, titulo, resumo_executivo, propostas, promessas, bandeiras, adversarios_citados")
      .eq("client_id", clientId)
      .order("data_evento", { ascending: true })
      .limit(60);

    if (error) throw error;
    if (!docs || docs.length < 2) {
      return jsonResponse({ ok: true, count: 0, message: "Documentos insuficientes." });
    }

    const llmConfig = await getClientLLMConfig(supabase, clientId);
    const resp = await callLLM(llmConfig, {
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: buildUserPrompt(docs) },
      ],
      maxTokens: 4000,
      temperature: 0.2,
    });

    const parsed = parseLooseJson<{ contradicoes: any[] }>(resp.content);
    const valid = (parsed.contradicoes || []).filter((c) =>
      c?.document_a_id && c?.document_b_id && c?.explicacao && c.document_a_id !== c.document_b_id
    );

    if (replace) {
      await supabase.from("ic_document_contradictions").delete().eq("client_id", clientId);
    }

    if (valid.length) {
      const rows = valid.map((c) => ({
        client_id: clientId,
        document_a_id: c.document_a_id,
        document_b_id: c.document_b_id,
        tema: c.tema || null,
        tipo: c.tipo || null,
        trecho_a: c.trecho_a || null,
        trecho_b: c.trecho_b || null,
        explicacao: c.explicacao,
        severidade: ["alta", "media", "baixa"].includes(c.severidade) ? c.severidade : "media",
      }));
      const { error: insErr } = await supabase
        .from("ic_document_contradictions")
        .upsert(rows, { onConflict: "client_id,document_a_id,document_b_id,tema", ignoreDuplicates: false });
      if (insErr) throw insErr;
    }

    return jsonResponse({ ok: true, count: valid.length });
  } catch (e: any) {
    console.error("ic-detect-contradictions error:", e);
    return errorResponse(e.message || "erro", 500);
  }
});
