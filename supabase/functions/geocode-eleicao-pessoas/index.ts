// Geocoding em lote para eleicao_pessoas via Google Maps Platform Gateway.
// Restringe resultados à cidade/estado padrão (default: Campo Grande/MS) para
// evitar que bairros com nomes ambíguos (ex: "Los Angeles", "Nova Lima") sejam
// geocodificados em outros países/estados.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GATEWAY = "https://connector-gateway.lovable.dev/google_maps";

// Bounding box (sul, oeste, norte, leste) aproximado de Campo Grande/MS
const DEFAULT_BOUNDS = { south: -20.65, west: -54.85, north: -20.30, east: -54.45 };

interface GeocodeOpts {
  defaultCity: string;
  defaultState: string;
  defaultCountry: string;
  bounds?: { south: number; west: number; north: number; east: number };
}

async function geocode(addressBase: string, city: string, state: string, country: string, bounds: any) {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const gmapsKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (!lovableKey || !gmapsKey) throw new Error("Credenciais Google Maps não configuradas");

  // Força a região via components filter + bias por bounds
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

  const r = await fetch(`${GATEWAY}/maps/api/geocode/json?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": gmapsKey,
    },
  });
  if (!r.ok) throw new Error(`Gateway ${r.status}`);
  const data = await r.json();
  const status = data.status as string;
  if (status !== "OK" || !data.results?.length) {
    return { status, lat: 0, lng: 0, validated: false };
  }

  // Procura o primeiro resultado cujos address_components batem com cidade/estado
  for (const res of data.results) {
    const comps = res.address_components || [];
    const has = (type: string, val: string) =>
      comps.some((c: any) => c.types?.includes(type) &&
        (c.long_name?.toLowerCase() === val.toLowerCase() ||
         c.short_name?.toLowerCase() === val.toLowerCase()));
    const cityOk = !city || has("locality", city) || has("administrative_area_level_2", city);
    const stateOk = !state || has("administrative_area_level_1", state);
    if (cityOk && stateOk && res.geometry?.location) {
      const { lat, lng } = res.geometry.location;
      // Valida bounds também (defesa em profundidade)
      if (bounds && (lat < bounds.south - 0.5 || lat > bounds.north + 0.5 ||
                     lng < bounds.west - 0.5 || lng > bounds.east + 0.5)) {
        continue;
      }
      return { status: "OK", lat, lng, validated: true };
    }
  }
  return { status: "OUT_OF_REGION", lat: 0, lng: 0, validated: false };
}

function buildAddressBase(p: any, opts: GeocodeOpts): string {
  const parts: string[] = [];
  if (p.rua) parts.push(`${p.rua}${p.numero ? `, ${p.numero}` : ""}`);
  else if (p.endereco) parts.push(p.endereco);
  if (p.bairro) parts.push(`Bairro ${p.bairro}`);
  // Sempre força a cidade/estado no texto também
  const cidade = p.cidade?.trim() || opts.defaultCity;
  const estado = opts.defaultState;
  parts.push(`${cidade} - ${estado}`);
  parts.push("Brasil");
  return parts.join(", ");
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

    let success = 0, failed = 0, skipped = 0, outOfRegion = 0;
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
      const addr = buildAddressBase(p, opts);
      try {
        const g = await geocode(addr, opts.defaultCity, opts.defaultState, opts.defaultCountry, opts.bounds);
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
          await admin.from("eleicao_pessoas").update({
            lat: null,
            lng: null,
            geocode_status: g.status === "OUT_OF_REGION" ? "out_of_region" : (g.status?.toLowerCase() || "failed"),
            geocoded_at: new Date().toISOString(),
            geocode_endereco_hash: addressHash(p),
          }).eq("id", p.id);
          if (g.status === "OUT_OF_REGION") outOfRegion++;
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

    return new Response(JSON.stringify({ success, failed, skipped, outOfRegion, pending: pending || 0, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[geocode-eleicao-pessoas] erro:", err?.message);
    return new Response(JSON.stringify({ error: err?.message || "Erro" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
