import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * narrativa-analise
 * Lê o `dados_brutos` de um dossiê e calcula:
 *  - pain_score por área (saúde, educação, segurança, infra) — 0..100
 *  - classificação de cada dor (Explosiva / Latente / Silenciosa)
 *  - oportunidade política (Pain x força do gestor)
 *  - bairros inferidos (a partir de zonas TSE — placeholder até onda 2)
 *
 * Esta primeira versão usa heurísticas determinísticas em cima dos dados
 * brutos (sem LLM ainda). O `narrativa-gerar` é quem chama a IA depois.
 *
 * Body: { dossie_id }
 */

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SUPA_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function classifyPain(score: number): "explosiva" | "latente" | "silenciosa" {
  if (score >= 70) return "explosiva";
  if (score >= 40) return "latente";
  return "silenciosa";
}

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Mapa de Dor REAL — baseado em desvio numérico vs média estadual.
 *
 * Para cada indicador relevante (saúde, educação, infra, economia, social):
 *  1) compara o valor da cidade com a média estadual
 *  2) calcula um delta percentual (positivo = pior que o estado)
 *  3) usa esse delta + menções na mídia como score 0..100
 *
 * O score vira um pain_score por área. As áreas são depois agregadas
 * em "Saúde", "Educação", "Infraestrutura", "Economia", "Social".
 */
const AREA_INDICADORES: Record<string, { id: number; peso: number; titulo: string }[]> = {
  saude: [
    { id: 30279, peso: 1.0, titulo: "Mortalidade infantil" },
    { id: 60022, peso: 0.6, titulo: "Mortalidade infantil (DataSUS)" },
  ],
  educacao: [
    { id: 60041, peso: 1.0, titulo: "IDEB anos iniciais" },
    { id: 60042, peso: 1.0, titulo: "IDEB anos finais" },
    { id: 60045, peso: 0.6, titulo: "Escolarização 6-14 anos" },
  ],
  infra: [
    { id: 60030, peso: 1.0, titulo: "Esgoto adequado" },
    { id: 60031, peso: 0.5, titulo: "Urbanização das vias" },
    { id: 60029, peso: 0.3, titulo: "Arborização" },
    { id: 60037, peso: 0.8, titulo: "Água canalizada" },
  ],
  economia: [
    { id: 60038, peso: 1.0, titulo: "Salário médio mensal" },
    { id: 60047, peso: 0.7, titulo: "PIB per capita" },
    { id: 60048, peso: 1.0, titulo: "Dependência de transferências federais" },
    { id: 60036, peso: 0.5, titulo: "População ocupada" },
  ],
  social: [
    { id: 30246, peso: 1.0, titulo: "Pobreza" },
    { id: 30252, peso: 0.7, titulo: "Desigualdade (Gini)" },
    { id: 30255, peso: 0.8, titulo: "IDH-M" },
    { id: 30277, peso: 0.9, titulo: "Pessoas com renda <½ SM" },
  ],
};

function pctDeviation(cidade: number, estado: number, higherIsWorse: boolean): number {
  if (!Number.isFinite(estado) || estado === 0) return 0;
  const raw = ((cidade - estado) / Math.abs(estado)) * 100;
  // higher_is_worse=true: cidade > estado => pior (delta positivo)
  // higher_is_worse=false: cidade < estado => pior (invertemos)
  return higherIsWorse ? raw : -raw;
}

