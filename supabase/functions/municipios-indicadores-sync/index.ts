// Edge Function: municipios-indicadores-sync
// Coleta TODOS os 20 indicadores do Painel IBGE Cidades para cada município.
// Mesma fonte usada pelo narrativa-coleta — uma única fonte de verdade.
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_RUNTIME_MS = 55_000;

type IndicadorMeta = {
  id: number;
  label: string;
  area: "saude" | "educacao" | "infra" | "economia" | "social" | "demografia";
  unidade: string;
  higher_is_worse: boolean;
  fonte_orgao: string;
};

const INDICADORES: IndicadorMeta[] = [
  { id: 29167, label: "Área territorial",        area: "demografia", unidade: "km²",                        higher_is_worse: false, fonte_orgao: "IBGE" },
  { id: 29168, label: "Densidade demográfica",   area: "demografia", unidade: "hab/km²",                    higher_is_worse: false, fonte_orgao: "IBGE Censo" },
  { id: 29171, label: "População estimada",      area: "demografia", unidade: "pessoas",                    higher_is_worse: false, fonte_orgao: "IBGE" },
  { id: 30255, label: "IDH-M",                   area: "social",     unidade: "índice 0-1",                 higher_is_worse: false, fonte_orgao: "Atlas Brasil" },
  { id: 30246, label: "Incidência da pobreza",   area: "social",     unidade: "%",                          higher_is_worse: true,  fonte_orgao: "IBGE" },
  { id: 30252, label: "Índice de Gini",          area: "social",     unidade: "índice 0-1",                 higher_is_worse: true,  fonte_orgao: "IBGE" },
  { id: 30279, label: "Mortalidade infantil",    area: "saude",      unidade: "óbitos/1000 nasc.",          higher_is_worse: true,  fonte_orgao: "DataSUS/IBGE" },
  { id: 60022, label: "Mortalidade infantil 2",  area: "saude",      unidade: "óbitos/1000 nasc.",          higher_is_worse: true,  fonte_orgao: "DataSUS" },
  { id: 60030, label: "Esgoto adequado",         area: "infra",      unidade: "%",                          higher_is_worse: false, fonte_orgao: "IBGE Censo" },
  { id: 60029, label: "Arborização vias",        area: "infra",      unidade: "%",                          higher_is_worse: false, fonte_orgao: "IBGE Censo" },
  { id: 60031, label: "Urbanização vias",        area: "infra",      unidade: "%",                          higher_is_worse: false, fonte_orgao: "IBGE Censo" },
  { id: 60041, label: "IDEB anos iniciais",      area: "educacao",   unidade: "índice 0-10",                higher_is_worse: false, fonte_orgao: "INEP" },
  { id: 60042, label: "IDEB anos finais",        area: "educacao",   unidade: "índice 0-10",                higher_is_worse: false, fonte_orgao: "INEP" },
  { id: 60045, label: "Escolarização 6-14 anos", area: "educacao",   unidade: "%",                          higher_is_worse: false, fonte_orgao: "IBGE Censo" },
  { id: 60038, label: "Salário médio mensal",    area: "economia",   unidade: "salários mínimos",           higher_is_worse: false, fonte_orgao: "IBGE" },
  { id: 60036, label: "População ocupada",       area: "economia",   unidade: "%",                          higher_is_worse: false, fonte_orgao: "IBGE" },
  { id: 60047, label: "PIB per capita",          area: "economia",   unidade: "R$",                         higher_is_worse: false, fonte_orgao: "IBGE" },
  { id: 60048, label: "% receita transferências federais", area: "economia", unidade: "%",                  higher_is_worse: true,  fonte_orgao: "Tesouro Nacional" },
  { id: 60037, label: "Água canalizada",         area: "infra",      unidade: "%",                          higher_is_worse: false, fonte_orgao: "IBGE Censo" },
  { id: 30277, label: "Pessoas pobres (renda <½ SM)", area: "social", unidade: "%",                        higher_is_worse: true,  fonte_orgao: "Atlas/IPEA" },
];

