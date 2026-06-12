// Geocoding em lote para eleicao_pessoas via Google Maps Platform Gateway.
// Estratégia:
//  - Respeita a CIDADE do cadastro (Campo Grande só é usado como fallback
//    quando o campo cidade está vazio).
//  - Usa components filter (country/admin/locality) com a cidade real.
//  - Valida que o resultado caiu no país/UF/cidade corretos.
//  - Se houver bairro informado, tenta confirmar pelos address_components.
//  - Se cidade do retorno difere da cadastrada → city_mismatch (não grava).
//  - Se bairro não confere → bairro_nao_confirmado (não grava).
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

async function geocode(
  addressBase: string,
  bairro: string | null,
  city: string,
  state: string,
  country: string,
) {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const gmapsKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (!lovableKey || !gmapsKey) throw new Error("Credenciais Google Maps não configuradas");

  const components = [
    `country:${country}`,
    state ? `administrative_area:${state}` : "",
    city ? `locality:${city}` : "",
  ].filter(Boolean).join("|");

  const params = new URLSearchParams({
    address: addressBase,
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
  const data = await r.json();
  const status = data.status as string;
  if (status !== "OK" || !data.results?.length) {
    return { status, lat: 0, lng: 0, validated: false };
  }

  const cityN = norm(city);
  const stateN = norm(state);
  const bairroN = bairro ? norm(bairro) : "";

  let cityStateMatchFallback: any = null;
  let anyStateMatch = false;

  for (const res of data.results) {
    const comps = res.address_components || [];

    const componentsByType = (type: string) =>
      comps.filter((c: any) => c.types?.includes(type))
        .flatMap((c: any) => [c.long_name, c.short_name].filter(Boolean));

    const matchesAny = (type: string, val: string) =>
      componentsByType(type).some((v: string) => norm(v) === val);

    const stateOk = !stateN || matchesAny("administrative_area_level_1", stateN);
    if (stateOk) anyStateMatch = true;

    const cityOk = !cityN ||
      matchesAny("locality", cityN) ||
      matchesAny("administrative_area_level_2", cityN);

    if (!cityOk || !stateOk) continue;
    if (!res.geometry?.location) continue;
    const { lat, lng } = res.geometry.location;

    if (!bairroN) {
      return { status: "OK", lat, lng, validated: true };
    }

    const bairroCandidates: string[] = [
      ...componentsByType("sublocality"),
      ...componentsByType("sublocality_level_1"),
      ...componentsByType("neighborhood"),
      ...componentsByType("political"),
      ...componentsByType("administrative_area_level_4"),
    ].map((v: string) => norm(v));

    const bairroOk = bairroCandidates.some((v) => v === bairroN || v.includes(bairroN) || bairroN.includes(v));

    if (bairroOk) {
      return { status: "OK", lat, lng, validated: true };
    }
    if (!cityStateMatchFallback) cityStateMatchFallback = { lat, lng };
  }

  if (cityStateMatchFallback && bairroN) {
    return { status: "BAIRRO_NAO_CONFIRMADO", lat: 0, lng: 0, validated: false };
  }
  if (cityStateMatchFallback) {
    return { status: "OK", lat: cityStateMatchFallback.lat, lng: cityStateMatchFallback.lng, validated: true };
  }
  // Cidade não bateu — pode ser que o cadastro tenha cidade errada ou o
  // Google interpretou diferente. Marca city_mismatch.
  if (anyStateMatch) {
    return { status: "CITY_MISMATCH", lat: 0, lng: 0, validated: false };
  }
  return { status: "OUT_OF_REGION", lat: 0, lng: 0, validated: false };
}

function buildAddressBase(p: any, fallbackCity: string, fallbackState: string): { text: string; bairro: string | null; cidade: string } {
  const parts: string[] = [];
  const bairro = (p.bairro || "").trim() || null;
  if (p.rua) parts.push(`${p.rua}${p.numero ? `, ${p.numero}` : ""}`);
  if (bairro) parts.push(`Bairro ${bairro}`);
  if (!p.rua && !bairro && p.endereco) parts.push(p.endereco);

  const cidade = (p.cidade || "").trim() || fallbackCity;
  const estado = fallbackState;
  parts.push(`${cidade} - ${estado}`);
  parts.push("Brasil");
  return { text: parts.join(", "), bairro, cidade };
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

    let success = 0, failed = 0, skipped = 0, outOfRegion = 0, bairroNaoConfirmado = 0, cityMismatch = 0;
    const results: any[] = [];

    for (const p of rows || []) {
      if (!p.cidade && !p.bairro && !p.rua && !p.endereco) {
        skipped++;
        await admin.from("eleicao_pessoas").update({
          geocode_status: "no_address",
          geocoded_at: new Date().toISOString(),
        }).eq("id", p.id);
        continue;
      }
      const { text: addr, bairro, cidade } = buildAddressBase(p, defaultCity, defaultState);
      try {
        const g = await geocode(addr, bairro, cidade, defaultState, defaultCountry);
        if (g.validated && g.status === "OK") {
          await admin.from("eleicao_pessoas").update({
            lat: g.lat,
            lng: g.lng,
            geocode_status: "ok",
            geocoded_at: new Date().toISOString(),
            geocode_endereco_hash: addressHash(p),
          }).eq("id", p.id);
          success++;
          results.push({ id: p.id, lat: g.lat, lng: g.lng });
        } else {
          const statusOut =
            g.status === "OUT_OF_REGION" ? "out_of_region" :
            g.status === "CITY_MISMATCH" ? "city_mismatch" :
            g.status === "BAIRRO_NAO_CONFIRMADO" ? "bairro_nao_confirmado" :
            (g.status?.toLowerCase() || "failed");
          await admin.from("eleicao_pessoas").update({
            lat: null,
            lng: null,
            geocode_status: statusOut,
            geocoded_at: new Date().toISOString(),
            geocode_endereco_hash: addressHash(p),
          }).eq("id", p.id);
          if (g.status === "OUT_OF_REGION") outOfRegion++;
          else if (g.status === "CITY_MISMATCH") cityMismatch++;
          else if (g.status === "BAIRRO_NAO_CONFIRMADO") bairroNaoConfirmado++;
          failed++;
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
      JSON.stringify({ success, failed, skipped, outOfRegion, cityMismatch, bairroNaoConfirmado, pending: pending || 0, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[geocode-eleicao-pessoas] erro:", err?.message);
    return new Response(JSON.stringify({ error: err?.message || "Erro" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
