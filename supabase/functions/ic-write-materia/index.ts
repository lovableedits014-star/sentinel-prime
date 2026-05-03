import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callLLM, getClientLLMConfig } from "../_shared/llm-router.ts";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/ic-utils.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Tipo = "press_release" | "blog" | "nota_oficial" | "boletim";
type Tom = "formal" | "jornalistico" | "popular" | "tecnico";

interface WriteRequest {
  clientId: string;
  tipo?: Tipo;
  tom?: Tom;
  tema?: string;
  briefing: string; // o que o usuário quer escrever
  incluirMemoriaUltimosDias?: number; // default 30
  salvarComo?: "rascunho" | null; // se "rascunho", salva no histórico
  transcriptionId?: string; // se informado, usa a transcrição INTEIRA como fonte primária
  transcriptionIds?: string[]; // múltiplas transcrições-fonte combinadas com rastreabilidade
  providerOverride?: string;
  modelOverride?: string;
  apiKeyOverride?: string;
  reprocessMateriaId?: string; // se informado, snapshota a versão atual e SOBRESCREVE a matéria
}

const TIPO_DESC: Record<Tipo, string> = {
  press_release:
    "Press release de imprensa profissional. ESTRUTURA OBRIGATÓRIA: (1) LEAD em 1 parágrafo respondendo 5W (quem, o quê, quando, onde, por quê) — esse parágrafo deve começar com a cidade-data em negrito (ex: '**Campo Grande, 30/04** —'). (2) Corpo com 2 ou 3 INTERTÍTULOS curtos em markdown ('## Intertítulo'), cada seção com 1 a 2 parágrafos densos. (3) PELO MENOS UMA citação em bloco ('> \"Frase literal do candidato.\"') extraída da transcrição. (4) Parágrafo final de fechamento com próximo passo/agenda. Nunca entregue texto solto sem hierarquia.",
  blog:
    "Post de blog autoral em primeira pessoa. ESTRUTURA OBRIGATÓRIA: (1) Abertura com gancho pessoal em 1 parágrafo. (2) Corpo com 2 a 3 INTERTÍTULOS em markdown ('## Intertítulo'), cada um com 1 a 2 parágrafos. (3) Pelo menos uma citação em bloco ('> ...') ou lista com bullets ('- item') quando enumerar ações. (4) Fechamento com chamada/convite. Tom opinativo, próximo, sem clichês.",
  nota_oficial:
    "Nota oficial institucional. ESTRUTURA OBRIGATÓRIA: (1) Cabeçalho 'NOTA OFICIAL' em negrito como primeira linha. (2) 2 a 3 parágrafos curtos e densos, posicionamento claro e direto. (3) Assinatura final em itálico ('*Gabinete de [nome do candidato]*'). Sem intertítulos, sem citações em bloco — formato sóbrio.",
  boletim:
    "Boletim semanal de prestação de contas. ESTRUTURA OBRIGATÓRIA: (1) Título da semana + 1 parágrafo de introdução. (2) INTERTÍTULOS em markdown ('## Categoria') agrupando ações por área (ex: '## Saúde', '## Mobilidade'). (3) Sob cada intertítulo, lista com 2 a 4 bullets ('- Ação concreta com local/número'). (4) Fechamento com agenda da próxima semana.",
};

