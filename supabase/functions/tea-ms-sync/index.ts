// Edge function: sincroniza dados sobre TEA (autismo) por município de MS.
// Versão enriquecida:
// - Faixas etárias detalhadas (0-5, 6-14, 15-17, 18+) com estimativas TEA
// - Recorte por gênero (CDC 4:1 H:M)
// - CAPS detalhado por tipo (I, II, III, AD, CAPSi) + UBS + CER via CNES
// - Cache de fontes em tea_fonte_cache
// - Cobertura escolar e BPC permanecem NULL até integração específica

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Prevalências
const PREV_OMS = 0.01;
const PREV_CDC = 0.028;

// Distribuição etária Brasil (IBGE 2022) — fallback aplicado a pop municipal
const FRAC_0_5 = 0.070;
const FRAC_6_14 = 0.125;
const FRAC_15_17 = 0.042;
const FRAC_0_17 = FRAC_0_5 + FRAC_6_14 + FRAC_15_17; // ~0.237
const FRAC_18 = 1 - FRAC_0_17;

// Razão de prevalência H:M (CDC)
const RAZAO_HOMENS = 0.80;
const RAZAO_MULHERES = 0.20;

type CnesCounts = {
  caps_i: number; caps_ii: number; caps_iii: number; caps_ad: number; capsi: number;
  caps_total: number; cer: number; ubs: number;
};

function classifyEstabelecimento(desc: string): keyof CnesCounts | null {
  const u = desc.toUpperCase();
  if (u.includes("CAPS")) {
    if (u.includes("CAPSI") || u.includes("CAPS I.J") || u.includes("INFANTO") || u.includes("INFANTIL") || /CAPS\s*I\s*J/.test(u)) return "capsi";
    if (u.includes("AD III") || u.includes("AD3") || u.includes("ALCOOL") || u.includes("DROGAS") || / AD /.test(u) || u.endsWith(" AD")) return "caps_ad";
    if (u.includes("CAPS III") || /CAPS\s*III/.test(u)) return "caps_iii";
    if (u.includes("CAPS II") || /CAPS\s*II/.test(u)) return "caps_ii";
    if (u.includes("CAPS I") || /CAPS\s*I/.test(u)) return "caps_i";
    return "caps_i";
  }
  if (u.includes("CENTRO ESPECIALIZADO EM REABILIT") || u.includes("CER ")) return "cer";
  if (u.includes("UNIDADE BASICA") || u.includes("UNIDADE BÁSICA") || u.includes("UBS") || u.includes("ESF")) return "ubs";
  return null;
}

