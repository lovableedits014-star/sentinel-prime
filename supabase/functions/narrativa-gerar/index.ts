import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callLLM, callLLMRaw, getClientLLMConfig } from "../_shared/llm-router.ts";
import { getCorrelationId, getRequestId, type TelemetryContext } from "../_shared/telemetry.ts";
import { parseLooseJson } from "../_shared/ic-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * narrativa-gerar
 * Usa o provedor de IA central (Settings → Provedor de IA) para gerar pacotes de narrativa.
 */

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SUPA_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
    - Saída deve ser estritamente um JSON válido no formato solicitado.`;
}

function buildJsonOutputInstructions() {
  return `

FORMATO DE SAÍDA OBRIGATÓRIO:
Retorne APENAS JSON puro, sem markdown, sem comentários e sem texto antes/depois.
O JSON deve ter exatamente estas chaves principais:
{
  "discursos": { "popular": "...", "tecnico": "...", "emocional": "..." },
  "ataques_3_camadas": [{ "tema": "...", "falha_do_gestor": "...", "solucao_proposta": "..." }],
  "manchetes_reels": ["..."],
  "curiosidades_locais": [{ "categoria": "historia|cultura|economia|geografia|personalidades|gastronomia|religiao|esporte|curiosidade|etimologia", "titulo": "...", "fato": "...", "uso_politico": "..." }],
  "briefing_municipio": {
    "visao_geral": "...",
    "ficha_rapida": { "gentilico": "", "fundacao": "", "aniversario": "", "area_km2": "", "altitude": "", "clima": "", "populacao": "", "regiao": "", "padroeiro": "", "lema": "", "site_oficial": "" },
    "simbolos": "", "geografia_clima": "", "municipios_vizinhos": [], "distritos_bairros": [], "economia_resumo": "", "infraestrutura": "", "politica_local": "", "personalidades_notaveis": [], "pontos_turisticos": [], "festas_eventos": [], "dicas_abordagem": [], "evitar": []
  },
  "posts_redes": [{ "plataforma": "facebook|instagram|whatsapp|story", "tema": "...", "texto": "...", "hashtags": [], "cta": "..." }],
  "plano_de_campo": [{ "ordem": 1, "bairro": "...", "local_sugerido": "...", "periodo": "manha|tarde|noite", "objetivo": "escuta|denuncia|presenca|mobilizacao|evento", "mensagem_chave": "...", "dor_alvo": "...", "acao_sugerida": "..." }]
}`;
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

Para referência (use como base do PLANO DE CAMPO): top locais críticos = ${topLocais || "(sem dados)"}; dores prioritárias = ${doresPrioritarias || "—"}.

========================================
POSTS DE REDES (obrigatório)
========================================
Gere 4-8 posts prontos para publicação. Distribua entre Facebook, Instagram, WhatsApp e Story. Cada post deve:
1. Citar a CIDADE pelo nome.
2. Trazer pelo menos 1 dado/local/dor real do dossiê acima.
3. Linguagem PT-BR coloquial, com emoji estratégico (não exagerar).
4. Hashtags só para Facebook/Instagram/Story (locais + temáticas).
5. CTA claro (compartilhar, marcar amigo, ir ao evento).

========================================
PLANO DE CAMPO (obrigatório)
========================================
Monte agenda territorial de 5-10 paradas. REGRAS:
1. Use SOMENTE bairros que aparecem em "top locais críticos" acima — não invente bairro.
2. Cada parada amarra a uma DOR específica do mapa de dor (saúde, educação, infra, etc.).
3. mensagem_chave deve usar número/fato real (ex.: "Aqui em [Bairro X], o pessoal espera [Y meses] por consulta no CAPSi").
4. acao_sugerida é prática: caminhada, café, live, visita a equipamento, audiência com liderança.
5. Distribua períodos (manhã/tarde/noite) e objetivos (escuta/denúncia/presença/mobilização/evento) — não repita o mesmo objetivo em mais de 3 paradas.

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
          minItems: 3,
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
        posts_redes: {
          type: "array",
          minItems: 4,
          maxItems: 8,
          description: "Posts prontos para publicação nas redes sociais. Distribua entre Facebook (texto longo, 200-400 chars com narrativa+CTA), Instagram (caption curta 80-160 chars + hashtags locais), WhatsApp/Status (mensagem direta de mobilização, max 300 chars), Story/Reels (gancho curto + chamada). SEMPRE em PT-BR coloquial, com emoji estratégico, citando dado/local real da cidade.",
          items: {
            type: "object",
            properties: {
              plataforma: { type: "string", enum: ["facebook", "instagram", "whatsapp", "story"] },
              tema: { type: "string", description: "Sobre qual dor/proposta o post fala (ex: 'saúde — fila do CAPSi')." },
              texto: { type: "string", description: "Texto pronto para publicar, já com emojis e quebras." },
              hashtags: { type: "array", items: { type: "string" }, description: "3-8 hashtags (sem #), locais e temáticas. Vazio para WhatsApp." },
              cta: { type: "string", description: "Chamada final (ex: 'Compartilhe se você concorda', 'Marca alguém da sua rua')." },
            },
            required: ["plataforma", "tema", "texto", "cta"],
            additionalProperties: false,
          },
        },
        plano_de_campo: {
          type: "array",
          minItems: 5,
          maxItems: 10,
          description: "Agenda territorial concreta — onde o candidato deve ir, quando, e o que falar. Use SOMENTE os bairros/locais reais que aparecem em 'top locais críticos' do dossiê. Cada parada tem objetivo claro: ouvir, mostrar presença, denunciar uma dor, ou mobilizar.",
          items: {
            type: "object",
            properties: {
              ordem: { type: "number" },
              bairro: { type: "string", description: "Nome do bairro real (do top locais críticos)." },
              local_sugerido: { type: "string", description: "Nome do local âncora (escola, UBS, praça) ou ponto de encontro." },
              periodo: { type: "string", enum: ["manha", "tarde", "noite"] },
              objetivo: { type: "string", enum: ["escuta", "denuncia", "presenca", "mobilizacao", "evento"] },
              mensagem_chave: { type: "string", description: "Frase de 1-2 linhas — o que o candidato deve dizer ali, com dado real da cidade/bairro." },
              dor_alvo: { type: "string", description: "Qual dor (saúde, educação, infra, etc) puxar nesta parada." },
              acao_sugerida: { type: "string", description: "O que fazer concretamente (ex: 'caminhada com lideranças', 'café com mães na escola X', 'live de denúncia em frente à UBS fechada')." },
            },
            required: ["ordem", "bairro", "periodo", "objetivo", "mensagem_chave", "dor_alvo", "acao_sugerida"],
            additionalProperties: false,
          },
        },
      },
      required: ["discursos", "ataques_3_camadas", "manchetes_reels", "curiosidades_locais", "briefing_municipio", "posts_redes", "plano_de_campo"],
      additionalProperties: false,
    },
  },
};

function normalizeStringArray(value: any, min = 0): string[] {
  const arr = Array.isArray(value) ? value : [];
  const cleaned = arr.map((v) => String(v || "").trim()).filter(Boolean);
  while (cleaned.length < min) cleaned.push("—");
  return cleaned;
}

function normalizeConteudos(raw: any): any {
  const obj = raw && typeof raw === "object" ? raw : {};
  const discursos = obj.discursos && typeof obj.discursos === "object" ? obj.discursos : {};
  const briefing = obj.briefing_municipio && typeof obj.briefing_municipio === "object" ? obj.briefing_municipio : {};
  return {
    discursos: {
      popular: String(discursos.popular || ""),
      tecnico: String(discursos.tecnico || ""),
      emocional: String(discursos.emocional || ""),
    },
    ataques_3_camadas: (Array.isArray(obj.ataques_3_camadas) ? obj.ataques_3_camadas : []).slice(0, 3).map((a: any) => ({
      tema: String(a?.tema || ""),
      falha_do_gestor: String(a?.falha_do_gestor || ""),
      solucao_proposta: String(a?.solucao_proposta || ""),
    })),
    manchetes_reels: normalizeStringArray(obj.manchetes_reels, 3).slice(0, 5),
    curiosidades_locais: (Array.isArray(obj.curiosidades_locais) ? obj.curiosidades_locais : []).slice(0, 10).map((c: any) => ({
      categoria: String(c?.categoria || "curiosidade"),
      titulo: String(c?.titulo || ""),
      fato: String(c?.fato || ""),
      uso_politico: String(c?.uso_politico || ""),
    })),
    briefing_municipio: {
      ...briefing,
      ficha_rapida: briefing.ficha_rapida && typeof briefing.ficha_rapida === "object" ? briefing.ficha_rapida : {},
      municipios_vizinhos: normalizeStringArray(briefing.municipios_vizinhos).slice(0, 12),
      distritos_bairros: normalizeStringArray(briefing.distritos_bairros).slice(0, 15),
      personalidades_notaveis: Array.isArray(briefing.personalidades_notaveis) ? briefing.personalidades_notaveis.slice(0, 8) : [],
      pontos_turisticos: normalizeStringArray(briefing.pontos_turisticos).slice(0, 8),
      festas_eventos: normalizeStringArray(briefing.festas_eventos).slice(0, 8),
      dicas_abordagem: normalizeStringArray(briefing.dicas_abordagem, 3).slice(0, 6),
      evitar: normalizeStringArray(briefing.evitar).slice(0, 5),
    },
    posts_redes: (Array.isArray(obj.posts_redes) ? obj.posts_redes : []).slice(0, 8).map((p: any) => ({
      plataforma: String(p?.plataforma || "facebook"),
      tema: String(p?.tema || ""),
      texto: String(p?.texto || ""),
      hashtags: normalizeStringArray(p?.hashtags).slice(0, 8),
      cta: String(p?.cta || ""),
    })),
    plano_de_campo: (Array.isArray(obj.plano_de_campo) ? obj.plano_de_campo : []).slice(0, 10).map((p: any, i: number) => ({
      ordem: Number(p?.ordem || i + 1),
      bairro: String(p?.bairro || ""),
      local_sugerido: String(p?.local_sugerido || ""),
      periodo: String(p?.periodo || "manha"),
      objetivo: String(p?.objetivo || "escuta"),
      mensagem_chave: String(p?.mensagem_chave || ""),
      dor_alvo: String(p?.dor_alvo || ""),
      acao_sugerida: String(p?.acao_sugerida || ""),
    })),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
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

    // Tenant guard: usuário precisa ter acesso ao client_id do dossiê
    const { requireClientAccess } = await import("../_shared/auth-guard.ts");
    const guard = await requireClientAccess(req, dossie.client_id);
    if (!guard.ok) return guard.response;

    // Provedor de IA central (Settings → Provedor de IA)
    let llmConfig;
    try {
      llmConfig = await getClientLLMConfig(supa, dossie.client_id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "IA não configurada";
      await supa.from("narrativa_dossies").update({ status: "erro", erro_msg: msg }).eq("id", dossie_id);
      return new Response(JSON.stringify({ error: msg }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    // Resolve codigo_ibge — meta pode vir sem ele em dossiês antigos.
    // Fallback: lookup por nome+UF em municipios_indicadores e tea_municipios_ms.
    const meta0: any = dossie.dados_brutos?.meta || {};
    let codigoIbgeResolvido: number | null =
      Number(meta0?.codigo_ibge ?? meta0?.codigoIbge) || null;
    if (!codigoIbgeResolvido && meta0?.municipio && meta0?.uf) {
      try {
        const { data: mi } = await supa
          .from("municipios_indicadores")
          .select("codigo_ibge")
          .ilike("nome", String(meta0.municipio))
          .eq("uf", String(meta0.uf).toUpperCase())
          .maybeSingle();
        if (mi?.codigo_ibge) codigoIbgeResolvido = Number(mi.codigo_ibge);
      } catch (_e) { /* ignore */ }
      if (!codigoIbgeResolvido && String(meta0?.uf || "").toUpperCase() === "MS") {
        try {
          const { data: tm } = await supa
            .from("tea_municipios_ms")
            .select("codigo_ibge")
            .ilike("nome", String(meta0.municipio))
            .maybeSingle();
          if (tm?.codigo_ibge) codigoIbgeResolvido = Number(tm.codigo_ibge);
        } catch (_e) { /* ignore */ }
      }
    }
    console.log("codigo_ibge resolvido:", codigoIbgeResolvido, "para", meta0?.municipio, meta0?.uf);

    // ===== Votos reais (TSE local) =====
    // Agrega tse_votacao_zona por ano/cargo: total de votos contabilizados,
    // qtd de zonas, top 3 candidatos. NÃO temos eleitorado apto/comparecimento
    // para calcular abstenção real — esses campos ficam null até importarmos
    // tse_comparecimento_municipio.
    let votosReais: any = null;
    try {
      let q = supa
        .from("tse_votacao_zona")
        .select("ano,turno,cargo,zona,nome_urna,partido,votos,situacao")
        .order("ano", { ascending: false })
        .limit(5000);
      if (codigoIbgeResolvido) {
        q = q.eq("cod_municipio", codigoIbgeResolvido);
      } else if (meta0?.municipio && meta0?.uf) {
        q = q.ilike("municipio", String(meta0.municipio)).eq("uf", String(meta0.uf).toUpperCase());
      } else {
        q = q.limit(0);
      }
      const { data: rows } = await q;
      if (rows && rows.length) {
        const buckets: Record<string, any> = {};
        for (const r of rows as any[]) {
          const k = `${r.ano}|${r.turno}|${r.cargo}`;
          const b = buckets[k] ||= {
            ano: r.ano, turno: r.turno, cargo: r.cargo,
            total_votos: 0, zonas: new Set<number>(),
            candidatos: {} as Record<string, { nome: string; partido: string; votos: number; eleito: boolean }>,
          };
          b.total_votos += Number(r.votos || 0);
          if (r.zona != null) b.zonas.add(r.zona);
          const ck = `${r.nome_urna}|${r.partido}`;
          const cand = b.candidatos[ck] ||= { nome: r.nome_urna, partido: r.partido, votos: 0, eleito: false };
          cand.votos += Number(r.votos || 0);
          if (String(r.situacao || "").toLowerCase().includes("eleit")) cand.eleito = true;
        }
        const ciclos = Object.values(buckets).map((b: any) => ({
          ano: b.ano, turno: b.turno, cargo: b.cargo,
          total_votos: b.total_votos, n_zonas: b.zonas.size,
          top: Object.values(b.candidatos)
            .sort((a: any, x: any) => x.votos - a.votos).slice(0, 5),
        })).sort((a: any, b: any) => b.ano - a.ano || a.cargo.localeCompare(b.cargo));
        votosReais = { ciclos };
      }
      console.log("votos_reais ciclos:", votosReais?.ciclos?.length || 0);
    } catch (vErr) {
      console.warn("votos reais erro:", (vErr as Error).message);
    }

    // ===== TEA (autismo) — somente MS =====
    let teaMunicipio: any = null;
    let teaRanking: any = null;
    let teaLeis: any[] = [];
    try {
      if (String(meta0?.uf || "").toUpperCase() === "MS") {
        let qt = supa.from("tea_municipios_ms").select("*").limit(1);
        if (codigoIbgeResolvido) qt = qt.eq("codigo_ibge", codigoIbgeResolvido);
        else if (meta0?.municipio) qt = qt.ilike("nome", String(meta0.municipio));
        const { data: tea } = await qt.maybeSingle();
        if (tea) {
          teaMunicipio = tea;
          // Ranking estadual (RPC)
          if (tea.codigo_ibge) {
            const { data: rk } = await supa.rpc("tea_ranking_ms", { p_codigo_ibge: tea.codigo_ibge });
            teaRanking = rk || null;
            // Leis municipais (se houver)
            const { data: leis } = await supa
              .from("tea_legislacao_municipal")
              .select("tipo,numero,ano,ementa,url_fonte,status")
              .eq("codigo_ibge", tea.codigo_ibge);
            teaLeis = leis || [];
          }
        }
      }
      console.log("tea encontrado:", !!teaMunicipio, "ranking:", !!teaRanking, "leis:", teaLeis.length);
    } catch (tErr) {
      console.warn("tea erro:", (tErr as Error).message);
    }

    // Busca contexto web em tempo real (Wikipedia + Google News + sites .gov.br)
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

    // Bloco extra de prompt: votos reais + TEA (autismo)
    const votosBlock = (() => {
      if (!votosReais?.ciclos?.length) return "";
      const linhas = ["VOTAÇÃO REAL NO MUNICÍPIO (TSE — totais por urna agregados):"];
      for (const c of votosReais.ciclos.slice(0, 12)) {
        linhas.push(`- ${c.ano} ${c.cargo} (${c.turno}º turno) · ${c.total_votos.toLocaleString("pt-BR")} votos contabilizados em ${c.n_zonas} zona(s)`);
        for (const t of c.top.slice(0, 3)) {
          linhas.push(`    • ${t.nome} (${t.partido}): ${t.votos.toLocaleString("pt-BR")} votos${t.eleito ? " ✓ ELEITO" : ""}`);
        }
      }
      linhas.push("(Obs.: eleitorado apto, comparecimento e abstenção ainda não disponíveis na base — não invente esses números.)");
      return linhas.join("\n") + "\n\n";
    })();

    const teaBlock = (() => {
      if (!teaMunicipio) return "";
      const t = teaMunicipio;
      const fmt = (n: any) => (n == null ? "—" : Number(n).toLocaleString("pt-BR"));
      const semCapsi = (t.capsi_qtd || 0) === 0;
      const rk = teaRanking || {};
      const totalMun = rk?.total_municipios || 79;
      const rkLine = (label: string, pos: any, ascHint?: string) =>
        pos ? `    · ${label}: ${pos}º de ${totalMun} em MS${ascHint ? " " + ascHint : ""}` : "";

      const leisLinhas = teaLeis.length === 0
        ? "- Legislação municipal TEA mapeada: nenhuma encontrada na base (oportunidade de propor)."
        : teaLeis.map((l: any) => `- ${l.tipo.toUpperCase()}${l.numero ? " nº " + l.numero : ""}${l.ano ? "/" + l.ano : ""} — ${l.ementa || "(sem ementa)"}${l.url_fonte ? " [fonte: " + l.url_fonte + "]" : ""}`).join("\n");

      return `BANDEIRA AUTISMO (TEA) NO MUNICÍPIO — dados oficiais (IBGE + CNES + INEP):
