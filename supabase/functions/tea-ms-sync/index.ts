// Edge function: sincroniza dados sobre TEA (autismo) por município de MS.
// - Lê população dos municípios MS na tabela municipios_indicadores (já populada via IBGE).
// - Calcula faixa de estimativa TEA (OMS 1% e CDC 2,8%).
// - Estima população 0–17 (~26% da total — média IBGE Brasil) e aplica preval.
// - Tenta puxar contagem de CAPS via CNES OpenDataSUS por município (best-effort).
// - Faz upsert em tea_municipios_ms e grava log em tea_sync_log.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PREV_OMS = 0.01;
const PREV_CDC = 0.028;
const FRAC_0_17 = 0.26; // proporção média Brasil (IBGE) de 0–17 anos

type CapsCount = { caps: number; capsi: number };

async function fetchCapsForMunicipio(codigoIbge: number): Promise<CapsCount> {
  // CNES tem dataset público: https://apidadosabertos.saude.gov.br/cnes/estabelecimentos
  // Tipos CAPS estão em "tipo_unidade_id" 70, mas o campo varia. Vamos filtrar por descricao.
  // Best-effort: se a API falhar, retorna 0.
  try {
    const url = `https://apidadosabertos.saude.gov.br/cnes/estabelecimentos?codigo_municipio=${codigoIbge}&limit=200`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return { caps: 0, capsi: 0 };
    const json = await res.json();
    const items: any[] = json?.estabelecimentos || json?.data || json || [];
    let caps = 0, capsi = 0;
    for (const it of items) {
      const desc = String(it?.descricao_tipo_unidade || it?.tipo_unidade_descricao || it?.no_fantasia || "").toUpperCase();
      if (desc.includes("CAPS")) {
        caps++;
        if (desc.includes("CAPSI") || desc.includes("INFANTO") || desc.includes("INFANTIL")) capsi++;
      }
    }
    return { caps, capsi };
  } catch {
    return { caps: 0, capsi: 0 };
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
    const fetchCaps: boolean = body?.fetchCaps !== false; // default true
    const limit = Number(body?.limit || 0); // 0 = todos

    // 1) Pega população dos municípios da UF
    let q = admin
      .from("municipios_indicadores")
      .select("codigo_ibge,nome,uf,populacao,populacao_ano")
      .eq("uf", uf)
      .order("populacao", { ascending: false, nullsFirst: false });
    if (limit > 0) q = q.limit(limit);
    const { data: munis, error: e1 } = await q;
    if (e1) throw e1;
    if (!munis || munis.length === 0) {
      throw new Error(`Nenhum município encontrado em municipios_indicadores para UF=${uf}. Rode antes a coleta IBGE no Contexto Territorial.`);
    }

    let processados = 0;
    let capsColetados = 0;

    for (const m of munis) {
      const pop = Number(m.populacao || 0);
      const pop017 = Math.round(pop * FRAC_0_17);
      const est_min = Math.round(pop * PREV_OMS);
      const est_max = Math.round(pop * PREV_CDC);
      const est_017_min = Math.round(pop017 * PREV_OMS);
      const est_017_max = Math.round(pop017 * PREV_CDC);

      let capsCount: CapsCount = { caps: 0, capsi: 0 };
      if (fetchCaps && m.codigo_ibge) {
        capsCount = await fetchCapsForMunicipio(Number(m.codigo_ibge));
        capsColetados += capsCount.caps;
      }

      const habPorCaps = capsCount.caps > 0 ? Math.round((pop / capsCount.caps) * 100) / 100 : null;

      const row = {
        codigo_ibge: m.codigo_ibge,
        nome: m.nome,
        uf: m.uf,
        populacao: pop || null,
        populacao_ano: m.populacao_ano,
        est_tea_total_min: est_min,
        est_tea_total_max: est_max,
        est_tea_0_17_min: est_017_min,
        est_tea_0_17_max: est_017_max,
        capsi_qtd: capsCount.capsi,
        caps_qtd: capsCount.caps,
        gap_escolar_min: est_017_min, // sem matrícula INEP, gap = estimativa total
        gap_escolar_max: est_017_max,
        hab_por_caps: habPorCaps,
        fonte_json: {
          prevalencia: { oms: PREV_OMS, cdc: PREV_CDC },
          frac_0_17: FRAC_0_17,
          populacao_fonte: "IBGE",
          caps_fonte: fetchCaps ? "CNES/OpenDataSUS" : "não coletado",
          coletado_em: new Date().toISOString(),
        },
        atualizado_em: new Date().toISOString(),
      };

      const { error: eUp } = await admin
        .from("tea_municipios_ms")
        .upsert(row, { onConflict: "codigo_ibge" });
      if (eUp) {
        erros.push({ municipio: m.nome, erro: eUp.message });
      } else {
        processados++;
      }
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