function calcularDores(dadosBrutos: any) {
  const artigos = dadosBrutos?.midia_gdelt?.artigos || [];
  const tomMedio = dadosBrutos?.midia_gdelt?.tom_medio ?? 0;
  const indicadores = dadosBrutos?.ibge?.indicadores || {};
  const indicadoresEstado = dadosBrutos?.ibge?.indicadores_estado || {};

  // Conta menções por área (sinal complementar da mídia)
  const titulos = artigos.map((a: any) => (a.titulo || "").toLowerCase()).join(" | ");
  const kw: Record<string, string[]> = {
    saude: ["saúde", "ubs", "hospital", "vacina", "fila", "remédio", "ambulância", "posto", "sus"],
    educacao: ["escola", "educação", "aluno", "professor", "creche", "ensino", "ideb", "merenda"],
    infra: ["buraco", "asfalto", "rua", "esgoto", "água", "iluminação", "transporte", "ônibus", "saneamento", "obra"],
    economia: ["desemprego", "emprego", "crise", "fechou", "comércio", "imposto", "salário", "renda"],
    social: ["pobreza", "fome", "miséria", "desigualdade", "vulnerável", "auxílio"],
  };
  const mencoes: Record<string, number> = {};
  for (const [area, words] of Object.entries(kw)) {
    let n = 0;
    for (const w of words) {
      const re = new RegExp(`\\b${w}`, "gi");
      const m = titulos.match(re);
      if (m) n += m.length;
    }
    mencoes[area] = n;
  }

  const negBoost = tomMedio < -3 ? 15 : tomMedio < -1 ? 7 : 0;

  const dores = Object.entries(AREA_INDICADORES).map(([area, lista]) => {
    let scoreSomado = 0;
    let pesoTotal = 0;
    const evidencias: any[] = [];

    for (const { id, peso, titulo } of lista) {
      const cidade = indicadores[String(id)];
      const estado = indicadoresEstado[String(id)];
      if (!cidade || !Number.isFinite(cidade.valor)) continue;

      let painLocal = 50; // baseline neutro quando não há comparação
      let deltaPct: number | null = null;
      let estadoVal: number | null = null;

      if (estado && Number.isFinite(estado.valor)) {
        estadoVal = estado.valor;
        deltaPct = pctDeviation(cidade.valor, estado.valor, cidade.higher_is_worse);
        // Mapeia delta (-50% a +100%) para score 10..100
        // delta 0 => 50; delta +20% => 70; delta +50% => 95
        painLocal = clamp(50 + deltaPct * 1.0);
      } else {
        // Sem média estadual — usa thresholds absolutos para alguns indicadores
        if (id === 30279 || id === 60022) painLocal = clamp(20 + cidade.valor * 3);   // mort. infantil
        if (id === 60030) painLocal = clamp(100 - cidade.valor);                      // esgoto
        if (id === 60041 || id === 60042) painLocal = clamp(100 - cidade.valor * 10); // IDEB
        if (id === 30246) painLocal = clamp(20 + cidade.valor * 1.2);                 // pobreza
        if (id === 60048) painLocal = clamp(cidade.valor);                            // % transferências
      }

      scoreSomado += painLocal * peso;
      pesoTotal += peso;
      evidencias.push({
        indicador_id: id,
        titulo,
        valor_cidade: cidade.valor,
        ano: cidade.ano,
        unidade: cidade.unidade,
        fonte: cidade.fonte,
        valor_estado: estadoVal,
        delta_pct: deltaPct,
        pain_local: Math.round(painLocal),
        outdated: (cidade as any).outdated === true,
        idade_anos: (cidade as any).idade_anos ?? null,
      });
    }

    const baseScore = pesoTotal > 0 ? Math.round(scoreSomado / pesoTotal) : 30;
    const score = clamp(baseScore + (mencoes[area] || 0) * 4 + negBoost);

    return {
      area,
      pain_score: score,
      classificacao: classifyPain(score),
      mencoes_midia: mencoes[area] || 0,
      evidencias,
      tem_dados: evidencias.length > 0,
    };
  });

  // Ordena por dor decrescente, mas prioriza dores com evidência real
  dores.sort((a, b) => {
    if (a.tem_dados !== b.tem_dados) return a.tem_dados ? -1 : 1;
    return b.pain_score - a.pain_score;
  });

  return { dores, tom_medio_midia: tomMedio };
}