- População ${t.populacao_ano || ""}: ${fmt(t.populacao)}
- Estimativa TEA total: ${fmt(t.est_tea_total_min)} a ${fmt(t.est_tea_total_max)} pessoas (faixa OMS 1:100 → CDC 1:36)
- Recorte por gênero (CDC 4:1): homens ${fmt(t.est_tea_homens_min)}–${fmt(t.est_tea_homens_max)} | mulheres ${fmt(t.est_tea_mulheres_min)}–${fmt(t.est_tea_mulheres_max)} (subdiagnóstico feminino é uma pauta crítica)
- Faixas etárias estimadas com TEA:
    · 0-5 anos (creche/pré): ${fmt(t.est_tea_0_5_min)}–${fmt(t.est_tea_0_5_max)} (diagnóstico precoce)
    · 6-14 anos (fundamental): ${fmt(t.est_tea_6_14_min)}–${fmt(t.est_tea_6_14_max)} (núcleo do gap escolar)
    · 15-17 anos (médio/transição): ${fmt(t.est_tea_15_17_min)}–${fmt(t.est_tea_15_17_max)}
    · 18+ adultos: ${fmt(t.est_tea_adultos_min)}–${fmt(t.est_tea_adultos_max)} (invisibilizados — sem política pública)
- Matrículas TEA na rede (INEP ${t.matriculas_tea_ano || ""}): ${fmt(t.matriculas_tea_inep)} | cobertura escolar: ${t.pct_cobertura_escolar != null ? t.pct_cobertura_escolar + "%" : "—"}
- Gap escolar (estimativa 6-14 não matriculada): ${fmt(t.gap_escolar_min)} a ${fmt(t.gap_escolar_max)} crianças
- Saúde — CNES detalhado:
    · CAPS I: ${fmt(t.caps_i_qtd)} | CAPS II: ${fmt(t.caps_ii_qtd)} | CAPS III: ${fmt(t.caps_iii_qtd)} | CAPS AD: ${fmt(t.caps_ad_qtd)} | CAPSi: ${fmt(t.capsi_qtd)}${semCapsi ? " ⚠️ SEM CAPSi" : ""}
    · CER (reabilitação): ${fmt(t.cer_qtd)} | UBS: ${fmt(t.ubs_qtd)} | habitantes/CAPS: ${fmt(t.hab_por_caps)}
    · Tempo médio estimado p/ diagnóstico: ${t.tempo_diag_estimado_meses ? t.tempo_diag_estimado_meses + " meses" : "—"} (proxy: sem CAPSi → fila >2 anos)