const TOM_DESC: Record<Tom, string> = {
  formal: "formal, institucional, sem gírias",
  jornalistico: "jornalístico, neutro, com lead em terceira pessoa",
  popular: "popular, próximo, com palavras simples",
  tecnico: "técnico, com dados e referências quando houver",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as WriteRequest;
    const {
      clientId,
      tipo = "press_release",
      tom = "jornalistico",
      tema,
      briefing,
      incluirMemoriaUltimosDias = 60,
      salvarComo = "rascunho",
      transcriptionId,
      transcriptionIds,
      providerOverride,
      modelOverride,
      apiKeyOverride,
      reprocessMateriaId,
    } = body || ({} as WriteRequest);

    if (!clientId) return errorResponse("clientId é obrigatório", 400);
    const idsFromArray = Array.isArray(transcriptionIds)
      ? transcriptionIds.filter((x) => typeof x === "string" && x.length > 0)
      : [];
    const allTranscriptionIds = Array.from(
      new Set([...(transcriptionId ? [transcriptionId] : []), ...idsFromArray]),
    );
    const hasAnyTranscription = allTranscriptionIds.length > 0;
    if ((!briefing || briefing.trim().length < 10) && !hasAnyTranscription)
      return errorResponse(
        "Informe um briefing OU selecione uma transcrição-fonte.",
        400
      );

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Carrega contexto do cliente
    const { data: client } = await admin
      .from("clients")
      .select("name, cargo")
      .eq("id", clientId)
      .maybeSingle();

    // Transcrições-fonte (INTEIRAS) — fontes prioritárias quando informadas.
    // Cada uma recebe um rótulo curto [F1], [F2]... para rastreabilidade nas citações.
    let fontesTranscricoes: any[] = [];
    if (hasAnyTranscription) {
      const { data: trs } = await admin
        .from("ic_transcriptions")
        .select("id, full_text, filename, created_at, segments")
        .in("id", allTranscriptionIds)
        .eq("client_id", clientId);
      // Preserva a ordem de seleção do usuário
      const byId = new Map((trs || []).map((t: any) => [t.id, t]));
      fontesTranscricoes = allTranscriptionIds
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map((tr: any, idx: number) => {
          const fromSegs = Array.isArray(tr.segments)
            ? tr.segments.map((s: any) => s?.text ?? "").join(" ").trim()
            : "";
          return {
            ...tr,
            label: `F${idx + 1}`,
            full_text: tr.full_text || fromSegs,
          };
        });
    }
    const transcricaoFonte = fontesTranscricoes[0] || null; // compat com campos antigos
    const multiFontes = fontesTranscricoes.length > 1;

    // Memória relevante (últimos N dias) — filtra por tema se fornecido
    const sinceIso = new Date(Date.now() - incluirMemoriaUltimosDias * 86400000).toISOString();
    let memQuery = admin
      .from("candidate_knowledge")
      .select("id, tipo, tema, texto, contexto, entidades, source_type, source_date, created_at")
      .eq("client_id", clientId)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(40);
    if (tema) memQuery = memQuery.ilike("tema", `%${tema.toLowerCase()}%`);
    const { data: memoria } = await memQuery;

    // Últimas transcrições (apenas como contexto secundário, se NÃO houver fonte específica)
    const { data: transcricoes } = hasAnyTranscription
      ? { data: [] as any[] }
      : await admin
          .from("ic_transcriptions")
          .select("id, full_text, created_at, filename")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false })
          .limit(5);

    // Posts recentes (a partir de comments — agregados, só para contexto leve)
    const { data: postsRaw } = await admin
      .from("comments")
      .select("post_id, post_message, comment_created_time")
      .eq("client_id", clientId)
      .not("post_id", "is", null)
      .not("post_message", "is", null)
      .order("comment_created_time", { ascending: false })
      .limit(60);
    const postsMap = new Map<string, { message: string; posted_at: string }>();
    for (const r of postsRaw || []) {
      if (!r.post_id || postsMap.has(r.post_id)) continue;
      postsMap.set(r.post_id, { message: r.post_message || "", posted_at: r.comment_created_time });
      if (postsMap.size >= 8) break;
    }
    const posts = Array.from(postsMap.values()).map((p, i) => ({ id: String(i), message: p.message, posted_at: p.posted_at }));

    const memoriaTxt = (memoria || [])
      .slice(0, 30)
      .map((m: any) => `- [${m.tipo}${m.tema ? "/" + m.tema : ""}] ${m.texto}`)
      .join("\n");
    const transcrTxt = (transcricoes || [])
      .map((t: any, i: number) => `# Transcrição ${i + 1} (${t.created_at?.slice(0, 10)})\n${(t.full_text || "").slice(0, 800)}`)
      .join("\n\n");
    // Transcrições-fonte INTEIRAS, divididas por orçamento total (~60k chars).
    // Cada uma recebe um rótulo [F1] / [F2] para a IA citar no campo `tracos`.
    const TOTAL_BUDGET = 60000;
    const perFonteBudget = fontesTranscricoes.length
      ? Math.max(8000, Math.floor(TOTAL_BUDGET / fontesTranscricoes.length))
      : 0;
    const fonteTxt = fontesTranscricoes
      .map((t) => {
        const txt = (t.full_text || "").slice(0, perFonteBudget);
        return `# [${t.label}] TRANSCRIÇÃO-FONTE (INTEIRA — ${t.filename || "sem nome"} — ${t.created_at?.slice(0, 10)})\n${txt}`;
      })
      .join("\n\n");
    const postsTxt = (posts || [])
      .map((p: any) => `- ${(p.message || "").slice(0, 220)}`)
      .join("\n");

    const candidato = client?.name || "o candidato";
    const cargo = client?.cargo || "candidato";

    const systemPrompt = `Você é um redator político brasileiro experiente. Vai escrever uma matéria sobre ${candidato} (${cargo}).

REGRAS:
- NUNCA invente fatos, números ou nomes que não estejam no contexto fornecido.
- Use APENAS o que está na TRANSCRIÇÃO-FONTE (quando houver), MEMÓRIA, TRANSCRIÇÕES e POSTS abaixo.
- EVITE FRASES VAZIAS DE CONTEÚDO. Proibido usar clichês como "agradeceu a oportunidade", "reafirmou seu compromisso", "destacou a importância", "ressaltou a relevância", "enfatizou o trabalho", "frisou que", "pontuou a necessidade" sem ANCORÁ-LOS em um fato concreto da transcrição (número, local, nome, data, ação específica). Se a transcrição não traz fato concreto, NÃO escreva o parágrafo.
- Prefira voz ativa, frases curtas, dados quantificáveis (km de asfalto, valor de convênio, bairro citado, nome de quem participou). Cite trechos literais entre aspas quando agregar credibilidade.
- FORMATAÇÃO MARKDOWN OBRIGATÓRIA no campo "corpo": use '## ' para intertítulos, '> ' para citação em bloco, '- ' para bullets, '**negrito**' para destaques pontuais (cidade-data, números-chave). Separe blocos por linha em branco dupla (\\n\\n). NUNCA entregue uma sequência de parágrafos planos sem hierarquia — o leitor precisa enxergar a estrutura de matéria de jornal/revista.
${
  fontesTranscricoes.length === 1
    ? "- A TRANSCRIÇÃO-FONTE é a base PRINCIPAL da matéria. Trate-a como o discurso/entrevista que originou esta matéria — preserve o contexto completo, não recorte ideias soltas. Memória e posts são apenas contexto complementar.\n"
    : multiFontes
    ? `- Você tem ${fontesTranscricoes.length} TRANSCRIÇÕES-FONTE rotuladas (${fontesTranscricoes
        .map((t) => `[${t.label}] ${t.filename || "sem nome"}`)
        .join(", ")}). Combine-as em UMA matéria coerente que conecte os pontos comuns e contraste, quando houver, divergências.\n- RASTREABILIDADE OBRIGATÓRIA: para CADA trecho/citação/fato derivado, marque a origem com o rótulo entre colchetes (ex: "...obras na Moreninha [F1]" ou "...conforme reforçou em outra entrevista [F2]"). NÃO invente fatos que não estejam em nenhuma fonte.\n- No JSON, preencha o array \`tracos\` listando os principais trechos com sua fonte: [{"trecho":"...","fonte":"F1"}].\n`
    : ""
}
- Se o briefing pedir algo que não está no contexto, diga isso no campo "avisos".
- Português do Brasil.
- Formato pedido: ${TIPO_DESC[tipo]}
- Tom: ${TOM_DESC[tom]}

