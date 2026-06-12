// Geocoding em lote para eleicao_pessoas via Nominatim (OpenStreetMap).
// 100% gratuito, sem cartão de crédito, sem API key.
// Fallback inteligente:
//  1. Tenta rua + número + bairro + cidade (precision: 'rua')
//  2. Se falhar, tenta bairro + cidade (precision: 'bairro')
//  3. Se falhar, tenta cidade + UF (precision: 'cidade')
// Respeita o limite de uso do Nominatim: 1 requisição por segundo.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
// Identificação obrigatória conforme política de uso do Nominatim
const USER_AGENT = "EleicaoApp/1.0 (territorial-coverage-map; contact via lovable.app)";

const norm = (s: string) =>
  (s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

async function callNominatim(params: Record<string, string>) {
  const qs = new URLSearchParams({
    format: "jsonv2",
    addressdetails: "1",
    limit: "5",
    "accept-language": "pt-BR",
    countrycodes: "br",
    ...params,
  });

  let r: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    r = await fetch(`${NOMINATIM}?${qs.toString()}`, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
      },
    });
    if (r.ok) break;
    if (r.status === 503 || r.status === 502 || r.status === 504 || r.status === 429) {
      await new Promise((res) => setTimeout(res, 1000 * (attempt + 1)));
      continue;
    }
    break;
  }
  if (!r || !r.ok) throw new Error(`Nominatim ${r?.status ?? "no-response"}`);
  return await r.json() as any[];
}

// Verifica se um resultado bate com cidade/estado informados
function matchesLocation(item: any, city: string, state: string): boolean {
  const cityN = norm(city);
  const stateN = norm(state);
  const addr = item.address || {};

  const stateCandidates = [addr.state, addr.region].filter(Boolean).map((v: string) => norm(v));
  const stateOk = !stateN || stateCandidates.some((v: string) =>
    v === stateN || v.includes(stateN) || stateN.includes(v),
  );

  const cityCandidates = [
    addr.city, addr.town, addr.village, addr.municipality,
    addr.county, addr.city_district,
  ].filter(Boolean).map((v: string) => norm(v));
  const cityOk = !cityN || cityCandidates.some((v: string) =>
    v === cityN || v.includes(cityN) || cityN.includes(v),
  );

  return stateOk && cityOk;
}

function matchesBairro(item: any, bairro: string): boolean {
  if (!bairro) return true;
  const bairroN = norm(bairro);
  const addr = item.address || {};
  const cands = [
    addr.suburb, addr.neighbourhood, addr.quarter, addr.city_district, addr.residential,
  ].filter(Boolean).map((v: string) => norm(v));
  return cands.some((v: string) => v === bairroN || v.includes(bairroN) || bairroN.includes(v));
}

function pickResult(items: any[], city: string, state: string, bairro: string | null):
  { lat: number; lng: number; bairroOk: boolean } | null {
  if (!items || items.length === 0) return null;

  let fallback: { lat: number; lng: number; bairroOk: boolean } | null = null;

  for (const item of items) {
    if (!matchesLocation(item, city, state)) continue;
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    if (!bairro) return { lat, lng, bairroOk: true };

    const bairroOk = matchesBairro(item, bairro);
    if (bairroOk) return { lat, lng, bairroOk: true };
    if (!fallback) fallback = { lat, lng, bairroOk: false };
  }

  return fallback;
}

