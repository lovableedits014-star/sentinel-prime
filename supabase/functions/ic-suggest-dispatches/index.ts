import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callLLM, getClientLLMConfig } from "../_shared/llm-router.ts";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/ic-utils.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Req {
  clientId: string;
  knowledgeIds?: string[];   // se vazio, varre fatos recentes não-processados
  minRecipients?: number;    // padrão 5
  expiresInDays?: number;    // padrão 7
}

function normalize(s: string): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

async function generateMessage(
  supabase: any,
  clientId: string,
  bairro: string | null,
  tema: string | null,
  fatoTexto: string,
  fonteUrl: string | null,
): Promise<string> {
  try {
    const llmConfig = await getClientLLMConfig(supabase, clientId);

    // Puxa DNA p/ tom/voz
    const { data: dna } = await supabase
      .from("content_dna")
      .select("tom, vocabulario, emojis_assinatura")
      .eq("client_id", clientId)
      .maybeSingle();

    const dnaBlock = dna
      ? `\nTom: ${dna.tom ?? "claro e próximo"}\nEmojis assinatura: ${(dna.emojis_assinatura ?? []).join(" ") || "🙏"}`
      : "\nTom: claro, próximo, mobilizador";

    const sys = `Você redige UMA mensagem curta de WhatsApp do candidato para apoiadores. NÃO publica — apenas sugere.
REGRAS:
- 1 a 2 parágrafos curtos, máx 350 caracteres no total.
- Use placeholders [primeiro_nome] e [bairro] quando fizer sentido (substituídos depois).
- Tom pessoal, em 1ª pessoa do candidato.
- NÃO use markdown, NÃO use links.
- Termine com chamada leve à ação ou pedido de opinião.${dnaBlock}`;

    const usr = `CONTEXTO:
- Bairro/região: ${bairro || "(geral)"}
- Tema: ${tema || "(livre)"}
- Fato/proposta do candidato: ${fatoTexto}
${fonteUrl ? `- Fonte: ${fonteUrl}` : ""}

Escreva APENAS a mensagem, sem aspas, sem rótulos.`;

    const resp = await callLLM(llmConfig, {
      messages: [
        { role: "system", content: sys },
        { role: "user", content: usr },
      ],
      maxTokens: 350,
      temperature: 0.7,
    });
    return resp.content.trim().slice(0, 800);
  } catch (e) {
    console.error("[ic-suggest-dispatches] generateMessage failed:", e);
    // fallback simples
    return `Olá [primeiro_nome]! Como morador(a) de [bairro], queria te contar pessoalmente: ${fatoTexto}. Sua opinião importa muito. Conta com você? 🙏`;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { clientId, knowledgeIds, minRecipients = 5, expiresInDays = 7 } = (await req.json()) as Req;
    if (!clientId) return errorResponse("clientId é obrigatório", 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // 1) Pega fatos candidatos (territoriais ou pessoais)
    let q = admin
      .from("candidate_knowledge")
      .select("id, tipo, tema, texto, entidades, source_url, created_at")
      .eq("client_id", clientId)
      .eq("aprovado", true)
      .in("tipo", ["promessa", "proposta", "evento", "bandeira"]);

    if (knowledgeIds && knowledgeIds.length > 0) {
      q = q.in("id", knowledgeIds);
    } else {
      // sem ids específicos: pega últimos 7 dias
      const since = new Date(Date.now() - 7 * 86400000).toISOString();
      q = q.gte("created_at", since);
    }
    const { data: fatos, error } = await q.limit(50);
    if (error) return errorResponse(error.message, 500);
    if (!fatos || fatos.length === 0) return jsonResponse({ created: 0, reason: "sem fatos elegíveis" });

    let created = 0;
    const expiresAt = new Date(Date.now() + expiresInDays * 86400000).toISOString();

    for (const f of fatos) {
      const bairros: string[] = Array.isArray(f.entidades?.bairros) ? f.entidades.bairros : [];

      for (const bairro of bairros) {
        if (!bairro || bairro.length < 3) continue;

        // já existe sugestão pendente p/ este bairro+fato?
        const { data: existing } = await admin
          .from("disparo_sugestoes")
          .select("id")
          .eq("client_id", clientId)
          .eq("fonte_knowledge_id", f.id)
          .eq("bairro", bairro)
          .in("status", ["pendente", "aprovado"])
          .maybeSingle();
        if (existing) continue;

        // conta destinatários potenciais
        const { data: countRow } = await admin.rpc("count_pessoas_by_bairro", {
          p_client_id: clientId,
          p_bairro: bairro,
          p_only_whatsapp: true,
        });
        const total = Number(countRow ?? 0);
        if (total < minRecipients) continue;

        const mensagem = await generateMessage(admin, clientId, bairro, f.tema, f.texto, f.source_url);

        // score: mais destinatários e proposta concreta = score maior
        const score = Math.min(100, 40 + Math.min(40, total) + (f.tipo === "proposta" ? 20 : f.tipo === "promessa" ? 10 : 5));

        const { error: insErr } = await admin.from("disparo_sugestoes").insert({
          client_id: clientId,
          tipo: "territorial",
          titulo: `Disparo para ${bairro} — ${f.tema || "novidade"}`,
          bairro,
          tema: f.tema,
          mensagem_sugerida: mensagem,
          total_estimado: total,
          destinatarios_filtro: { bairro, only_whatsapp_confirmado: true },
          fonte_knowledge_id: f.id,
          fonte_url: f.source_url,
          score,
          expires_at: expiresAt,
        });
        if (!insErr) created++;
        else console.error("[ic-suggest-dispatches] insert err:", insErr);
      }
    }

    return jsonResponse({ created, fatos_analisados: fatos.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("ic-suggest-dispatches error:", msg);
    return errorResponse(msg);
  }
});
