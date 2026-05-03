import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * ibge-municipio-fetch
 * Busca dados socioeconômicos de um município brasileiro via APIs públicas do IBGE (sem chave).
 *
 * Combina:
 *  - IBGE Localidades v1 → /municipios/{id}  (nome, microrregião, mesorregião, UF, região)
 *  - IBGE Localidades v1 → /municipios/{id}/distritos (qtd de distritos)
 *  - IBGE Servicodados Malhas v3 → área territorial (quando disponível)
 *  - IBGE Agregados (SIDRA) → estimativa populacional mais recente disponível
 *
 * Cache: public.api_cache, TTL de 90 dias (dados anuais/quinquenais).
 * Endpoint:
 *   GET ?codigo=5002704                       (código IBGE de 7 dígitos)
 *   GET ?nome=Campo Grande&uf=MS              (resolve via IBGE Localidades)
 * Retorno: { data: { codigo, nome, uf, regiao, microrregiao, mesorregiao, populacao, ano_populacao,
 *                    area_km2, densidade, gentilico? }, cached, source }
 */

const TTL_DAYS = 90;
const SOURCE = "ibge";

type Municipio = {
  codigo: number;
  nome: string;
  uf: string;
  uf_nome: string;
  regiao: string;
  microrregiao: string | null;
  mesorregiao: string | null;
  populacao: number | null;
  ano_populacao: number | null;
  area_km2: number | null;
  densidade: number | null;
  capital: boolean;
};

function cacheKey(codigo: number) {
  return `ibge:municipio:${codigo}`;
}

function nameKey(nome: string, uf: string) {
  return `ibge:lookup:${uf.toUpperCase()}:${nome.toLowerCase().trim()}`;
}

function normalize(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

async function resolveCodigoByName(nome: string, uf: string): Promise<number | null> {
  const url = `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf.toUpperCase()}/municipios`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  const list = await res.json();
  if (!Array.isArray(list)) return null;
  const target = normalize(nome);
  const hit = list.find((m: any) => normalize(m.nome) === target);
  return hit?.id ? Number(hit.id) : null;
}

async function fetchMunicipioBase(codigo: number) {
  const url = `https://servicodados.ibge.gov.br/api/v1/localidades/municipios/${codigo}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`IBGE Localidades retornou ${res.status} para municipio ${codigo}`);
  const m = await res.json();
  if (!m || !m.id) throw new Error(`Município ${codigo} não encontrado no IBGE`);

  const microrregiao = m.microrregiao?.nome ?? null;
  const mesorregiao = m.microrregiao?.mesorregiao?.nome ?? null;
  const uf = m.microrregiao?.mesorregiao?.UF?.sigla ?? "";
  const ufNome = m.microrregiao?.mesorregiao?.UF?.nome ?? "";
  const regiao = m.microrregiao?.mesorregiao?.UF?.regiao?.nome ?? "";

  return {
    codigo: m.id as number,
    nome: m.nome as string,
    uf,
    uf_nome: ufNome,
    regiao,
    microrregiao,
    mesorregiao,
  };
}

/**
 * População estimada — usamos SIDRA agregado 6579 (Estimativas da População).
 * Fallback: agregado 793 (Censo 2022) se a estimativa não retornar.
 */
async function fetchPopulacao(codigo: number): Promise<{ populacao: number | null; ano: number | null }> {
  // Tenta estimativa mais recente (variável 9324, períodos = "all" para pegar mais recente)
  const tryFetch = async (agregado: number, variavel: number) => {
    const url = `https://servicodados.ibge.gov.br/api/v3/agregados/${agregado}/periodos/all/variaveis/${variavel}?localidades=N6[${codigo}]`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const json = await res.json();
    const series = json?.[0]?.resultados?.[0]?.series?.[0]?.serie;
    if (!series || typeof series !== "object") return null;
    const entries = Object.entries(series)
      .map(([ano, val]) => ({ ano: Number(ano), val: val == null ? null : Number(val) }))
      .filter((e) => e.val != null && !Number.isNaN(e.val))
      .sort((a, b) => b.ano - a.ano);
    if (entries.length === 0) return null;
    return { populacao: entries[0].val as number, ano: entries[0].ano };
  };

  // Estimativas oficiais
  const est = await tryFetch(6579, 9324);
  if (est) return est;

  // Fallback Censo 2022
  const censo = await tryFetch(4709, 93);
  if (censo) return censo;

  return { populacao: null, ano: null };
}