// IDs adicionais derivados de Atlas Brasil, INEP, DATASUS, SNIS via Painel IBGE Cidades.
// Comentados quando o Painel não expõe — fica como documentação de roadmap.
const INDICADORES_EXTRA: IndicadorMeta[] = [
  // Atlas Brasil (PNUD) — dimensões do IDH-M
  { id: 30256, label: "IDH-M Renda",             area: "social",   unidade: "índice 0-1", higher_is_worse: false, fonte_orgao: "Atlas Brasil" },
  { id: 30257, label: "IDH-M Longevidade",       area: "saude",    unidade: "índice 0-1", higher_is_worse: false, fonte_orgao: "Atlas Brasil" },
  { id: 30258, label: "IDH-M Educação",          area: "educacao", unidade: "índice 0-1", higher_is_worse: false, fonte_orgao: "Atlas Brasil" },
  { id: 30270, label: "Renda per capita",        area: "economia", unidade: "R$",         higher_is_worse: false, fonte_orgao: "Atlas Brasil" },
  { id: 30276, label: "Expectativa de vida",     area: "saude",    unidade: "anos",       higher_is_worse: false, fonte_orgao: "Atlas Brasil" },
  { id: 30278, label: "Crianças extremamente pobres", area: "social", unidade: "%",       higher_is_worse: true,  fonte_orgao: "Atlas Brasil" },
  // INEP / Censo Escolar
  { id: 60040, label: "Matrículas ensino fundamental", area: "educacao", unidade: "alunos", higher_is_worse: false, fonte_orgao: "INEP Censo Escolar" },
  { id: 60043, label: "Docentes ensino fundamental",   area: "educacao", unidade: "professores", higher_is_worse: false, fonte_orgao: "INEP Censo Escolar" },
  { id: 60044, label: "Escolas ensino fundamental",    area: "educacao", unidade: "escolas",     higher_is_worse: false, fonte_orgao: "INEP Censo Escolar" },
  // DATASUS / Ministério da Saúde
  { id: 60028, label: "Estabelecimentos de saúde SUS", area: "saude", unidade: "estabelecimentos", higher_is_worse: false, fonte_orgao: "DATASUS CNES" },
  // Vínculo: território/economia adicional
  { id: 60046, label: "Bioma predominante",      area: "demografia", unidade: "",          higher_is_worse: false, fonte_orgao: "IBGE" },
];

const INDICADORES_TODOS = [...INDICADORES, ...INDICADORES_EXTRA];
const INDICADORES_BY_ID = new Map(INDICADORES_TODOS.map((i) => [i.id, i]));
const IND_IDS = INDICADORES_TODOS.map((i) => i.id).join("|");

async function safeFetchJson(url: string, timeoutMs = 12000): Promise<any> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: ctl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function getMunicipioBasico(codigoIbge: number): Promise<{ nome: string; uf: string } | null> {
  const data = await safeFetchJson(`https://servicodados.ibge.gov.br/api/v1/localidades/municipios/${codigoIbge}`);
  if (!data) return null;
  return {
    nome: data.nome,
    uf: data.microrregiao?.mesorregiao?.UF?.sigla ?? "",
  };
}

/**
 * Busca todos os indicadores do Painel IBGE Cidades de uma vez para um município.
 * Retorna um map { id_indicador: { valor, ano, label, ..., outdated, idade_anos } }.
 */
