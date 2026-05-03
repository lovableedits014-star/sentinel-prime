// Preenche o campo `bairro` dos locais TSE usando GEOCODING REAL via Nominatim (OpenStreetMap).
// Estratégia autoritativa baseada em coordenadas geográficas reais — não inventa, não alucina.
// Para cada endereço: geocoda na OSM, pega lat/lon, faz reverse-geocode para extrair `suburb`/`neighbourhood`.
// Quando OSM não retorna, deixa NULL (para revisão manual) — NUNCA chuta um bairro.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Nominatim exige rate-limit de 1 req/s e User-Agent identificável.
const NOMINATIM_DELAY_MS = 1100;
const USER_AGENT = "SentrySocialSpark/1.0 (geocoding TSE locais; contact: lovableedits014@gmail.com)";
const MAX_RUNTIME_MS = 50_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function normalizeEndereco(endereco: string, cidade: string, uf: string): string {
  // Remove "N. 1095" → "1095"; padroniza para "<rua>, <numero>, <cidade>, <uf>, Brasil".
  let s = endereco.trim();
  s = s.replace(/\bN\.\s*/gi, "");
  s = s.replace(/\s+/g, " ");
  return `${s}, ${cidade}, ${uf}, Brasil`;
}

type GeoResult = { lat: number; lon: number; bairro: string | null; raw_addr?: any };

async function geocodeAddress(query: string): Promise<GeoResult | null> {
  // 1) Forward geocode → coordenadas
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "br");

  const resp = await fetch(url.toString(), {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "pt-BR" },
  });
  if (!resp.ok) {
    console.warn("Nominatim search status", resp.status, query);
    return null;
  }
  const arr = await resp.json();
  if (!Array.isArray(arr) || arr.length === 0) return null;

  const hit = arr[0];
  const lat = parseFloat(hit.lat);
  const lon = parseFloat(hit.lon);
  if (!isFinite(lat) || !isFinite(lon)) return null;

  const addr = hit.address || {};
  const bairro =
    addr.suburb ||
    addr.neighbourhood ||
    addr.city_district ||
    addr.quarter ||
    addr.residential ||
    null;

  // Se já veio bairro no forward, retorna direto.
  if (bairro) {
    return { lat, lon, bairro, raw_addr: addr };
  }

  // 2) Caso contrário, faz reverse-geocode (mais detalhado para coordenadas)
  await sleep(NOMINATIM_DELAY_MS);
  const rev = new URL("https://nominatim.openstreetmap.org/reverse");
  rev.searchParams.set("lat", String(lat));
  rev.searchParams.set("lon", String(lon));
  rev.searchParams.set("format", "jsonv2");
  rev.searchParams.set("addressdetails", "1");
  rev.searchParams.set("zoom", "17");

  const r2 = await fetch(rev.toString(), {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "pt-BR" },
  });
  if (!r2.ok) return { lat, lon, bairro: null };
  const j2 = await r2.json();
  const a2 = j2.address || {};
  const bairro2 =
    a2.suburb ||
    a2.neighbourhood ||
    a2.city_district ||
    a2.quarter ||
    a2.residential ||
    null;
  return { lat, lon, bairro: bairro2, raw_addr: a2 };
}