Retorne JSON ESTRITO no formato:
{
  "titulo": "...",
  "subtitulo": "...",
  "corpo": "texto completo da matéria, com quebras de parágrafo \\n\\n${multiFontes ? ", incluindo marcações de origem [F1]/[F2] ao final de cada afirmação derivada" : ""}",
  "fontes_usadas": ["id_memoria_1", ...],
  "tracos": [${multiFontes ? '{"trecho":"resumo da afirmação", "fonte":"F1"}' : ""}],
  "avisos": "se faltou alguma informação, descreva aqui — senão string vazia"
${hasAnyTranscription
  ? `,
  "paragrafos": [
    {
      "indice": 0,
      "resumo": "1 frase curta resumindo o parágrafo",
      "citacoes": [
        { "fonte": "${fontesTranscricoes[0]?.label || "F1"}", "trecho_origem": "trecho LITERAL (até 240 chars) copiado da transcrição que embasa este parágrafo" }
      ]
    }
  ]`
  : ""}
}

${hasAnyTranscription ? `REGRAS DE AUDITORIA POR PARÁGRAFO:
- Para CADA parágrafo do corpo (separado por \\n\\n), gere um item em "paragrafos" com o índice (0,1,2...) e "citacoes".
- Cada "trecho_origem" DEVE ser uma cópia LITERAL (sem parafrasear) extraída da transcrição correspondente — será usado para auditoria humana.
- Se um parágrafo for puramente de transição/conclusão sem fato citável, use citacoes: [].
- Limite de 240 caracteres por trecho. Mantenha pontuação e palavras originais.

` : ""}Sem markdown, sem comentários fora do JSON.`;

    const briefingFinal =
      briefing && briefing.trim().length >= 10
        ? briefing.trim()
        : hasAnyTranscription
        ? multiFontes
          ? `Escreva UMA matéria combinando as ${fontesTranscricoes.length} TRANSCRIÇÕES-FONTE abaixo. Identifique convergências e divergências, e marque a origem de cada trecho com o rótulo [F1], [F2]...`
          : "Escreva uma matéria a partir da TRANSCRIÇÃO-FONTE abaixo. Identifique o tema central, a mensagem principal e os fatos relevantes — e construa a matéria em torno disso."
        : "";

    const userPrompt = `BRIEFING DO USUÁRIO:
