import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * narrativa-gerar
 * A partir do dossiê (dados_brutos + analise) e do perfil do candidato,
 * usa Lovable AI para gerar:
 *  - 3 versões de discurso (popular / técnico / emocional)
 *  - 3 ataques 3-camadas (Tema -> Falha do gestor -> Solução do candidato)
 *  - 3 manchetes para reels/cards
 *  - 1 roteiro de visita estratégica (foco emocional + bairro sugerido) — legado
 *  - roteiro_estrategico: 4–6 paradas reais (local, objetivo, emoção, fala, imagem)
 *
 * Body: { dossie_id }
 */

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SUPA_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

export function normBairro(s: string): string {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function buildContextoWebBlock(ctx: any): string {
  if (!ctx) return "";
  const linhas: string[] = [];
  linhas.push("CONTEXTO RECENTE DA WEB (busca em tempo real — Wikipedia, Google News, sites .gov.br):");
  if (ctx.wiki?.extrato) {
    linhas.push(`📖 Wikipedia: ${ctx.wiki.extrato}`);
  }
  // Infobox da Wikipedia (prefeito, área, altitude, gentílico, padroeiro, símbolos, etc.)
  const infobox = ctx?.wiki_pagina?.infobox || ctx?.wiki_secoes?.infobox;
  if (infobox && typeof infobox === "object") {
    const entradas = Object.entries(infobox);
    if (entradas.length) {
      linhas.push(`\n🏛️ Ficha técnica do município (Wikipedia infobox):`);
      for (const [k, v] of entradas) {
        linhas.push(`  • ${k}: ${v}`);
      }
    }
  }
  // Seções ricas da Wikipedia (até 20 — todas as áreas relevantes)
  const wikiPagina = ctx?.wiki_pagina || ctx?.wiki_secoes;
  const secoes = wikiPagina?.secoes;
  if (secoes && typeof secoes === "object") {
    const entradas = Object.entries(secoes);
    if (entradas.length) {
      linhas.push(`\n📚 Conteúdo enciclopédico (Wikipedia — ${wikiPagina.titulo_pagina}):`);
      for (const [titulo, conteudo] of entradas) {
        linhas.push(`\n  ▸ ${titulo}:\n  ${String(conteudo).slice(0, 900)}`);
      }
    }
  }
  const noticias = Array.isArray(ctx.noticias) ? ctx.noticias : [];
  if (noticias.length) {
    linhas.push(`\n📰 Notícias recentes (${noticias.length}, últimos 90 dias):`);
    for (const n of noticias.slice(0, 8)) {
      linhas.push(`  - [${n.data || "?"}] "${n.titulo}" (${n.fonte})${n.resumo ? ` — ${n.resumo.slice(0, 160)}` : ""}`);
    }
  }
  const oficiais = Array.isArray(ctx.oficiais) ? ctx.oficiais : [];
  if (oficiais.length) {
    linhas.push(`\n🏛️ Fontes oficiais (.gov.br):`);
    for (const o of oficiais.slice(0, 5)) {
      linhas.push(`  - [${o.data || "?"}] "${o.titulo}" (${o.fonte})`);
    }
  }
  if (linhas.length === 1) return ""; // só o cabeçalho — sem conteúdo útil
  linhas.push("\nUSE este contexto para: (1) citar acontecimentos REAIS e RECENTES nos discursos e ataques; (2) preencher o BRIEFING DO MUNICÍPIO com dados estruturados; (3) gerar CURIOSIDADES & CULTURA LOCAL. Tudo baseado nos textos acima — proibido inventar.\n");
  return linhas.join("\n") + "\n";
}

/**
 * Sanitiza o roteiro estratégico retornado pela IA:
 *  - descarta paradas sem bairro
 *  - descarta paradas cujo "bairro" bate com nome de político (lista TSE)
 *  - descarta paradas com bairro fora da lista de bairros válidos
 *  - renumera o campo `ordem` sequencialmente (1..N) nas paradas remanescentes
 *
 * `bairrosValidos` e `nomesPoliticos` devem conter strings já normalizadas
 * via `normBairro`.
 */
export function sanitizeRoteiro(
  roteiro: any[],
  bairrosValidos: Set<string>,
  nomesPoliticos: Set<string>,
): { paradas: any[]; descartadas: number; total: number } {
  const total = Array.isArray(roteiro) ? roteiro.length : 0;
  if (!Array.isArray(roteiro)) return { paradas: [], descartadas: 0, total: 0 };

  const filtradas = roteiro.filter((p: any) => {
    const b = normBairro(p?.bairro || "");
    if (!b) return false;
    if (nomesPoliticos.has(b)) return false;
    for (const valido of bairrosValidos) {
      if (!valido) continue;
      if (b === valido || b.includes(valido) || valido.includes(b)) return true;
    }
    return false;
  });

  const paradas = filtradas.map((p: any, i: number) => ({ ...p, ordem: i + 1 }));
  return { paradas, descartadas: total - paradas.length, total };
}

function buildSystemPrompt(perfil: any) {
  const bandeiras = Array.isArray(perfil?.bandeiras) ? perfil.bandeiras.join(", ") : "";
  return `Você é um estrategista político brasileiro especializado em discursos de campanha territorial.

CANDIDATO:
- Nome: ${perfil?.nome_candidato || "—"}
- Cargo pretendido: ${perfil?.cargo_pretendido || "—"}
- Partido: ${perfil?.partido || "—"}
- Bandeiras: ${bandeiras || "—"}
- Tom de voz preferido: ${perfil?.tom_voz || "popular"}
- Estilo: ${perfil?.estilo_discurso || "—"}
- Proposta central: ${perfil?.proposta_central || "—"}

REGRAS OBRIGATÓRIAS:
- Fale SEMPRE em português brasileiro coloquial.
- Use os DADOS REAIS do dossiê — nunca invente números nem nomes.
- Quando citar uma dor, conecte-a EMOCIONALMENTE com a vida cotidiana do morador.
- O candidato é alguém que VEM DE BAIXO, conhece a realidade, fala direto.
- Nunca seja genérico. Sempre mencione o NOME da cidade.
- Saída deve ser estritamente um JSON válido seguindo o schema do tool.`;
}

function buildUserPrompt(dossie: any, ranking?: Record<string, any>, contextoWeb?: any) {
  const meta = dossie.dados_brutos?.meta || {};
  const ibge = dossie.dados_brutos?.ibge || {};
  const tse = dossie.dados_brutos?.tse_local || {};
  const midia = dossie.dados_brutos?.midia_gdelt || {};
  const analise = dossie.analise || {};
  const indicadores = ibge?.indicadores || {};
  const indicadoresEstado = ibge?.indicadores_estado || {};

  // Lista compacta de indicadores reais com comparação ao estado
  // FILTRO: descarta dados com mais de 3 anos — narrativa só usa material fresco.
  const ANO_LIMITE = new Date().getFullYear() - 3;
  const indicadoresIgnorados: string[] = [];
  const linhasIndicadores: string[] = [];
  for (const [id, data] of Object.entries(indicadores)) {
    const d: any = data;
    if (!d) continue;
    // Pula indicadores antigos demais (Censo 2010, IDH 2010, etc.)
    if (d.ano && d.ano < ANO_LIMITE) {
      indicadoresIgnorados.push(`${d.label} (${d.ano})`);
      continue;
    }
    // Comparativo estadual via RPC tem prioridade (ranking + percentil)
    const r: any = ranking?.[id];
    const e: any = indicadoresEstado[id];
    const partes = [`- ${d.label}: ${d.valor} ${d.unidade} (${d.ano}, ${d.fonte})`];
    if (r && Number.isFinite(Number(r.media_uf))) {
      const sinal = r.delta_pct > 0 ? "+" : "";
      const qual = r.higher_is_worse ? "1º = pior" : "1º = melhor";
      partes.push(
        `  → média ${meta.uf}: ${r.media_uf} | min ${r.min_uf} / máx ${r.max_uf} | posição ${r.posicao}º de ${r.total_uf} (${qual}) | ${sinal}${r.delta_pct}% vs média`,
      );
    } else if (e && Number.isFinite(e.valor)) {
      const diff = d.valor - e.valor;
      const sinal = diff > 0 ? "+" : "";
      partes.push(`  → média ${meta.uf}: ${e.valor} (${sinal}${diff.toFixed(2)})`);
    }
    linhasIndicadores.push(partes.join("\n"));
  }

  // Evidências numéricas das dores (já agregadas pela narrativa-analise)
  const evidenciasDores = (analise?.dores || [])
    .filter((d: any) => d.tem_dados && d.evidencias?.length)
    .map((d: any) => {
      const evs = d.evidencias.map((e: any) => {
        const cmp = e.valor_estado != null
          ? ` vs ${e.valor_estado.toFixed(2)} (média ${meta.uf}, delta ${e.delta_pct?.toFixed(1)}%)`
          : "";
        return `   • ${e.titulo}: ${e.valor_cidade} ${e.unidade}${cmp} [${e.fonte}, ${e.ano}]`;
      }).join("\n");
      return `${d.area.toUpperCase()} — ${d.classificacao} (score ${d.pain_score}):\n${evs}`;
    }).join("\n\n");

  const bairrosReais = (analise?.bairros_inferidos || []).join(", ");
  const topLocaisLista = (analise?.top_locais_criticos || []).slice(0, 8);
  const topLocais = topLocaisLista
    .map((l: any) => `   - ${l.bairro}${l.nome_local ? ` (${l.nome_local})` : ""} | zona ${l.zona} | eleito teve ${l.pct_eleito_zona ?? "?"}%`)
    .join("\n");
  const doresPrioritarias = (analise?.dores || [])
    .filter((d: any) => ["explosiva", "latente"].includes(String(d.classificacao || "").toLowerCase()))
    .slice(0, 4)
    .map((d: any) => `${d.area}: ${d.classificacao} (score ${d.pain_score})`)
    .join(" | ");

  return `DOSSIÊ DA CIDADE
Cidade: ${meta.municipio} / ${meta.uf}
Região: ${ibge?.base?.regiao ?? "—"}
Microrregião: ${ibge?.base?.microrregiao ?? "—"}

INDICADORES MUNICIPAIS RECENTES (≤3 anos, com comparação ao estado de ${meta.uf}):
${linhasIndicadores.join("\n") || "(sem dados IBGE)"}
${indicadoresIgnorados.length ? `\n(Descartados por serem antigos demais: ${indicadoresIgnorados.join(", ")})` : ""}

${buildContextoWebBlock(contextoWeb)}
EVIDÊNCIAS NUMÉRICAS DAS DORES (use ESTES números nos discursos):
${evidenciasDores || "(sem evidências numéricas — use TSE e mídia)"}

TOP CANDIDATOS LOCAIS — apenas contexto político:
${(tse?.top_por_cargo_ano || []).slice(0, 4).map((b: any) =>
  `- ${b.ano} ${b.cargo}: ${b.top.slice(0, 3).map((c: any) => `${c.nome} (${c.partido}) ${c.votos} votos`).join(" | ")}`,
).join("\n") || "(sem dados)"}

PARTIDOS DOMINANTES:
${(tse?.partidos_dominantes || []).slice(0, 5).map((p: any) => `${p.partido}: ${p.votos}`).join(", ") || "—"}

MÍDIA RECENTE (últimos 30 dias, ${midia?.total ?? 0} artigos, tom médio ${midia?.tom_medio?.toFixed?.(2) ?? "—"}):
${(midia?.artigos || []).slice(0, 8).map((a: any) => `- "${a.titulo}" (${a.fonte})`).join("\n") || "(sem cobertura)"}

Oportunidade política: ${analise?.oportunidade?.nivel} (score ${analise?.oportunidade?.oportunidade_score}). Dor principal: ${analise?.oportunidade?.dor_principal}. Força do gestor atual: ${analise?.oportunidade?.forca_gestor_atual ?? "—"}%.

INSTRUÇÕES CRÍTICAS:
- USE OS NÚMEROS REAIS acima nos discursos (ex: "esgoto chega a só 58% das casas, contra 70% da média do estado")
- Quando houver delta vs estado, EXPLORE o contraste — é arma política poderosa
- SEMPRE cite o ano do dado entre parênteses (ex: "PIB per capita R$ 35.000 em 2021")
- PROIBIDO mencionar dados de censos antigos (2010 ou anteriores) — eles foram filtrados desta lista de propósito
- Se um indicador NÃO tiver dado recente, NÃO invente — fale do que tem
- Os "ataques 3-camadas" devem usar números específicos da cidade
- Se o "CONTEXTO RECENTE DA WEB" trouxer notícias dos últimos 90 dias, AMARRE pelo menos 1 ataque ou 1 discurso a um acontecimento real citado lá (ex: "a obra que parou no bairro X", "o decreto da prefeitura sobre Y").
- NUNCA invente notícia ou cite fonte que não esteja na lista do contexto web acima.

========================================
BRIEFING DO MUNICÍPIO (obrigatório)
========================================
Preencha "briefing_municipio" como um dossiê executivo. Use TUDO que estiver no CONTEXTO RECENTE DA WEB acima — infobox + seções (Geografia, Economia, Política, Saúde, Educação, Transporte, Cultura, Personalidades, Patrimônio, etc.).

REGRAS:
1. SOMENTE dados do contexto web. Se um campo não tiver fonte, deixe vazio (string ""), NÃO invente.
2. "visao_geral" deve ser uma síntese viva (2-4 frases): identidade da cidade, vocação econômica e peso regional.
3. "ficha_rapida" puxe direto da infobox (gentílico, fundação, área, altitude, clima, padroeiro, lema, site).
4. "municipios_vizinhos" e "distritos_bairros": liste o que o texto menciona — nada além.
5. "politica_local": prefeito atual + partido (infobox) e qualquer pista de força política mencionada.
6. "personalidades_notaveis": nomes citados na seção Personalidades/Filhos ilustres com 1 frase explicando quem é.
7. "dicas_abordagem" (3-6 itens) é prático: como o candidato deve se comportar, o que dizer/fazer para mostrar respeito local. Baseie-se em Cultura, Religião, Gastronomia, Esportes.
8. "evitar": só inclua se o texto sugerir rivalidades, polêmicas ou erros típicos. Caso contrário, deixe array vazio.

========================================
CURIOSIDADES & CULTURA LOCAL (obrigatório)
========================================
Gere 5 a 10 fatos REAIS sobre a cidade para o candidato chegar conhecendo o lugar — história, cultura, economia, gastronomia, personalidades famosas, festas tradicionais, etimologia do nome, geografia, esportes, religião.

REGRAS:
1. Use SOMENTE informações do bloco "CONTEXTO RECENTE DA WEB" (Wikipedia + páginas de conhecimento local) acima. NUNCA invente.
2. Se o contexto web não trouxer informação para uma categoria, NÃO crie esse item — prefira menos itens com fontes reais.
3. "fato" deve ser uma síntese clara em 1-3 frases — NÃO copie wikitext bruto, reescreva em português direto.
4. "uso_politico" é uma sugestão CURTA e prática de como o candidato pode citar isso (ex: "Mencione o time local na abertura da fala em bairros operários" ou "Cite o nome do santo padroeiro ao falar com a comunidade católica").
5. Distribua entre categorias diferentes (não 8 fatos só de história).
6. Foque em coisas que MOSTRAM RESPEITO PELA CIDADE: pratos típicos, datas comemorativas, personalidades queridas, lendas, conquistas esportivas, marcos arquitetônicos.

Para referência (NÃO use no roteiro): top locais críticos = ${topLocais ? "ver acima" : "(sem dados)"}; dores prioritárias = ${doresPrioritarias || "—"}.

Gere o pacote completo de munição política para esta cidade.`;
}

const TOOL_SCHEMA = {
  type: "function",
  function: {
    name: "gerar_pacote_narrativa",
    description: "Gera o pacote completo de discurso, ataques, manchetes e roteiro de visita.",
    parameters: {
      type: "object",
      properties: {
        discursos: {
          type: "object",
          properties: {
            popular: { type: "string", description: "Discurso linguagem do povo, 200-300 palavras." },
            tecnico: { type: "string", description: "Discurso com dados, propostas claras, 200-300 palavras." },
            emocional: { type: "string", description: "Discurso visceral, conta uma história, 200-300 palavras." },
          },
          required: ["popular", "tecnico", "emocional"],
          additionalProperties: false,
        },
        ataques_3_camadas: {
          type: "array",
          minItems: 3,
          maxItems: 3,
          items: {
            type: "object",
            properties: {
              tema: { type: "string" },
              falha_do_gestor: { type: "string" },
              solucao_proposta: { type: "string" },
            },
            required: ["tema", "falha_do_gestor", "solucao_proposta"],
            additionalProperties: false,
          },
        },
        manchetes_reels: {
          type: "array",
          minItems: 3,
          maxItems: 5,
          items: { type: "string", description: "Frase curta tipo manchete (max 80 chars)." },
        },
        curiosidades_locais: {
          type: "array",
          minItems: 5,
          maxItems: 10,
          description: "Resumo cultural, histórico e curiosidades da cidade para o candidato chegar conhecendo o lugar. Baseado nos textos da Wikipedia (seções História, Cultura, Economia, Personalidades, Gastronomia, etc.) presentes em CONTEXTO RECENTE DA WEB.",
          items: {
            type: "object",
            properties: {
              categoria: {
                type: "string",
                enum: ["historia", "cultura", "economia", "geografia", "personalidades", "gastronomia", "religiao", "esporte", "curiosidade", "etimologia"],
                description: "Categoria do fato.",
              },
              titulo: { type: "string", description: "Título curto da curiosidade (max 80 chars)." },
              fato: { type: "string", description: "1-3 frases descrevendo o fato real (sempre baseado em fonte do contexto web). Max 400 chars." },
              uso_politico: { type: "string", description: "UMA dica curta de como o candidato pode mencionar isso em fala/conversa para mostrar que conhece a cidade. Max 200 chars." },
            },
            required: ["categoria", "titulo", "fato", "uso_politico"],
            additionalProperties: false,
          },
        },
        briefing_municipio: {
          type: "object",
          description: "Briefing executivo estruturado do município — preenchido SOMENTE com dados extraídos do CONTEXTO RECENTE DA WEB (Wikipedia infobox + seções). Cada campo opcional: deixe vazio se a informação não estiver no contexto.",
          properties: {
            visao_geral: { type: "string", description: "Resumo de 2-4 frases sobre a cidade: identidade, vocação econômica, peso na região." },
            ficha_rapida: {
              type: "object",
              description: "Dados objetivos prontos para o candidato decorar.",
              properties: {
                gentilico: { type: "string" },
                fundacao: { type: "string", description: "Data ou ano de fundação." },
                aniversario: { type: "string" },
                area_km2: { type: "string" },
                altitude: { type: "string" },
                clima: { type: "string" },
                populacao: { type: "string" },
                regiao: { type: "string", description: "Mesorregião / microrregião / região metropolitana." },
                padroeiro: { type: "string" },
                lema: { type: "string" },
                site_oficial: { type: "string" },
              },
              additionalProperties: false,
            },
            simbolos: { type: "string", description: "Bandeira, brasão, hino — se mencionados." },
            geografia_clima: { type: "string", description: "Relevo, hidrografia (rios principais), clima, vegetação." },
            municipios_vizinhos: {
              type: "array",
              maxItems: 12,
              items: { type: "string" },
              description: "Lista de municípios limítrofes citados na infobox/seção Geografia.",
            },
            distritos_bairros: {
              type: "array",
              maxItems: 15,
              items: { type: "string" },
              description: "Distritos ou bairros principais citados na Wikipedia.",
            },
            economia_resumo: { type: "string", description: "Setores que sustentam a cidade (agro, indústria, comércio, serviços). Cite atividades específicas se mencionadas." },
            infraestrutura: { type: "string", description: "Saúde, educação, transporte, energia, saneamento — só o que constar no texto." },
            politica_local: { type: "string", description: "Prefeito atual e partido (da infobox), composição da câmara, força partidária — se constar." },
            personalidades_notaveis: {
              type: "array",
              maxItems: 8,
              items: {
                type: "object",
                properties: {
                  nome: { type: "string" },
                  por_que_importa: { type: "string", description: "Uma frase curta sobre quem é/foi a pessoa." },
                },
                required: ["nome", "por_que_importa"],
                additionalProperties: false,
              },
            },
            pontos_turisticos: {
              type: "array",
              maxItems: 8,
              items: { type: "string" },
              description: "Patrimônios, monumentos, museus, atrativos naturais.",
            },
            festas_eventos: {
              type: "array",
              maxItems: 8,
              items: { type: "string" },
              description: "Festas tradicionais, religiosas, eventos anuais.",
            },
            dicas_abordagem: {
              type: "array",
              minItems: 3,
              maxItems: 6,
              items: { type: "string" },
              description: "Dicas práticas de protocolo cultural ao chegar na cidade (ex: 'chame o povo de pantaneiro', 'cumprimente sempre o padre na visita à igreja matriz', 'aceite tereré em qualquer reunião'). Use o que estiver na seção Cultura/Religião/Gastronomia.",
            },
            evitar: {
              type: "array",
              maxItems: 5,
              items: { type: "string" },
              description: "Erros comuns a evitar (ex: 'não confunda o gentílico com a cidade vizinha', 'não chame o time rival', 'evite citar adversário histórico'). Só inclua se houver pista clara no contexto.",
            },
          },
          required: ["visao_geral", "ficha_rapida", "dicas_abordagem"],
          additionalProperties: false,
        },
      },
      required: ["discursos", "ataques_3_camadas", "manchetes_reels", "curiosidades_locais", "briefing_municipio"],
      additionalProperties: false,
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY ausente");
    const { dossie_id } = await req.json();
    if (!dossie_id) {
      return new Response(JSON.stringify({ error: "dossie_id obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supa = createClient(SUPA_URL, SUPA_KEY);

    const { data: dossie, error: dErr } = await supa
      .from("narrativa_dossies")
      .select("*")
      .eq("id", dossie_id)
      .maybeSingle();
    if (dErr || !dossie) throw new Error("Dossiê não encontrado");

    const { data: perfil } = await supa
      .from("narrativa_perfil_candidato")
      .select("*")
      .eq("client_id", dossie.client_id)
      .maybeSingle();

    await supa.from("narrativa_dossies").update({ status: "gerando" }).eq("id", dossie_id);

    // Busca ranking estadual (Atlas/INEP/DATASUS/SNIS) para o município do dossiê
    let rankingMap: Record<string, any> = {};
    try {
      const meta: any = dossie.dados_brutos?.meta || {};
      const codigoIbge = meta?.codigo_ibge ?? meta?.codigoIbge;
      if (codigoIbge) {
        const { data: rk } = await supa.rpc("municipio_ranking", {
          p_codigo_ibge: Number(codigoIbge),
        });
        for (const row of (rk as any[]) || []) {
          rankingMap[String(row.indicador_id)] = row;
        }
      }
    } catch (rkErr) {
      console.warn("ranking RPC falhou, seguindo sem comparativo estadual:", rkErr);
    }

    // Busca contexto web em tempo real (Wikipedia + Google News + sites .gov.br)
    // Sem persistência — apenas em memória para enriquecer este prompt.
    let contextoWeb: any = null;
    try {
      const meta: any = dossie.dados_brutos?.meta || {};
      if (meta?.municipio && meta?.uf) {
        const webRes = await fetch(`${SUPA_URL}/functions/v1/municipio-contexto-web`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SUPA_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ municipio: meta.municipio, uf: meta.uf, max_news: 8 }),
        });
        if (webRes.ok) {
          contextoWeb = await webRes.json();
          console.log("contexto web ok:", contextoWeb?._stats);
        } else {
          console.warn("contexto web falhou:", webRes.status);
        }
      }
    } catch (webErr) {
      console.warn("contexto web erro (seguindo sem):", (webErr as Error).message);
    }

    const aiRes = await fetch(AI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: buildSystemPrompt(perfil) },
          { role: "user", content: buildUserPrompt(dossie, rankingMap, contextoWeb) },
        ],
        tools: [TOOL_SCHEMA],
        tool_choice: { type: "function", function: { name: "gerar_pacote_narrativa" } },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      if (aiRes.status === 429) {
        await supa.from("narrativa_dossies").update({ status: "erro", erro_msg: "Limite de requisições atingido. Tente novamente em alguns instantes." }).eq("id", dossie_id);
        return new Response(JSON.stringify({ error: "Limite de requisições da IA. Aguarde e tente de novo." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        await supa.from("narrativa_dossies").update({ status: "erro", erro_msg: "Créditos da IA esgotados." }).eq("id", dossie_id);
        return new Response(JSON.stringify({ error: "Créditos da IA esgotados. Adicione créditos no workspace." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway: ${aiRes.status} ${errText}`);
    }

    const aiJson = await aiRes.json();
    const tcArgs = aiJson?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!tcArgs) throw new Error("IA não retornou tool_call estruturada");
    const conteudos = JSON.parse(tcArgs);

    // (Sanitização de roteiro estratégico removida — feature substituída por curiosidades_locais.)

    await supa
      .from("narrativa_dossies")
      .update({
        conteudos,
        status: "pronto",
        generated_at: new Date().toISOString(),
      })
      .eq("id", dossie_id);

    return new Response(JSON.stringify({ dossie_id, conteudos }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "erro desconhecido";
    console.error("narrativa-gerar error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});