function calcularOportunidade(dores: any[], dadosBrutos: any) {
  // Identifica a "força" do CANDIDATO DE REFERÊNCIA (escolhido pelo usuário, ou
  // o vencedor de Prefeito 2024 como fallback). Usado para medir oportunidade.
  const tse = dadosBrutos?.tse_local;
  let forca_gestor: number | null = null;
  if (tse && !tse.vazio) {
    const ref = tse.candidato_referencia || null;
    const refAno = ref?.ano || 2024;
    const refCargoRegex = ref?.cargo
      ? new RegExp(`^${String(ref.cargo).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i")
      : /prefeito/i;
    const norm = (s: any) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const refNomeNorm = norm(ref?.nome);

    const bloco = (tse.top_por_cargo_ano || []).find(
      (b: any) => b.ano === refAno && refCargoRegex.test(b.cargo),
    );
    if (bloco && bloco.top.length > 0) {
      const total = bloco.top.reduce((s: number, c: any) => s + c.votos, 0);
      // Prefere encontrar o candidato escolhido na lista; se não achar (votação muito
      // diluída em vereador, p.ex.), cai no top1 como antes.
      const alvo = (refNomeNorm && bloco.top.find((c: any) => norm(c.nome) === refNomeNorm)) || bloco.top[0];
      forca_gestor = total > 0 ? Math.round((alvo.votos / total) * 100) : null;
    }
  }

  // Maior oportunidade = dor alta + gestor fraco
  const dorMax = dores[0]?.pain_score ?? 0;
  const gestorScore = forca_gestor ?? 50;
  const oportunidade_score = clamp(Math.round(dorMax * 0.7 + (100 - gestorScore) * 0.3));
  let nivel: "alta" | "media" | "baixa" = "media";
  if (oportunidade_score >= 70) nivel = "alta";
  else if (oportunidade_score < 40) nivel = "baixa";

  return {
    oportunidade_score,
    nivel,
    forca_gestor_atual: forca_gestor,
    dor_principal: dores[0]?.area ?? null,
  };
}

/**
 * Top 10 LOCAIS CRÍTICOS = locais reais (escolas/UBS/etc) nas zonas onde
 * o prefeito atual teve PIOR desempenho em 2024. Esses são os pontos de
 * maior oportunidade política para visita/campanha.
 */
function topLocaisCriticos(dadosBrutos: any) {
  const tse = dadosBrutos?.tse_local;
  if (!tse || tse.vazio) return [];
  const locais: any[] = tse.locais_criticos || [];
  if (locais.length === 0) return [];

  // Rótulo do candidato a usar nas mensagens (ex.: "João da Silva")
  const refNome = tse.candidato_referencia?.nome
    || tse.eleito_prefeito_2024
    || "candidato escolhido";

  // Agrupa por bairro (quando existe) — pega o local "âncora" por bairro
  const porBairro = new Map<string, any>();
  const semBairro: any[] = [];
  for (const l of locais) {
    const key = (l.bairro || "").trim();
    if (!key) {
      semBairro.push(l);
      continue;
    }
    const cur = porBairro.get(key);
    if (!cur || (l.pct_eleito_zona ?? 100) < (cur.pct_eleito_zona ?? 100)) {
      porBairro.set(key, l);
    }
  }

  const ranked = [
    ...Array.from(porBairro.values()),
    ...semBairro.slice(0, 4),
  ]
    .sort((a, b) => (a.pct_eleito_zona ?? 100) - (b.pct_eleito_zona ?? 100))
    .slice(0, 10)
    .map((l, i) => ({
      rank: i + 1,
      bairro: l.bairro || "(bairro desconhecido)",
      zona: l.zona,
      nome_local: l.nome_local,
      endereco: l.endereco,
      pct_eleito_zona: l.pct_eleito_zona,
      motivo: l.pct_eleito_zona != null
        ? `${refNome} teve ${l.pct_eleito_zona}% dos votos nesta zona`
        : `Zona sem dado consolidado de desempenho de ${refNome}`,
    }));

  return ranked;
}

/**
 * Bairros inferidos = lista única de bairros distintos dos top locais críticos.
 * Usa SOMENTE bairros que vieram dos endereços TSE reais (sem inventar).
 */
function inferirBairros(dadosBrutos: any, topLocais: any[]) {
  const set = new Set<string>();
  for (const l of topLocais || []) {
    if (l.bairro && l.bairro !== "(bairro desconhecido)") set.add(l.bairro);
  }
  return Array.from(set).slice(0, 8);
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

    const { data: dossie, error: getErr } = await supa
      .from("narrativa_dossies")
      .select("*")
      .eq("id", dossie_id)
      .maybeSingle();
    if (getErr || !dossie) throw new Error("Dossiê não encontrado");

    await supa.from("narrativa_dossies").update({ status: "analisando" }).eq("id", dossie_id);

    const { dores, tom_medio_midia } = calcularDores(dossie.dados_brutos);
    const oportunidade = calcularOportunidade(dores, dossie.dados_brutos);
    const top_locais_criticos = topLocaisCriticos(dossie.dados_brutos);
    const bairros_inferidos = inferirBairros(dossie.dados_brutos, top_locais_criticos);

    const analise = {
      dores,
      mapa_dor: dores.reduce((acc: any, d) => { acc[d.area] = d; return acc; }, {}),
      oportunidade,
      tom_medio_midia,
      bairros_inferidos,
      top_locais_criticos,
      gerado_em: new Date().toISOString(),
    };

    await supa
      .from("narrativa_dossies")
      .update({
        analise,
        status: "analisado",
        analyzed_at: new Date().toISOString(),
      })
      .eq("id", dossie_id);

    return new Response(JSON.stringify({ dossie_id, analise }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "erro desconhecido";
    console.error("narrativa-analise error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});