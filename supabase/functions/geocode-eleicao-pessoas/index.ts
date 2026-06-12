// Geocoding em lote para eleicao_pessoas via Google Maps Platform Gateway.
// Estratégia anti-erro:
//  - Sempre força cidade/estado no texto enviado ao Google.
//  - Usa components filter (country/admin/locality) e bounds bias.
//  - VALIDA que o resultado caiu na cidade certa (Campo Grande/MS por padrão)
//    E, se houver bairro informado no cadastro, que esse bairro esteja entre
//    os address_components (sublocality / neighborhood / political).
//  - Se não bate, marca como "out_of_region" / "bairro_nao_confirmado"
//    e deixa o cadastro pendente em vez de gravar coordenada errada.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GATEWAY = "https://connector-gateway.lovable.dev/google_maps";

// Bounding box (sul, oeste, norte, leste) ampliado para o município de Campo Grande/MS
// (inclui distritos como Anhandui e Rochedinho).
const DEFAULT_BOUNDS = { south: -21.05, west: -55.00, north: -20.20, east: -54.30 };

interface GeocodeOpts {
  defaultCity: string;
  defaultState: string;
  defaultCountry: string;
  bounds?: { south: number; west: number; north: number; east: number };
}

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
  bounds: { south: number; west: number; north: number; east: number } | undefined,
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
  if (bounds) {
    params.set("bounds", `${bounds.south},${bounds.west}|${bounds.north},${bounds.east}`);
  }

  let r: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    r = await fetch(`${GATEWAY}/maps/api/geocode/json?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": gmapsKey,
      },
    });
    if (r.ok) break;
    // Retry em erros transientes do gateway
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

  // Procura o primeiro resultado cujos address_components batem com cidade/estado
  // (e bairro quando informado).
  let cityStateMatchFallback: any = null;
  for (const res of data.results) {
    const comps = res.address_components || [];

    const componentsByType = (type: string) =>
      comps.filter((c: any) => c.types?.includes(type))
        .flatMap((c: any) => [c.long_name, c.short_name].filter(Boolean));

    const matchesAny = (type: string, val: string) =>
      componentsByType(type).some((v: string) => norm(v) === val);

    const cityOk = !cityN ||
      matchesAny("locality", cityN) ||
      matchesAny("administrative_area_level_2", cityN);
    const stateOk = !stateN || matchesAny("administrative_area_level_1", stateN);

    if (!cityOk || !stateOk) continue;
    if (!res.geometry?.location) continue;
    const { lat, lng } = res.geometry.location;

    // Defesa em profundidade: dentro da bounding box (com folga).
    if (bounds && (lat < bounds.south - 0.5 || lat > bounds.north + 0.5 ||
                   lng < bounds.west - 0.5 || lng > bounds.east + 0.5)) {
      continue;
    }

    if (!bairroN) {
      // sem bairro pra validar — aceita o primeiro resultado com cidade/estado certos
      return { status: "OK", lat, lng, validated: true };
    }

    // Tenta confirmar o bairro nos address_components.
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
    // guarda fallback (cidade/estado certos mas bairro não confirmado)
    if (!cityStateMatchFallback) cityStateMatchFallback = { lat, lng };
  }

  if (cityStateMatchFallback && !bairroN) {
    return { status: "OK", lat: cityStateMatchFallback.lat, lng: cityStateMatchFallback.lng, validated: true };
  }

  if (cityStateMatchFallback && bairroN) {
    // Cidade/estado bateram mas Google não devolveu o bairro exato.
    // Não grava ponto — deixa pendente pra revisão manual.
    return { status: "BAIRRO_NAO_CONFIRMADO", lat: 0, lng: 0, validated: false };
  }

  return { status: "OUT_OF_REGION", lat: 0, lng: 0, validated: false };
}

function buildAddressBase(p: any, opts: GeocodeOpts): { text: string; bairro: string | null } {
  const parts: string[] = [];
  const bairro = (p.bairro || "").trim() || null;
  if (p.rua) parts.push(`${p.rua}${p.numero ? `, ${p.numero}` : ""}`);
  if (bairro) parts.push(`Bairro ${bairro}`);
  if (!p.rua && !bairro && p.endereco) parts.push(p.endereco);

  const cidade = (p.cidade || "").trim() || opts.defaultCity;
  const estado = opts.defaultState;
  parts.push(`${cidade} - ${estado}`);
  parts.push("Brasil");
  return { text: parts.join(", "), bairro };
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

    const opts: GeocodeOpts = { defaultCity, defaultState, defaultCountry, bounds: DEFAULT_BOUNDS };

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

    let success = 0, failed = 0, skipped = 0, outOfRegion = 0, bairroNaoConfirmado = 0;
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
      const { text: addr, bairro } = buildAddressBase(p, opts);
      // Cidade efetiva: do cadastro se houver; senão default (Campo Grande)
      const cidadeEfetiva = (p.cidade || "").trim() || opts.defaultCity;
      try {
        const g = await geocode(addr, bairro, cidadeEfetiva, opts.defaultState, opts.defaultCountry, opts.bounds);
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
      JSON.stringify({ success, failed, skipped, outOfRegion, bairroNaoConfirmado, pending: pending || 0, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[geocode-eleicao-pessoas] erro:", err?.message);
    return new Response(JSON.stringify({ error: err?.message || "Erro" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