"""
${briefingFinal}
"""
${reprocessMateriaId && briefing && briefing.trim().length >= 5 ? `
============ ORIENTAÇÃO DE CORREÇÃO (PRIORIDADE MÁXIMA) ============
Esta é uma REESCRITA. O usuário avaliou a versão anterior e quer corrigir os seguintes pontos. Siga estas instruções ACIMA do briefing original:
"""
${briefing.trim()}
"""
` : ""}

CANDIDATO: ${candidato} — ${cargo}
REGIÃO: não informada

${fonteTxt ? `============ ${multiFontes ? `TRANSCRIÇÕES-FONTE (${fontesTranscricoes.length} — BASE PRINCIPAL — USE INTEGRALMENTE, MARQUE ORIGEM)` : "TRANSCRIÇÃO-FONTE (BASE PRINCIPAL — USE INTEGRALMENTE)"} ============\n` + fonteTxt + "\n\n" : ""}
============ MEMÓRIA ESTRUTURADA (fatos extraídos de falas/posts/comentários) ============
${memoriaTxt || "(memória vazia)"}

============ TRANSCRIÇÕES RECENTES ============
${transcrTxt || "(nenhuma)"}

============ POSTS RECENTES ============
${postsTxt || "(nenhum)"}`;

    const baseConfig = await getClientLLMConfig(admin, clientId);
    const llmConfig: any = providerOverride
      ? {
          provider: providerOverride,
          model: modelOverride || undefined,
          apiKey: apiKeyOverride || baseConfig.apiKey,
        }
      : { ...baseConfig, model: modelOverride || baseConfig.model };
    if (!llmConfig.model) llmConfig.model = baseConfig.model;
    // Auto-upgrade Groq quando o usuário não escolheu modelo explicitamente:
    // o default `llama-3.1-8b-instant` tem TPM de apenas 6000 e estoura nesta função.
    // `llama-3.3-70b-versatile` tem 12000 TPM e melhor qualidade editorial.
    if (llmConfig.provider === "groq" && !modelOverride && (!llmConfig.model || llmConfig.model.includes("8b-instant"))) {
      llmConfig.model = "llama-3.3-70b-versatile";
    }
    const resp = await callLLM(llmConfig, {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      maxTokens: hasAnyTranscription ? 4500 : 2800,
      temperature: 0.5,
    });

    let parsed: any;
    try {
      const cleaned = resp.content.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      const slice = cleaned.slice(start, end + 1);
      // Sanitiza caracteres de controle não escapados DENTRO de strings JSON
      // (LLMs costumam retornar \n literal no meio de "corpo": "...").
      const sanitizeJson = (raw: string) => {
        let out = "";
        let inStr = false;
        let escape = false;
        for (let i = 0; i < raw.length; i++) {
          const ch = raw[i];
          if (escape) { out += ch; escape = false; continue; }
          if (ch === "\\") { out += ch; escape = true; continue; }
          if (ch === '"') { inStr = !inStr; out += ch; continue; }
          if (inStr) {
            if (ch === "\n") { out += "\\n"; continue; }
            if (ch === "\r") { out += "\\r"; continue; }
            if (ch === "\t") { out += "\\t"; continue; }
            const code = ch.charCodeAt(0);
            if (code < 0x20) { out += "\\u" + code.toString(16).padStart(4, "0"); continue; }
          }
          out += ch;
        }
        return out;
      };
      try {
        parsed = JSON.parse(slice);
      } catch {
        parsed = JSON.parse(sanitizeJson(slice));
      }
    } catch (e) {
      console.error("[ic-write-materia] parse error:", e, resp.content?.slice(0, 400));
      return errorResponse("LLM retornou formato inválido", 500);
    }

    // Mapeia automaticamente os trechos de origem dentro do texto integral
    // de cada transcrição para gerar âncoras (offset/length) na auditoria.
    const fonteByLabel = new Map(fontesTranscricoes.map((t) => [t.label, t]));
    const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
    const paragrafosAuditoria = Array.isArray(parsed.paragrafos)
      ? parsed.paragrafos.map((p: any) => {
          const citacoes = Array.isArray(p?.citacoes) ? p.citacoes : [];
          return {
            indice: typeof p?.indice === "number" ? p.indice : null,
            resumo: p?.resumo ? String(p.resumo).slice(0, 300) : null,
            citacoes: citacoes.map((c: any) => {
              const fonte = String(c?.fonte || "").trim();
              const trecho = String(c?.trecho_origem || c?.trecho || "").slice(0, 240);
              const tr = fonteByLabel.get(fonte);
              let offset: number | null = null;
              if (tr?.full_text && trecho) {
                const haystack = norm(tr.full_text);
                const needle = norm(trecho).slice(0, 80);
                const idx = needle ? haystack.indexOf(needle) : -1;
                offset = idx >= 0 ? idx : null;
              }
              return {
                fonte,
                trecho_origem: trecho,
                transcription_id: tr?.id ?? null,
                offset_aprox: offset,
              };
            }),
          };
        })
      : [];

    let saved: any = null;
    const fontesPayload = {
      memoria_ids: parsed.fontes_usadas || [],
      transcription_id: transcricaoFonte?.id ?? null,
      transcription_ids: fontesTranscricoes.map((t) => t.id),
      transcription_labels: fontesTranscricoes.map((t) => ({
        id: t.id,
        label: t.label,
        filename: t.filename,
        created_at: t.created_at,
      })),
      tracos: Array.isArray(parsed.tracos) ? parsed.tracos : [],
      paragrafos: paragrafosAuditoria,
    };
    const metadataPayload = {
      avisos: parsed.avisos || "",
      provider: resp.provider,
      model: resp.model,
      reprocessed_from: reprocessMateriaId || null,
    };

    if (reprocessMateriaId) {
      // Reprocessamento: snapshota a versão atual em materias_versions e SOBRESCREVE a matéria
      const { data: current } = await admin
        .from("materias_geradas")
        .select("*")
        .eq("id", reprocessMateriaId)
        .eq("client_id", clientId)
        .maybeSingle();
      if (!current) return errorResponse("Matéria a reprocessar não encontrada", 404);

      const currentVersao = current.versao || 1;
      const { error: versionErr } = await admin.from("materias_versions").insert({
        materia_id: current.id,
        client_id: clientId,
        versao: currentVersao,
        provider: current.provider || current.metadata?.provider || null,
        model: current.model || current.metadata?.model || null,
        titulo: current.titulo,
        subtitulo: current.subtitulo,
        corpo: current.corpo,
        fontes: current.fontes || {},
        prompt_input: current.prompt_input,
        metadata: current.metadata || {},
      });
      if (versionErr) console.error("[ic-write-materia] snapshot error:", versionErr);

      const { data, error } = await admin
        .from("materias_geradas")
        .update({
          tipo,
          tom,
          tema: tema ?? current.tema ?? null,
          titulo: (parsed.titulo || current.titulo || "Sem título").slice(0, 300),
          subtitulo: parsed.subtitulo ? String(parsed.subtitulo).slice(0, 500) : null,
          corpo: parsed.corpo || "",
          fontes: fontesPayload,
          transcription_id: transcricaoFonte?.id ?? current.transcription_id ?? null,
          status: "rascunho",
          prompt_input: briefingFinal,
          metadata: metadataPayload,
          versao: currentVersao + 1,
          provider: resp.provider,
          model: resp.model,
          updated_at: new Date().toISOString(),
        })
        .eq("id", reprocessMateriaId)
        .select("*")
        .maybeSingle();
      if (error) console.error("[ic-write-materia] update error:", error);
      saved = data;
    } else if (salvarComo === "rascunho") {
      const { data, error } = await admin
        .from("materias_geradas")
        .insert({
          client_id: clientId,
          tipo,
          tom,
          tema: tema ?? null,
          titulo: (parsed.titulo || "Sem título").slice(0, 300),
          subtitulo: parsed.subtitulo ? String(parsed.subtitulo).slice(0, 500) : null,
          corpo: parsed.corpo || "",
          fontes: fontesPayload,
          transcription_id: transcricaoFonte?.id ?? null,
          status: "rascunho",
          prompt_input: briefingFinal,
          metadata: metadataPayload,
          provider: resp.provider,
          model: resp.model,
          versao: 1,
        })
        .select("*")
        .maybeSingle();
      if (error) console.error("[ic-write-materia] save error:", error);
      saved = data;
    }

    return jsonResponse({
      materia: parsed,
      saved,
      provider: resp.provider,
      contexto_usado: {
        memoria: memoria?.length || 0,
        transcricoes: transcricoes?.length || 0,
        posts: posts?.length || 0,
        transcricao_fonte: transcricaoFonte ? { id: transcricaoFonte.id, filename: transcricaoFonte.filename } : null,
        fontes_transcricoes: fontesTranscricoes.map((t) => ({ id: t.id, label: t.label, filename: t.filename })),
      },
      model: resp.model,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("ic-write-materia error:", msg);
    return errorResponse(msg);
  }
});