async function fetchCnesCounts(codigoIbge: number): Promise<CnesCounts> {
  const empty: CnesCounts = { caps_i: 0, caps_ii: 0, caps_iii: 0, caps_ad: 0, capsi: 0, caps_total: 0, cer: 0, ubs: 0 };
  try {
    const url = `https://apidadosabertos.saude.gov.br/cnes/estabelecimentos?codigo_municipio=${codigoIbge}&limit=2000`;
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return empty;
    const json = await res.json();
    const items: any[] = json?.estabelecimentos || json?.data || (Array.isArray(json) ? json : []);
    const out = { ...empty };
    for (const it of items) {
      const desc = String(
        it?.descricao_tipo_unidade ||
        it?.tipo_unidade_descricao ||
        it?.no_fantasia ||
        it?.nome_fantasia ||
        it?.descricao_subtipo_unidade ||
        ""
      );
      const k = classifyEstabelecimento(desc);
      if (!k) continue;
      out[k]++;
      if (k === "caps_i" || k === "caps_ii" || k === "caps_iii" || k === "caps_ad" || k === "capsi") out.caps_total++;
    }
    return out;
  } catch {
    return empty;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const t0 = Date.now();
  const erros: any[] = [];

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const uf = (body?.uf || "MS").toUpperCase();
    const fetchCaps: boolean = body?.fetchCaps !== false;
    const limit = Number(body?.limit || 0);

    let q = admin
      .from("municipios_indicadores")
      .select("codigo_ibge,nome,uf,populacao,populacao_ano")
      .eq("uf", uf)
      .order("populacao", { ascending: false, nullsFirst: false });
    if (limit > 0) q = q.limit(limit);
    const { data: munis, error: e1 } = await q;
    if (e1) throw e1;
    if (!munis || munis.length === 0) {
      throw new Error(`Nenhum município encontrado em municipios_indicadores para UF=${uf}.`);
    }

    let processados = 0;
    let capsColetados = 0;

    for (const m of munis) {
      const pop = Number(m.populacao || 0);

      // Faixas etárias estimadas
      const pop_0_5 = Math.round(pop * FRAC_0_5);
      const pop_6_14 = Math.round(pop * FRAC_6_14);
      const pop_15_17 = Math.round(pop * FRAC_15_17);
      const pop_0_17 = pop_0_5 + pop_6_14 + pop_15_17;
      const pop_18 = pop - pop_0_17;

      const est = (p: number, r: number) => Math.round(p * r);
      const est_min = est(pop, PREV_OMS);
      const est_max = est(pop, PREV_CDC);

      const row: any = {
        codigo_ibge: m.codigo_ibge,
        nome: m.nome,
        uf: m.uf,
        populacao: pop || null,
        populacao_ano: m.populacao_ano,

        // Totais
        est_tea_total_min: est_min,
        est_tea_total_max: est_max,
        est_tea_0_17_min: est(pop_0_17, PREV_OMS),
        est_tea_0_17_max: est(pop_0_17, PREV_CDC),

        // Faixas etárias detalhadas
        pop_0_5, pop_6_14, pop_15_17, pop_18_mais: pop_18,
        est_tea_0_5_min: est(pop_0_5, PREV_OMS),
        est_tea_0_5_max: est(pop_0_5, PREV_CDC),
        est_tea_6_14_min: est(pop_6_14, PREV_OMS),
        est_tea_6_14_max: est(pop_6_14, PREV_CDC),
        est_tea_15_17_min: est(pop_15_17, PREV_OMS),
        est_tea_15_17_max: est(pop_15_17, PREV_CDC),
        est_tea_adultos_min: est(pop_18, PREV_OMS),
        est_tea_adultos_max: est(pop_18, PREV_CDC),

        // Gênero (aplicado sobre est_total)
        est_tea_homens_min: Math.round(est_min * RAZAO_HOMENS),
        est_tea_homens_max: Math.round(est_max * RAZAO_HOMENS),
        est_tea_mulheres_min: Math.round(est_min * RAZAO_MULHERES),
        est_tea_mulheres_max: Math.round(est_max * RAZAO_MULHERES),
      };

      // CAPS detalhado via CNES
      if (fetchCaps && m.codigo_ibge) {
        const c = await fetchCnesCounts(Number(m.codigo_ibge));
        capsColetados += c.caps_total;
        Object.assign(row, {
          caps_i_qtd: c.caps_i,
          caps_ii_qtd: c.caps_ii,
          caps_iii_qtd: c.caps_iii,
          caps_ad_qtd: c.caps_ad,
          capsi_qtd: c.capsi,
          caps_qtd: c.caps_total,
          cer_qtd: c.cer,
          ubs_qtd: c.ubs,
          hab_por_caps: c.caps_total > 0 ? Math.round((pop / c.caps_total) * 100) / 100 : null,
          // Tempo médio diagnóstico estimado (proxy heurístico)
          tempo_diag_estimado_meses: c.capsi > 0 ? 12 : c.caps_total > 0 ? 24 : 36,
        });

        // Cache da resposta CNES
        await admin.from("tea_fonte_cache").upsert({
          codigo_ibge: m.codigo_ibge,
          fonte: "cnes",
          payload: c as any,
        }, { onConflict: "codigo_ibge,fonte" });
      }

      // Gap escolar (sem matrícula real ainda → usa estimativa 6-14 como proxy)
      row.gap_escolar_min = row.est_tea_6_14_min;
      row.gap_escolar_max = row.est_tea_6_14_max;
      // Mantém compat: gap_escolar_real fica null até INEP entrar
      row.gap_escolar_real_min = null;
      row.gap_escolar_real_max = null;

      row.fonte_json = {
        prevalencia: { oms: PREV_OMS, cdc: PREV_CDC },
        fracs_etarias: { f0_5: FRAC_0_5, f6_14: FRAC_6_14, f15_17: FRAC_15_17 },
        razao_genero: { h: RAZAO_HOMENS, m: RAZAO_MULHERES },
        populacao_fonte: "IBGE",
        caps_fonte: fetchCaps ? "CNES/OpenDataSUS" : "não coletado",
        coletado_em: new Date().toISOString(),
        nota: "Matrículas INEP, BPC e legislação coletados em jobs separados",
      };
      row.atualizado_em = new Date().toISOString();

      const { error: eUp } = await admin
        .from("tea_municipios_ms")
        .upsert(row, { onConflict: "codigo_ibge" });
      if (eUp) erros.push({ municipio: m.nome, erro: eUp.message });
      else processados++;
    }

    const status = erros.length === 0 ? "success" : (processados > 0 ? "partial" : "error");
    await admin.from("tea_sync_log").insert({
      uf,
      status,
      municipios_processados: processados,
      caps_coletados: capsColetados,
      erros,
      duracao_ms: Date.now() - t0,
    });

    return new Response(
      JSON.stringify({
        status,
        municipios_processados: processados,
        caps_coletados: capsColetados,
        erros: erros.slice(0, 5),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[tea-ms-sync] erro:", err?.message);
    return new Response(
      JSON.stringify({ error: err?.message || "Erro desconhecido", erros }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