async function inferCidadeUf(
  supabase: any,
  zona: number,
): Promise<{ cidade: string; uf: string }> {
  // Por padrão, este sistema só carrega TSE para Campo Grande/MS hoje.
  // Mantemos um fallback configurável caso evolua.
  const { data } = await supabase
    .from("tse_votacao_zona")
    .select("municipio, uf")
    .eq("zona", zona)
    .limit(1)
    .maybeSingle();
  return {
    cidade: data?.municipio || "Campo Grande",
    uf: data?.uf || "MS",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Modo: "pending" (bairro IS NULL) ou "retry_empty" (bairro = '' — tentou mas não achou).
  let mode: "pending" | "retry_empty" = "pending";
  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (body?.retry_empty === true) mode = "retry_empty";
    }
  } catch (_) { /* ignore */ }

  let query = supabase
    .from("tse_votacao_local")
    .select("zona, nr_local, endereco, nome_local")
    .not("endereco", "is", null);

  if (mode === "retry_empty") {
    query = query.eq("bairro", "");
  } else {
    query = query.is("bairro", null);
  }

  const { data: locais, error } = await query.limit(2000);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // dedup por (zona, nr_local)
  const seen = new Set<string>();
  const unique: Array<{ zona: number; nr_local: number; endereco: string; nome_local: string | null }> = [];
  for (const l of locais || []) {
    const k = `${l.zona}-${l.nr_local}`;
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(l as any);
  }

  // Cache cidade/uf por zona
  const cidadeCache = new Map<number, { cidade: string; uf: string }>();

  let updated = 0;
  let notFound = 0;
  let failed = 0;
  const start = Date.now();

  for (const l of unique) {
    if (Date.now() - start > MAX_RUNTIME_MS) break;

    let geo = cidadeCache.get(l.zona);
    if (!geo) {
      geo = await inferCidadeUf(supabase, l.zona);
      cidadeCache.set(l.zona, geo);
    }

    // Tentativa 1: endereço + número (mais preciso)
    let result: GeoResult | null = null;
    try {
      const q1 = normalizeEndereco(l.endereco, geo.cidade, geo.uf);
      result = await geocodeAddress(q1);
      await sleep(NOMINATIM_DELAY_MS);

      // Tentativa 2: nome do local (escola) + cidade — caso 1 falhe
      if ((!result || !result.bairro) && l.nome_local) {
        const q2 = `${l.nome_local}, ${geo.cidade}, ${geo.uf}, Brasil`;
        const r2 = await geocodeAddress(q2);
        await sleep(NOMINATIM_DELAY_MS);
        if (r2?.bairro) result = r2;
      }

      // Tentativa 3: endereço SEM número (rua + cidade) — pega o lado da rua
      if ((!result || !result.bairro) && l.endereco) {
        const ruaSemNumero = l.endereco
          .replace(/\bN\.\s*\d+/gi, "")
          .replace(/,?\s*\d+\s*$/g, "")
          .replace(/,?\s*S\/?N\b/gi, "")
          .trim();
        if (ruaSemNumero) {
          const q3 = `${ruaSemNumero}, ${geo.cidade}, ${geo.uf}, Brasil`;
          const r3 = await geocodeAddress(q3);
          await sleep(NOMINATIM_DELAY_MS);
          if (r3?.bairro) result = r3;
        }
      }

      // Tentativa 4: nome do local simplificado (remove prefixos comuns)
      if ((!result || !result.bairro) && l.nome_local) {
        const nomeSimples = l.nome_local
          .replace(/^(ESCOLA\s+(MUNICIPAL|ESTADUAL|PARTICULAR)|EM|EE|EMEF|EMEI|CEINF|COL[ÉE]GIO)\s+/i, "")
          .replace(/^(DR\.?|PROF\.?|PROFESSOR[A]?|SENADOR[A]?)\s+/i, "")
          .trim();
        if (nomeSimples && nomeSimples !== l.nome_local) {
          const q4 = `${nomeSimples}, ${geo.cidade}, ${geo.uf}, Brasil`;
          const r4 = await geocodeAddress(q4);
          await sleep(NOMINATIM_DELAY_MS);
          if (r4?.bairro) result = r4;
        }
      }
    } catch (e) {
      console.error("Erro geocode", l.zona, l.nr_local, e);
      failed++;
      continue;
    }

    const bairro = result?.bairro || ""; // string vazia = tentou mas não achou (não confiável)

    const { error: upErr } = await supabase
      .from("tse_votacao_local")
      .update({ bairro })
      .eq("zona", l.zona)
      .eq("nr_local", l.nr_local);

    if (upErr) {
      failed++;
    } else if (bairro) {
      updated++;
    } else {
      notFound++;
    }
  }

  return new Response(
    JSON.stringify({
      strategy: "nominatim_osm",
      mode,
      processed: updated + notFound + failed,
      updated,
      not_found: notFound,
      failed,
      remaining: unique.length - updated - notFound - failed,
      note:
        mode === "retry_empty"
          ? "Re-tentativa de locais sem resultado anterior. Os que continuam vazios provavelmente não existem no OSM."
          : "Bairros vazios = OSM não encontrou — preferimos vazio a errar. Reexecute para continuar processando.",
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});