async function fetchPainelIndicadores(codigoIbge: number) {
  const url = `https://servicodados.ibge.gov.br/api/v1/pesquisas/indicadores/${IND_IDS}/resultados/${codigoIbge}`;
  const json: any = await safeFetchJson(url, 15000);
  if (!Array.isArray(json)) return { map: {}, count: 0 };

  const out: Record<string, any> = {};
  const anoAtual = new Date().getFullYear();
  let count = 0;

  for (const meta of INDICADORES_TODOS) {
    const found = json.find((x: any) => Number(x?.id) === meta.id);
    if (!found) continue;
    const res = found.res?.[0]?.res || {};
    const entries = Object.entries(res)
      .map(([ano, v]: [string, any]) => ({ ano: Number(ano), v: typeof v === "string" && v !== "-" ? Number(v) : (v as number) }))
      .filter((e) => Number.isFinite(e.v) && !Number.isNaN(e.v))
      .sort((a, b) => b.ano - a.ano);
    if (!entries.length) continue;
    const anoMaisRecente = entries[0].ano;
    const idade = anoAtual - anoMaisRecente;
    // Tendência: compara último vs anterior se houver série
    const tendencia = entries.length >= 2
      ? {
          valor_anterior: entries[1].v,
          ano_anterior: entries[1].ano,
          delta: entries[0].v - entries[1].v,
          delta_pct: entries[1].v !== 0
            ? ((entries[0].v - entries[1].v) / Math.abs(entries[1].v)) * 100
            : null,
        }
      : null;
    out[String(meta.id)] = {
      id: meta.id,
      label: meta.label,
      area: meta.area,
      unidade: meta.unidade,
      fonte: `${meta.fonte_orgao} ${anoMaisRecente}`,
      fonte_orgao: meta.fonte_orgao,
      ano: anoMaisRecente,
      valor: entries[0].v,
      higher_is_worse: meta.higher_is_worse,
      outdated: idade > 3,
      idade_anos: idade,
      tendencia,
    };
    count++;
  }
  return { map: out, count };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const startedAt = Date.now();
  const timeLeft = () => MAX_RUNTIME_MS - (Date.now() - startedAt);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const { codigos_ibge, uf } = body as { codigos_ibge?: number[]; uf?: string };

    let alvos: number[] = [];
    if (codigos_ibge?.length) {
      alvos = codigos_ibge;
    } else if (uf) {
      const data2 = await safeFetchJson(
        `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf.toUpperCase()}/municipios`,
      );
      alvos = (data2 || []).map((m: any) => m.id);
    } else {
      return new Response(JSON.stringify({ error: "informe codigos_ibge[] ou uf" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processados = 0;
    let totalIndicadores = 0;
    const erros: string[] = [];
    const t0 = Date.now();

    for (const codigo of alvos) {
      if (timeLeft() < 5000) {
        erros.push(`timeout após ${processados} municípios — rode novamente para continuar`);
        break;
      }
      try {
        const basico = await getMunicipioBasico(codigo);
        if (!basico) continue;
        const painel = await fetchPainelIndicadores(codigo);

        // Extrai campos legados (top-level) a partir do JSONB
        const popVal = painel.map["29171"]?.valor ?? null;
        const popAno = painel.map["29171"]?.ano ?? null;
        const pibPc = painel.map["60047"]?.valor ?? null;
        const pibAno = painel.map["60047"]?.ano ?? null;
        const idhVal = painel.map["30255"]?.valor ?? null;
        const idhAno = painel.map["30255"]?.ano ?? null;
        const mortInf = painel.map["30279"]?.valor ?? painel.map["60022"]?.valor ?? null;
        const idebIni = painel.map["60041"]?.valor ?? null;
        const idebFin = painel.map["60042"]?.valor ?? null;
        const idebAno = painel.map["60041"]?.ano ?? painel.map["60042"]?.ano ?? null;

        const row: any = {
          codigo_ibge: codigo,
          nome: basico.nome,
          uf: basico.uf,
          populacao: popVal != null ? Math.round(popVal) : null,
          populacao_ano: popAno,
          pib_per_capita: pibPc,
          pib_ano: pibAno,
          idh: idhVal,
          idh_ano: idhAno,
          mortalidade_infantil: mortInf,
          ideb_anos_iniciais: idebIni,
          ideb_anos_finais: idebFin,
          ideb_ano: idebAno,
          indicadores: painel.map,
          ultima_atualizacao: new Date().toISOString(),
        };

        const { error } = await supabase
          .from("municipios_indicadores")
          .upsert(row, { onConflict: "codigo_ibge" });
        if (error) throw error;
        processados++;
        totalIndicadores += painel.count;
      } catch (e) {
        erros.push(`${codigo}: ${e instanceof Error ? e.message : e}`);
      }
    }

    await supabase.from("municipios_sync_log").insert({
      fonte: "ibge_painel",
      municipios_processados: processados,
      status: erros.length > 0 ? (processados > 0 ? "partial" : "error") : "success",
      erro_mensagem: erros.length > 0 ? erros.slice(0, 5).join(" | ") : null,
      duracao_ms: Date.now() - t0,
    });

    return new Response(JSON.stringify({
      ok: true,
      processados,
      total_alvos: alvos.length,
      indicadores_coletados: totalIndicadores,
      media_indicadores_por_municipio: processados > 0 ? Math.round(totalIndicadores / processados) : 0,
      erros: erros.slice(0, 10),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("municipios-indicadores-sync error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