- Assistência social — BPC por deficiência: ${fmt(t.bpc_def_qtd)} | cobertura sobre estim. TEA: ${t.bpc_def_pct_estimado_tea != null ? t.bpc_def_pct_estimado_tea + "%" : "—"}
- Política pública local mapeada: lei CIPTEA: ${t.lei_ciptea ? "SIM (" + (t.lei_ciptea_numero || "") + ")" : "NÃO encontrada"} | fila zero: ${t.lei_fila_zero ? "SIM" : "NÃO"} | centro de referência TEA: ${t.centro_referencia_tea ? "SIM" : "NÃO"} | política de capacitação: ${t.politica_capacitacao ? "SIM" : "NÃO"}
${leisLinhas}
- Ranking estadual (entre os ${totalMun} municípios de MS):
${rkLine("população", rk.rank_populacao)}
${rkLine("estimativa TEA absoluta", rk.rank_tea_estimado)}
${rkLine("nº de CAPSi", rk.rank_capsi, "(quanto menor, melhor a cobertura)")}
${rkLine("habitantes por CAPS", rk.rank_habitantes_por_caps, "(1º = melhor cobertura)")}
${rkLine("cobertura escolar TEA", rk.rank_cobertura_escolar)}
${rkLine("cobertura BPC sobre TEA estimado", rk.rank_cobertura_bpc)}

