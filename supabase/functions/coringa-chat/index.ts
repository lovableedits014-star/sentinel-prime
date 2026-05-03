import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// =============== TOOLS ===============
const TOOLS = [
  {
    type: "function",
    function: {
      name: "consultar_memoria",
      description:
        "Busca fatos extraídos pela IA da fala/posts/comentários do candidato (promessas, propostas, bairros citados, bordões). Use sempre que o usuário perguntar sobre o que o candidato disse, prometeu ou já falou sobre um tema.",
      parameters: {
        type: "object",
        properties: {
          tema: { type: "string", description: "Filtra por tema (ex: saude, educacao, mobilidade). Opcional." },
          tipo: {
            type: "string",
            enum: ["promessa", "proposta", "bandeira", "bairro", "pessoa", "adversario", "historia", "bordao", "numero", "evento", "dado"],
            description: "Filtra por tipo de fato. Opcional.",
          },
          bairro: { type: "string", description: "Filtra fatos que mencionam um bairro específico. Opcional." },
          limit: { type: "number", description: "Máximo de resultados (1-50). Default 20." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_pessoas",
      description:
        "Consulta o CRM (base política — pessoas cadastradas: apoiadores, lideranças, contatos). Filtra por bairro, cidade, nível de apoio etc.",
      parameters: {
        type: "object",
        properties: {
          bairro: { type: "string" },
          cidade: { type: "string" },
          nivel_apoio: { type: "string", enum: ["apoiador_ativo", "apoiador_passivo", "neutro", "indeciso", "opositor"] },
          tem_whatsapp: { type: "boolean", description: "Apenas pessoas com WhatsApp confirmado." },
          texto: { type: "string", description: "Busca por nome." },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "contar_pessoas",
      description:
        "Retorna a contagem total de pessoas no CRM com os filtros dados. Use quando o usuário perguntar 'quantos apoiadores temos em X', 'quantas pessoas no bairro Y'.",
      parameters: {
        type: "object",
        properties: {
          bairro: { type: "string" },
          cidade: { type: "string" },
          nivel_apoio: { type: "string" },
          tem_whatsapp: { type: "boolean" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_metricas",
      description:
        "Retorna métricas-chave do painel: total de pessoas, novos cadastros nos últimos 14 dias, check-ins, comentários positivos/negativos da última semana e maiores temas falados.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_radar_ic",
      description:
        "Retorna o último snapshot do Radar de Inteligência de Conteúdo: hot topics, perguntas em aberto, narrativas hostis, pautas mobilizadoras, alertas de crise.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_transcricoes_recentes",
      description: "Lista as últimas transcrições de áudio/vídeo do candidato (com texto resumido).",
      parameters: {
        type: "object",
        properties: { limit: { type: "number", description: "Default 5" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_sugestoes_disparo",
      description: "Lista as sugestões inteligentes de disparo WhatsApp pendentes (ainda não aprovadas/rejeitadas).",
      parameters: { type: "object", properties: {} },
    },
  },
];

// =============== TOOL EXECUTORS ===============
async function execTool(admin: any, clientId: string, name: string, args: any): Promise<any> {
  args = args || {};
  try {
    switch (name) {
      case "consultar_memoria": {
        let q = admin
          .from("candidate_knowledge")
          .select("tipo, tema, texto, contexto, entidades, source_type, created_at")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false })
          .limit(Math.min(args.limit || 20, 50));
        if (args.tema) q = q.ilike("tema", `%${String(args.tema).toLowerCase()}%`);
        if (args.tipo) q = q.eq("tipo", args.tipo);
        if (args.bairro) q = q.contains("entidades", { bairros: [args.bairro] });
        const { data, error } = await q;
        if (error) return { error: error.message };
        return { count: data?.length || 0, fatos: data || [] };
      }
      case "consultar_pessoas": {
        let q = admin
          .from("pessoas")
          .select("id, nome_completo, telefone, bairro, cidade, nivel_apoio, whatsapp_confirmado")
          .eq("client_id", clientId)
          .limit(Math.min(args.limit || 20, 50));
        if (args.bairro) q = q.ilike("bairro", `%${args.bairro}%`);
        if (args.cidade) q = q.ilike("cidade", `%${args.cidade}%`);
        if (args.nivel_apoio) q = q.eq("nivel_apoio", args.nivel_apoio);
        if (args.tem_whatsapp === true) q = q.eq("whatsapp_confirmado", true);
        if (args.texto) q = q.ilike("nome_completo", `%${args.texto}%`);
        const { data, error } = await q;
        if (error) return { error: error.message };
        return { count: data?.length || 0, pessoas: data || [] };
      }
      case "contar_pessoas": {
        let q = admin
          .from("pessoas")
          .select("id", { count: "exact", head: true })
          .eq("client_id", clientId);
        if (args.bairro) q = q.ilike("bairro", `%${args.bairro}%`);
        if (args.cidade) q = q.ilike("cidade", `%${args.cidade}%`);
        if (args.nivel_apoio) q = q.eq("nivel_apoio", args.nivel_apoio);
        if (args.tem_whatsapp === true) q = q.eq("whatsapp_confirmado", true);
        const { count, error } = await q;
        if (error) return { error: error.message };
        return { total: count || 0, filtros: args };
      }
      case "consultar_metricas": {
        const since14 = new Date(Date.now() - 14 * 86400000).toISOString();
        const since7 = new Date(Date.now() - 7 * 86400000).toISOString();
        const [{ count: totalPessoas }, { count: novos14 }, { count: checkins14 }, { count: posCom7 }, { count: negCom7 }] = await Promise.all([
          admin.from("pessoas").select("id", { count: "exact", head: true }).eq("client_id", clientId),
          admin.from("pessoas").select("id", { count: "exact", head: true }).eq("client_id", clientId).gte("created_at", since14),
          admin.from("checkins").select("id", { count: "exact", head: true }).eq("client_id", clientId).gte("created_at", since14),
          admin.from("comments").select("id", { count: "exact", head: true }).eq("client_id", clientId).eq("sentiment", "positive").gte("created_time", since7),
          admin.from("comments").select("id", { count: "exact", head: true }).eq("client_id", clientId).eq("sentiment", "negative").gte("created_time", since7),
        ]);
        return {
          total_pessoas: totalPessoas || 0,
          novos_cadastros_14d: novos14 || 0,
          checkins_14d: checkins14 || 0,
          comentarios_positivos_7d: posCom7 || 0,
          comentarios_negativos_7d: negCom7 || 0,
        };
      }
      case "consultar_radar_ic": {
        const { data } = await admin
          .from("ic_radar_snapshots")
          .select("snapshot_date, hot_topics, open_questions, hostile_narratives, mobilizing_pautas, crisis_alerts, base_signals")
          .eq("client_id", clientId)
          .order("snapshot_date", { ascending: false })
          .limit(1)
          .maybeSingle();
        return data || { vazio: true };
      }
      case "consultar_transcricoes_recentes": {
        const { data } = await admin
          .from("ic_transcriptions")
          .select("id, filename, full_text, created_at")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false })
          .limit(Math.min(args.limit || 5, 10));
        return {
          count: data?.length || 0,
          transcricoes: (data || []).map((t: any) => ({
            id: t.id,
            data: t.created_at,
            filename: t.filename,
            resumo: (t.full_text || "").slice(0, 600),
          })),
        };
      }
      case "consultar_sugestoes_disparo": {
        const { data } = await admin
          .from("disparo_sugestoes")
          .select("id, titulo, mensagem_sugerida, bairro_alvo, audiencia_estimada, prioridade, status, created_at")
          .eq("client_id", clientId)
          .eq("status", "pendente")
          .order("created_at", { ascending: false })
          .limit(20);
        return { count: data?.length || 0, sugestoes: data || [] };
      }
      default:
        return { error: `Tool desconhecida: ${name}` };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// =============== HANDLER ===============
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");
    const { clientId, conversationId, message, history } = await req.json();
    if (!clientId || !message) {
      return new Response(JSON.stringify({ error: "clientId e message são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Carrega contexto leve do cliente p/ system prompt
    const { data: client } = await admin
      .from("clients")
      .select("nome_candidato, cargo_pretendido, partido, regiao_atuacao")
      .eq("id", clientId)
      .maybeSingle();

    const systemPrompt = `Você é o "Coringa", assistente IA estratégico do mandato/campanha de ${client?.nome_candidato || "o candidato"} (${client?.cargo_pretendido || "candidato"}).

Você tem acesso direto ao banco de dados real (CRM, métricas, memória da fala do candidato, radar de inteligência) através de ferramentas. SEMPRE use as ferramentas para responder com dados reais — NUNCA invente números ou nomes.

REGRAS:
- Português do Brasil, tom direto e estratégico.
- Quando o usuário pedir números, use 'consultar_metricas' ou 'contar_pessoas'.
- Quando perguntar o que o candidato falou/prometeu, use 'consultar_memoria'.
- Quando perguntar sobre território/bairro, combine 'consultar_memoria' (com bairro) e 'contar_pessoas' (com bairro).
- Apresente respostas em markdown (use **negrito**, listas, etc).
- Se a ferramenta retornar vazio, diga claramente que não há dados — não invente.
- Sempre que possível, sugira UMA ação prática no final (ex: "posso preparar um disparo para a Moreninha 4?").`;

    // Monta histórico
    const baseMessages: any[] = [{ role: "system", content: systemPrompt }];
    if (Array.isArray(history)) {
      for (const m of history.slice(-12)) {
        if (m?.role === "user" || m?.role === "assistant") {
          baseMessages.push({ role: m.role, content: String(m.content || "").slice(0, 4000) });
        }
      }
    }
    baseMessages.push({ role: "user", content: String(message).slice(0, 4000) });

    // Persiste mensagem do usuário (best-effort)
    if (conversationId) {
      admin.from("coringa_messages").insert({
        conversation_id: conversationId,
        client_id: clientId,
        role: "user",
        content: message,
      }).then(() => {});
    }

    // Loop de tool calling (até 4 rodadas) — não-streaming na fase 1 p/ permitir tools simples
    let messages = baseMessages;
    let finalText = "";
    const toolsExecuted: any[] = [];

    for (let round = 0; round < 4; round++) {
      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages,
          tools: TOOLS,
          tool_choice: "auto",
          temperature: 0.4,
        }),
      });

      if (!aiResp.ok) {
        const errText = await aiResp.text();
        if (aiResp.status === 429) {
          return new Response(JSON.stringify({ error: "Limite de requisições atingido. Tente em alguns segundos." }), {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (aiResp.status === 402) {
          return new Response(JSON.stringify({ error: "Créditos da IA esgotados. Adicione créditos no workspace." }), {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        console.error("AI gateway error:", aiResp.status, errText);
        throw new Error(`AI gateway: ${aiResp.status}`);
      }

      const data = await aiResp.json();
      const choice = data.choices?.[0];
      const msg = choice?.message;
      if (!msg) throw new Error("Resposta vazia da IA");

      const toolCalls = msg.tool_calls || [];
      if (toolCalls.length > 0) {
        // Adiciona a mensagem do assistente com tool_calls
        messages.push({
          role: "assistant",
          content: msg.content || "",
          tool_calls: toolCalls,
        });
        // Executa cada tool e adiciona resposta
        for (const tc of toolCalls) {
          const fname = tc.function?.name;
          let fargs: any = {};
          try { fargs = JSON.parse(tc.function?.arguments || "{}"); } catch {}
          const result = await execTool(admin, clientId, fname, fargs);
          toolsExecuted.push({ name: fname, args: fargs });
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify(result).slice(0, 8000),
          });
        }
        continue; // próxima rodada para o modelo formular a resposta final
      }

      // Sem tool calls => resposta final
      finalText = msg.content || "";
      break;
    }

    if (!finalText) finalText = "Não consegui formular uma resposta. Tente reformular a pergunta.";

    // Persiste resposta do assistente
    if (conversationId) {
      admin.from("coringa_messages").insert({
        conversation_id: conversationId,
        client_id: clientId,
        role: "assistant",
        content: finalText,
        metadata: { tools: toolsExecuted },
      }).then(() => {});
      admin.from("coringa_conversations").update({
        ultima_mensagem_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", conversationId).then(() => {});
    }

    return new Response(JSON.stringify({ reply: finalText, tools_used: toolsExecuted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("coringa-chat error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});