async function geocodeWithFallback(p: any, fallbackCity: string, state: string):
  Promise<{ lat: number; lng: number; precision: "rua" | "bairro" | "cidade" } | { error: string }> {
  const cidade = (p.cidade || "").trim() || fallbackCity;
  const bairro = (p.bairro || "").trim() || null;
  const rua = (p.rua || "").trim();
  const numero = (p.numero || "").trim();

  // Nível 1: rua + número + bairro + cidade (busca estruturada)
  if (rua) {
    try {
      const street = numero ? `${numero} ${rua}` : rua;
      const data = await callNominatim({
        street,
        city: cidade,
        state,
        country: "Brasil",
      });
      const picked = pickResult(data, cidade, state, bairro);
      if (picked && picked.bairroOk) {
        return { lat: picked.lat, lng: picked.lng, precision: "rua" };
      }
    } catch (_) { /* tenta nível 2 */ }
    await new Promise((r) => setTimeout(r, 1100));
  }

  // Nível 2: bairro + cidade (busca por texto livre para captar bairros populares)
  if (bairro) {
    try {
      const data = await callNominatim({
        q: `${bairro}, ${cidade}, ${state}, Brasil`,
      });
      const picked = pickResult(data, cidade, state, null);
      if (picked) {
        return { lat: picked.lat, lng: picked.lng, precision: "bairro" };
      }
    } catch (_) { /* tenta nível 3 */ }
    await new Promise((r) => setTimeout(r, 1100));
  }

  // Nível 3: cidade + UF
  try {
    const data = await callNominatim({
      city: cidade,
      state,
      country: "Brasil",
    });
    const picked = pickResult(data, cidade, state, null);
    if (picked) {
      return { lat: picked.lat, lng: picked.lng, precision: "cidade" };
    }
  } catch (e: any) {
    return { error: `geocode_failed: ${e?.message || "erro"}` };
  }

  return { error: "city_not_found" };
}

function addressHash(p: any): string {
  return [p.rua, p.numero, p.bairro, p.cidade, p.endereco].map((v) => (v || "").trim().toLowerCase()).join("|");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const {
      clientId,
      limit = 15,
      ids,
      defaultCity = "Campo Grande",
      defaultState = "MS",
      force = false,
    } = await req.json();

    if (!clientId) {
      return new Response(JSON.stringify({ error: "clientId obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let q = admin.from("eleicao_pessoas")
      .select("id, rua, numero, bairro, cidade, endereco, geocode_endereco_hash, lat")
      .eq("client_id", clientId)
      .limit(limit);
    if (ids && Array.isArray(ids) && ids.length) {
      q = q.in("id", ids);
    } else if (!force) {
      q = q.is("lat", null);
    }
    const { data: rows, error } = await q;
    if (error) throw error;

    let success = 0, failed = 0, skipped = 0;
    let pRua = 0, pBairro = 0, pCidade = 0;
    const results: any[] = [];

    for (const p of rows || []) {
      if (!p.cidade && !p.bairro && !p.rua && !p.endereco) {
        skipped++;
        await admin.from("eleicao_pessoas").update({
          geocode_status: "no_address",
          geocode_precision: null,
          geocoded_at: new Date().toISOString(),
        }).eq("id", p.id);
        continue;
      }
      try {
        const g = await geocodeWithFallback(p, defaultCity, defaultState);
        if ("error" in g) {
          await admin.from("eleicao_pessoas").update({
            lat: null,
            lng: null,
            geocode_status: g.error,
            geocode_precision: null,
            geocoded_at: new Date().toISOString(),
            geocode_endereco_hash: addressHash(p),
          }).eq("id", p.id);
          failed++;
        } else {
          const statusOut =
            g.precision === "rua" ? "ok" :
            g.precision === "bairro" ? "bairro_aproximado" :
            "cidade_aproximada";
          await admin.from("eleicao_pessoas").update({
            lat: g.lat,
            lng: g.lng,
            geocode_status: statusOut,
            geocode_precision: g.precision,
            geocoded_at: new Date().toISOString(),
            geocode_endereco_hash: addressHash(p),
          }).eq("id", p.id);
          success++;
          if (g.precision === "rua") pRua++;
          else if (g.precision === "bairro") pBairro++;
          else pCidade++;
          results.push({ id: p.id, lat: g.lat, lng: g.lng, precision: g.precision });
        }
      } catch (e: any) {
        console.error("[geocode] erro:", p.id, e?.message);
        failed++;
      }
      // Respeita rate limit do Nominatim: 1 req/seg entre pessoas distintas
      await new Promise((r) => setTimeout(r, 1100));
    }

    const { count: pending } = await admin
      .from("eleicao_pessoas")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .is("lat", null);

    return new Response(
      JSON.stringify({ success, failed, skipped, pRua, pBairro, pCidade, pending: pending || 0, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[geocode-eleicao-pessoas] erro:", err?.message);
    return new Response(JSON.stringify({ error: err?.message || "Erro" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