USE estes números para amarrar a bandeira do candidato (autismo) à realidade local. Pelo menos 1 ataque e 1 discurso DEVEM mencionar concretamente: (a) ausência/sobrecarga de CAPSi, (b) gap escolar das crianças 6-14, (c) ausência de lei CIPTEA ou centro de referência, ou (d) invisibilidade dos adultos com TEA. Cite o ranking estadual quando ele for desfavorável (ex.: "estamos entre os piores de MS em X").

`;
    })();

    const userPrompt = votosBlock + teaBlock + buildUserPrompt(dossie, rankingMap, contextoWeb) + buildJsonOutputInstructions();

    let conteudos: any;
    try {
      const messages = [
        { role: "system" as const, content: buildSystemPrompt(perfil) },
        { role: "user" as const, content: userPrompt },
      ];

      if (llmConfig.provider === "groq") {
        // llama-3.1-8b-instant tem TPM baixo (6k) e estoura nesse prompt.
        // Usa modelo versátil maior (TPM bem mais alto) para a geração do dossiê.
        const groqCfg = {
          ...llmConfig,
          model: /8b|mixtral/i.test(llmConfig.model) ? "llama-3.3-70b-versatile" : llmConfig.model,
        };
        const aiText = await callLLM(groqCfg, { messages, maxTokens: 7000, temperature: 0.4 }, telemetryCtx);
        conteudos = normalizeConteudos(parseLooseJson(aiText.content));
      } else {
        const aiJson = await callLLMRaw(llmConfig, {
          messages,
          tools: [TOOL_SCHEMA],
          tool_choice: { type: "function", function: { name: "gerar_pacote_narrativa" } },
        }, telemetryCtx);
        const tcArgs = aiJson?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
        if (!tcArgs) throw new Error("IA não retornou tool_call estruturada");
        conteudos = normalizeConteudos(JSON.parse(tcArgs));
      }
    } catch (e: any) {
      const status = e?.status || 500;
      if (status === 429) {
        await supa.from("narrativa_dossies").update({ status: "erro", erro_msg: "Limite de requisições atingido. Tente novamente em alguns instantes." }).eq("id", dossie_id);
        return new Response(JSON.stringify({ error: "Limite de requisições da IA. Aguarde e tente de novo." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        await supa.from("narrativa_dossies").update({ status: "erro", erro_msg: "Créditos da IA esgotados." }).eq("id", dossie_id);
        return new Response(JSON.stringify({ error: "Créditos da IA esgotados. Adicione créditos no provedor configurado." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const msg = e?.message || "Erro IA";
      await supa.from("narrativa_dossies").update({ status: "erro", erro_msg: msg }).eq("id", dossie_id);
      throw e;
    }

    // Persiste enriquecimentos no dados_brutos para o PDF poder renderizar
    // sem depender do que a IA gerou.
    const dadosBrutos = { ...(dossie.dados_brutos || {}), votos_reais: votosReais, tea: teaMunicipio, tea_ranking: teaRanking, tea_leis: teaLeis };

    await supa
      .from("narrativa_dossies")
      .update({
        conteudos,
        dados_brutos: dadosBrutos,
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