/**
 * Área territorial — IBGE expõe via agregado 1301 (variável 6318) "Área da unidade territorial".
 */
async function fetchAreaKm2(codigo: number): Promise<number | null> {
  try {
    const url = `https://servicodados.ibge.gov.br/api/v3/agregados/1301/periodos/-1/variaveis/6318?localidades=N6[${codigo}]`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const json = await res.json();
    const series = json?.[0]?.resultados?.[0]?.series?.[0]?.serie;
    if (!series) return null;
    const vals = Object.values(series).map((v) => (v == null ? null : Number(v))).filter((v) => v != null && !Number.isNaN(v as number));
    if (vals.length === 0) return null;
    return Number(vals[vals.length - 1]);
  } catch {
    return null;
  }
}

async function fetchMunicipioCompleto(codigo: number): Promise<Municipio> {
  const base = await fetchMunicipioBase(codigo);
  const [pop, area] = await Promise.all([fetchPopulacao(codigo), fetchAreaKm2(codigo)]);
  const densidade = pop.populacao && area && area > 0 ? Number((pop.populacao / area).toFixed(2)) : null;

  return {
    ...base,
    populacao: pop.populacao,
    ano_populacao: pop.ano,
    area_km2: area,
    densidade,
    capital: false, // não temos confirmação direta na API básica; deixamos false
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const codigoStr = url.searchParams.get("codigo");
    const nomeParam = url.searchParams.get("nome");
    const ufParam = url.searchParams.get("uf");
    const force = url.searchParams.get("force") === "1";
    let codigo = codigoStr ? parseInt(codigoStr, 10) : NaN;

    const supaUrl = Deno.env.get("SUPABASE_URL");
    const supaKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supaUrl || !supaKey) {
      return new Response(
        JSON.stringify({ error: "Configuração de servidor ausente" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const supa = createClient(supaUrl, supaKey);

    // Resolver por nome+uf se necessário
    if (!Number.isInteger(codigo) && nomeParam && ufParam) {
      const lookKey = nameKey(nomeParam, ufParam);
      const { data: cached } = await supa
        .from("api_cache")
        .select("payload, expires_at")
        .eq("endpoint_key", lookKey)
        .maybeSingle();
      if (cached && new Date(cached.expires_at).getTime() > Date.now()) {
        codigo = Number((cached.payload as any)?.codigo);
      } else {
        const resolved = await resolveCodigoByName(nomeParam, ufParam);
        if (!resolved) {
          return new Response(
            JSON.stringify({ error: `Município "${nomeParam}/${ufParam}" não encontrado no IBGE` }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        codigo = resolved;
        await supa.from("api_cache").upsert({
          endpoint_key: lookKey,
          source: SOURCE,
          payload: { codigo: resolved } as any,
          fetched_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        });
      }
    }

    if (!Number.isInteger(codigo) || codigo < 1000000 || codigo > 9999999) {
      return new Response(
        JSON.stringify({ error: "Informe ?codigo=NNNNNNN (7 dígitos) ou ?nome=...&uf=XX" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const key = cacheKey(codigo);

    // 1) Cache hit?
    if (!force) {
      const { data: row } = await supa
        .from("api_cache")
        .select("payload, expires_at")
        .eq("endpoint_key", key)
        .maybeSingle();
      if (row && new Date(row.expires_at).getTime() > Date.now()) {
        return new Response(
          JSON.stringify({ data: row.payload, cached: true, source: SOURCE }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // 2) Busca + grava cache
    let data: Municipio;
    try {
      data = await fetchMunicipioCompleto(codigo);
    } catch (err) {
      // Fallback: cache vencido se a API caiu
      const { data: row } = await supa
        .from("api_cache")
        .select("payload")
        .eq("endpoint_key", key)
        .maybeSingle();
      if (row) {
        return new Response(
          JSON.stringify({ data: row.payload, cached: true, stale: true, source: SOURCE, warning: String((err as Error).message) }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      throw err;
    }

    const expiresAt = new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    await supa.from("api_cache").upsert({
      endpoint_key: key,
      source: SOURCE,
      payload: data as any,
      fetched_at: new Date().toISOString(),
      expires_at: expiresAt,
    });

    return new Response(
      JSON.stringify({ data, cached: false, source: SOURCE }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "erro desconhecido";
    console.error("ibge-municipio-fetch error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});