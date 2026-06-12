// Geocoding em lote para eleicao_pessoas com fallback inteligente:
//  1. Tenta rua + número + bairro + cidade (precision: 'rua')
//  2. Se falhar, tenta bairro + cidade (precision: 'bairro')
//  3. Se falhar, tenta cidade + UF (precision: 'cidade')
// Assim, todo cadastro com pelo menos a cidade preenchida aparece no mapa.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GATEWAY = "https://connector-gateway.lovable.dev/google_maps";

const norm = (s: string) =>
  (s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

async function callGoogle(address: string, city: string, state: string, country: string) {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const gmapsKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (!lovableKey || !gmapsKey) throw new Error("Credenciais Google Maps não configuradas");

  const components = [
    `country:${country}`,
    state ? `administrative_area:${state}` : "",
    city ? `locality:${city}` : "",
  ].filter(Boolean).join("|");

  const params = new URLSearchParams({
    address,
    region: country.toLowerCase(),
    language: "pt-BR",
    components,
  });

  let r: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    r = await fetch(`${GATEWAY}/maps/api/geocode/json?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": gmapsKey,
      },
    });
    if (r.ok) break;
    if (r.status === 503 || r.status === 502 || r.status === 504 || r.status === 429) {
      await new Promise((res) => setTimeout(res, 500 * (attempt + 1)));
      continue;
    }
    break;
  }
  if (!r || !r.ok) throw new Error(`Gateway ${r?.status ?? "no-response"}`);
  return await r.json();
}

// Procura nos resultados um que bata com a cidade/estado.
// Retorna lat/lng + indicador se confirmou o bairro (quando informado).
function pickResult(data: any, city: string, state: string, bairro: string | null):
  { lat: number; lng: number; bairroOk: boolean } | null {
  if (data?.status !== "OK" || !data.results?.length) return null;
  const cityN = norm(city);
  const stateN = norm(state);
  const bairroN = bairro ? norm(bairro) : "";

  let fallback: { lat: number; lng: number; bairroOk: boolean } | null = null;

  for (const res of data.results) {
    const comps = res.address_components || [];
    const byType = (type: string) =>
      comps.filter((c: any) => c.types?.includes(type))
        .flatMap((c: any) => [c.long_name, c.short_name].filter(Boolean));
    const matchesAny = (type: string, val: string) =>
      byType(type).some((v: string) => norm(v) === val);

    const stateOk = !stateN || matchesAny("administrative_area_level_1", stateN);
    const cityOk = !cityN ||
      matchesAny("locality", cityN) ||
      matchesAny("administrative_area_level_2", cityN);

    if (!stateOk || !cityOk) continue;
    if (!res.geometry?.location) continue;
    const { lat, lng } = res.geometry.location;

    if (!bairroN) return { lat, lng, bairroOk: true };

    const bairroCandidates: string[] = [
      ...byType("sublocality"),
      ...byType("sublocality_level_1"),
      ...byType("neighborhood"),
      ...byType("political"),
      ...byType("administrative_area_level_4"),
    ].map((v: string) => norm(v));

    const bairroOk = bairroCandidates.some((v) => v === bairroN || v.includes(bairroN) || bairroN.includes(v));
    if (bairroOk) return { lat, lng, bairroOk: true };
    if (!fallback) fallback = { lat, lng, bairroOk: false };
  }

  return fallback;
}

// Geocode com fallback em 3 níveis. Sempre devolve lat/lng se houver pelo menos
// cidade resolvível. precision indica a granularidade real do pino.
async function geocodeWithFallback(p: any, fallbackCity: string, state: string, country: string):
  Promise<{ lat: number; lng: number; precision: "rua" | "bairro" | "cidade" } | { error: string }> {
  const cidade = (p.cidade || "").trim() || fallbackCity;
  const bairro = (p.bairro || "").trim() || null;
  const rua = (p.rua || "").trim();
  const numero = (p.numero || "").trim();

  // Nível 1: rua + número + bairro + cidade
  if (rua) {
    const addr = [
      `${rua}${numero ? `, ${numero}` : ""}`,
      bairro ? `Bairro ${bairro}` : "",
      `${cidade} - ${state}`,
      "Brasil",
    ].filter(Boolean).join(", ");
    try {
      const data = await callGoogle(addr, cidade, state, country);
      const picked = pickResult(data, cidade, state, bairro);
      if (picked && picked.bairroOk) {
        return { lat: picked.lat, lng: picked.lng, precision: "rua" };
      }
      // Se city+state bateram mas bairro não — segue para o nível 2.
    } catch (_) { /* tenta nível 2 */ }
  }

  // Nível 2: bairro + cidade
  if (bairro) {
    const addr = `Bairro ${bairro}, ${cidade} - ${state}, Brasil`;
    try {
      const data = await callGoogle(addr, cidade, state, country);
      const picked = pickResult(data, cidade, state, null);
      if (picked) {
        return { lat: picked.lat, lng: picked.lng, precision: "bairro" };
      }
    } catch (_) { /* tenta nível 3 */ }
  }

  // Nível 3: cidade + UF
  const addr = `${cidade} - ${state}, Brasil`;
  try {
    const data = await callGoogle(addr, cidade, state, country);
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
      limit = 25,
      ids,
      defaultCity = "Campo Grande",
      defaultState = "MS",
      defaultCountry = "BR",
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
        const g = await geocodeWithFallback(p, defaultCity, defaultState, defaultCountry);
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
      await new Promise((r) => setTimeout(r, 100));
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
