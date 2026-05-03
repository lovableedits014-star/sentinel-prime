import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * holidays-fetch
 * Busca feriados nacionais brasileiros via Nager.Date (sem chave, ilimitado).
 * Faz cache em public.api_cache com TTL de 1 ano (feriados não mudam).
 * Endpoint: GET ?year=2026   ou   ?years=2026,2027
 * Retorna: { holidays: [{ date, localName, name, types, ... }], cached: bool, source }
 */

const NAGER_BASE = "https://date.nager.at/api/v3/PublicHolidays";
const COUNTRY = "BR";
const TTL_DAYS = 365;

type NagerHoliday = {
  date: string;
  localName: string;
  name: string;
  countryCode: string;
  fixed: boolean;
  global: boolean;
  counties: string[] | null;
  launchYear: number | null;
  types: string[];
};

function cacheKey(year: number) {
  return `nager:${COUNTRY}:${year}`;
}

async function fetchYearFromNager(year: number): Promise<NagerHoliday[]> {
  const url = `${NAGER_BASE}/${year}/${COUNTRY}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Nager.Date returned ${res.status} for year ${year}`);
  }
  const data = (await res.json()) as NagerHoliday[];
  if (!Array.isArray(data)) {
    throw new Error(`Unexpected response shape from Nager.Date for year ${year}`);
  }
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const yearsParam = url.searchParams.get("years");
    const yearParam = url.searchParams.get("year");
    const force = url.searchParams.get("force") === "1";

    let years: number[];
    if (yearsParam) {
      years = yearsParam
        .split(",")
        .map((y) => parseInt(y.trim(), 10))
        .filter((y) => Number.isInteger(y) && y >= 2000 && y <= 2100);
    } else if (yearParam) {
      const y = parseInt(yearParam, 10);
      if (!Number.isInteger(y) || y < 2000 || y > 2100) {
        return new Response(
          JSON.stringify({ error: "year must be an integer between 2000 and 2100" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      years = [y];
    } else {
      const current = new Date().getUTCFullYear();
      years = [current, current + 1];
    }

    if (years.length === 0) {
      return new Response(
        JSON.stringify({ error: "no valid years requested" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const allHolidays: (NagerHoliday & { year: number })[] = [];
    let cachedCount = 0;
    let fetchedCount = 0;
    const errors: { year: number; error: string }[] = [];

    for (const year of years) {
      const key = cacheKey(year);

      if (!force) {
        const { data: cached } = await supabase
          .from("api_cache")
          .select("payload, expires_at")
          .eq("endpoint_key", key)
          .maybeSingle();

        if (cached && new Date(cached.expires_at).getTime() > Date.now()) {
          const arr = (cached.payload as unknown as NagerHoliday[]) ?? [];
          for (const h of arr) allHolidays.push({ ...h, year });
          cachedCount += 1;
          continue;
        }
      }

      try {
        const fresh = await fetchYearFromNager(year);
        const expires = new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

        const { error: upsertError } = await supabase
          .from("api_cache")
          .upsert(
            {
              endpoint_key: key,
              source: "nager.date",
              payload: fresh,
              fetched_at: new Date().toISOString(),
              expires_at: expires,
            },
            { onConflict: "endpoint_key" },
          );

        if (upsertError) {
          console.error(`[holidays-fetch] cache upsert failed for ${year}:`, upsertError);
        }

        for (const h of fresh) allHolidays.push({ ...h, year });
        fetchedCount += 1;
      } catch (err) {
        console.error(`[holidays-fetch] fetch failed for ${year}:`, err);
        // Fallback: tenta servir cache vencido
        const { data: stale } = await supabase
          .from("api_cache")
          .select("payload")
          .eq("endpoint_key", key)
          .maybeSingle();
        if (stale?.payload) {
          const arr = (stale.payload as unknown as NagerHoliday[]) ?? [];
          for (const h of arr) allHolidays.push({ ...h, year });
        } else {
          errors.push({ year, error: err instanceof Error ? err.message : String(err) });
        }
      }
    }

    allHolidays.sort((a, b) => a.date.localeCompare(b.date));

    return new Response(
      JSON.stringify({
        holidays: allHolidays,
        years,
        cached_years: cachedCount,
        fetched_years: fetchedCount,
        errors,
        source: "nager.date",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[holidays-fetch] fatal:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});