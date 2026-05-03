import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * gdelt-media-fetch
 * Monitora cobertura de mídia (volume + tom) sobre temas/figuras políticas via GDELT DOC 2.0 (API pública sem chave).
 *
 * Endpoint:
 *   GET ?query=...&timespan=7d&country=BR&maxrecords=50
 *
 * Retorna:
 *   - timeline: pontos diários (volume + tom médio)
 *   - articles: lista de artigos recentes (título, fonte, url, data, tom, idioma, país)
 *   - tone_summary: { avg, positives, neutrals, negatives }
 *   - top_sources: top fontes por volume
 *
 * Cache: public.api_cache, TTL 30min (cobertura de mídia muda rápido).
 */

const TTL_SECONDS = 30 * 60;
const SOURCE = "gdelt";
const GDELT_BASE = "https://api.gdeltproject.org/api/v2/doc/doc";

type Article = {
  title: string;
  url: string;
  domain: string;
  seendate: string; // ISO
  language: string;
  sourcecountry: string;
  tone: number | null;
  source: "gdelt" | "google_news";
};

type Timeline = { date: string; volume: number; tone: number | null };

function key(query: string, timespan: string, country: string, sources: string) {
  return `media:${sources}:${country}:${timespan}:${query.toLowerCase().trim()}`;
}

/** Parse "20251020T123000Z" → "2025-10-20" */
function parseGdeltDate(s: string): string {
  if (!s || s.length < 8) return s;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

async function fetchArticles(query: string, timespan: string, country: string, maxrecords: number): Promise<Article[]> {
  const q = country && country !== "all" ? `${query} sourcecountry:${country}` : query;
  const url = `${GDELT_BASE}?query=${encodeURIComponent(q)}&mode=ArtList&format=json&maxrecords=${maxrecords}&timespan=${encodeURIComponent(timespan)}&sort=DateDesc`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`GDELT ArtList ${res.status}`);
  const text = await res.text();
  if (!text || text.trim().length === 0) return [];
  let json: any;
  try { json = JSON.parse(text); } catch { return []; }
  const arts = Array.isArray(json?.articles) ? json.articles : [];
  return arts.map((a: any) => ({
    title: a.title ?? "",
    url: a.url ?? "",
    domain: a.domain ?? "",
    seendate: a.seendate ?? "",
    language: a.language ?? "",
    sourcecountry: a.sourcecountry ?? "",
    tone: typeof a.tone === "number" ? a.tone : (a.tone != null ? Number(a.tone) : null),
    source: "gdelt" as const,
  }));
}

/** Converte timespan "7d"/"24h" para parâmetro `when:` do Google News (ex: 7d, 1d) */
function timespanToGNewsWhen(ts: string): string {
  const m = /^(\d+)(d|h)$/.exec(ts);
  if (!m) return "7d";
  const n = parseInt(m[1], 10);
  const unit = m[2];
  if (unit === "h") {
    // Google News não tem "h" — converter para 1d se < 24h, senão arredondar
    return n < 24 ? "1d" : `${Math.ceil(n / 24)}d`;
  }
  return `${Math.min(n, 365)}d`;
}

/** País → hl/gl/ceid do Google News */
function gnewsLocale(country: string): { hl: string; gl: string; ceid: string } {
  const c = (country || "BR").toUpperCase();
  switch (c) {
    case "BR": return { hl: "pt-BR", gl: "BR", ceid: "BR:pt-419" };
    case "PT": return { hl: "pt-PT", gl: "PT", ceid: "PT:pt-150" };
    case "US": return { hl: "en-US", gl: "US", ceid: "US:en" };
    case "ES": return { hl: "es-ES", gl: "ES", ceid: "ES:es" };
    case "AR": return { hl: "es-AR", gl: "AR", ceid: "AR:es-419" };
    default:   return { hl: "pt-BR", gl: "BR", ceid: "BR:pt-419" };
  }
}

/** Extrai domínio limpo de uma URL */
function extractDomain(url: string): string {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h.startsWith("www.") ? h.slice(4) : h;
  } catch {
    return "";
  }
}

/** Decodifica entidades HTML básicas em strings curtas (títulos) */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)));
}

/** Parser RSS minimalista (sem libs). Extrai item.title, link, pubDate, source */
function parseRssItems(xml: string): Array<{ title: string; link: string; pubDate: string; sourceName: string }> {
  const items: Array<{ title: string; link: string; pubDate: string; sourceName: string }> = [];
  const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    const get = (tag: string) => {
      const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
      const r = re.exec(block);
      if (!r) return "";
      let v = r[1].trim();
      // remove CDATA
      v = v.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
      return decodeEntities(v.replace(/<[^>]+>/g, "").trim());
    };
    items.push({
      title: get("title"),
      link: get("link"),
      pubDate: get("pubDate"),
      sourceName: get("source"),
    });
  }
  return items;
}

async function fetchGoogleNews(query: string, timespan: string, country: string, maxrecords: number): Promise<Article[]> {
  const when = timespanToGNewsWhen(timespan);
  const { hl, gl, ceid } = gnewsLocale(country);
  // Adiciona filtro temporal direto na query
  const q = `${query} when:${when}`;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=${hl}&gl=${gl}&ceid=${ceid}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/rss+xml, application/xml, text/xml, */*",
      "User-Agent": "Mozilla/5.0 (compatible; SentinelleMediaBot/1.0)",
    },
  });
  if (!res.ok) throw new Error(`Google News RSS ${res.status}`);
  const xml = await res.text();
  if (!xml) return [];
  const items = parseRssItems(xml);
  const lang = hl.toLowerCase();
  const sc = (gl || "BR").toUpperCase();
  return items.slice(0, maxrecords).map((it) => {
    const iso = it.pubDate ? new Date(it.pubDate).toISOString() : "";
    // Converter ISO para formato GDELT-like (YYYYMMDDTHHMMSSZ) para o front continuar usando parseGdeltDate
    const seen = iso ? iso.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z") : "";
    // O Google News injeta o nome do veículo no <source> ou no final do título: "Título - Veículo".
    // O `link` é um redirector (news.google.com/...), então usamos o nome do veículo como "domain".
    let title = it.title || "";
    let domain = it.sourceName || "";
    if (!domain) {
      const dash = title.lastIndexOf(" - ");
      if (dash > 10) {
        domain = title.slice(dash + 3).trim();
        title = title.slice(0, dash).trim();
      }
    } else {
      // Limpa " - Veículo" duplicado do título
      const suffix = ` - ${domain}`;
      if (title.endsWith(suffix)) title = title.slice(0, -suffix.length).trim();
    }
    if (!domain) domain = extractDomain(it.link || "") || "news.google.com";
    return {
      title,
      url: it.link || "",
      domain: domain.toLowerCase(),
      seendate: seen,
      language: lang,
      sourcecountry: sc,
      tone: null,
      source: "google_news" as const,
    };
  }).filter((a) => a.url && a.title);
}

/** Mescla artigos de múltiplas fontes deduplicando por URL e (fallback) título normalizado */
function mergeArticles(lists: Article[][]): Article[] {
  const seenUrl = new Set<string>();
  const seenTitle = new Set<string>();
  const out: Article[] = [];
  for (const list of lists) {
    for (const a of list) {
      const u = (a.url || "").split("?")[0].toLowerCase();
      const t = (a.title || "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 120);
      if (u && seenUrl.has(u)) continue;
      if (t && seenTitle.has(t)) continue;
      if (u) seenUrl.add(u);
      if (t) seenTitle.add(t);
      out.push(a);
    }
  }
  // Ordena por data desc
  return out.sort((a, b) => (b.seendate || "").localeCompare(a.seendate || ""));
}

async function fetchTimeline(query: string, timespan: string, country: string): Promise<Timeline[]> {
  const q = country && country !== "all" ? `${query} sourcecountry:${country}` : query;
  // TimelineVolInfo dá volume + tom médio em janelas
  const url = `${GDELT_BASE}?query=${encodeURIComponent(q)}&mode=TimelineVolInfo&format=json&timespan=${encodeURIComponent(timespan)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return [];
  const text = await res.text();
  if (!text) return [];
  let json: any;
  try { json = JSON.parse(text); } catch { return []; }
  const series = Array.isArray(json?.timeline) ? json.timeline : [];
  // Cada série tem .data: [{ date, value, ... }]
  const volSeries = series.find((s: any) => /vol/i.test(s.seriesname || s.series || "")) ?? series[0];
  const points: any[] = Array.isArray(volSeries?.data) ? volSeries.data : [];
  return points.map((p: any) => ({
    date: parseGdeltDate(String(p.date ?? "")),
    volume: Number(p.value ?? 0),
    tone: typeof p.tone === "number" ? p.tone : (p.tone != null ? Number(p.tone) : null),
  }));
}

function summarize(articles: Article[], timeline: Timeline[]) {
  // GDELT ArtList raramente devolve tom por artigo; usar timeline como fallback
  const articleTones = articles.map((a) => a.tone).filter((t): t is number => typeof t === "number" && !Number.isNaN(t));
  const timelineTones = timeline.map((p) => p.tone).filter((t): t is number => typeof t === "number" && !Number.isNaN(t));
  const tones = articleTones.length > 0 ? articleTones : timelineTones;
  const avg = tones.length ? tones.reduce((s, v) => s + v, 0) / tones.length : null;
  let pos = 0, neg = 0, neu = 0;
  for (const t of tones) {
    if (t >= 1.5) pos++;
    else if (t <= -1.5) neg++;
    else neu++;
  }
  const sourceCount = new Map<string, number>();
  for (const a of articles) {
    if (!a.domain) continue;
    sourceCount.set(a.domain, (sourceCount.get(a.domain) ?? 0) + 1);
  }
  const top_sources = [...sourceCount.entries()]
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  return {
    tone_summary: { avg, positives: pos, neutrals: neu, negatives: neg, total: tones.length },
    top_sources,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const query = (url.searchParams.get("query") || "").trim();
    const timespan = (url.searchParams.get("timespan") || "7d").trim();
    const country = (url.searchParams.get("country") || "BR").trim();
    const maxrecords = Math.min(Math.max(parseInt(url.searchParams.get("maxrecords") || "50", 10) || 50, 5), 100);
    const force = url.searchParams.get("force") === "1";
    // sources=gdelt,google_news (default: ambas)
    const sourcesParam = (url.searchParams.get("sources") || "gdelt,google_news")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s === "gdelt" || s === "google_news");
    const useGdelt = sourcesParam.includes("gdelt");
    const useGNews = sourcesParam.includes("google_news");
    const sourcesKey = sourcesParam.sort().join("+") || "gdelt";

    if (!query || query.length < 2) {
      return new Response(
        JSON.stringify({ error: "Informe ?query=tema (mínimo 2 caracteres)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!/^\d+(d|h)$/.test(timespan)) {
      return new Response(
        JSON.stringify({ error: "timespan inválido. Use ex: 24h, 3d, 7d, 14d, 30d" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supaUrl = Deno.env.get("SUPABASE_URL");
    const supaKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supaUrl || !supaKey) {
      return new Response(
        JSON.stringify({ error: "Configuração de servidor ausente" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const supa = createClient(supaUrl, supaKey);
    const cacheK = key(query, timespan, country, sourcesKey);

    if (!force) {
      const { data: row } = await supa
        .from("api_cache")
        .select("payload, expires_at")
        .eq("endpoint_key", cacheK)
        .maybeSingle();
      if (row && new Date(row.expires_at).getTime() > Date.now()) {
        return new Response(
          JSON.stringify({ data: row.payload, cached: true, source: SOURCE }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    let gdeltArticles: Article[] = [];
    let gnewsArticles: Article[] = [];
    let timeline: Timeline[] = [];
    const sourceWarnings: Record<string, string> = {};
    try {
      const tasks: Array<Promise<void>> = [];
      if (useGdelt) {
        tasks.push(
          fetchArticles(query, timespan, country, maxrecords)
            .then((a) => { gdeltArticles = a; })
            .catch((e) => { sourceWarnings.gdelt = String((e as Error).message); }),
        );
        tasks.push(
          fetchTimeline(query, timespan, country)
            .then((t) => { timeline = t; })
            .catch(() => { /* timeline é opcional */ }),
        );
      }
      if (useGNews) {
        tasks.push(
          fetchGoogleNews(query, timespan, country, maxrecords)
            .then((a) => { gnewsArticles = a; })
            .catch((e) => { sourceWarnings.google_news = String((e as Error).message); }),
        );
      }
      await Promise.all(tasks);
    } catch (err) {
      const { data: row } = await supa
        .from("api_cache")
        .select("payload")
        .eq("endpoint_key", cacheK)
        .maybeSingle();
      if (row) {
        return new Response(
          JSON.stringify({ data: row.payload, cached: true, stale: true, source: SOURCE, warning: String((err as Error).message) }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      throw err;
    }

    const articles = mergeArticles([gdeltArticles, gnewsArticles]);
    const { tone_summary, top_sources } = summarize(articles, timeline);
    const source_breakdown = {
      gdelt: gdeltArticles.length,
      google_news: gnewsArticles.length,
      merged: articles.length,
    };
    const data = {
      query,
      timespan,
      country,
      total_articles: articles.length,
      tone_summary,
      top_sources,
      timeline,
      articles: articles.slice(0, maxrecords),
      source_breakdown,
      sources_used: sourcesParam,
      source_warnings: Object.keys(sourceWarnings).length ? sourceWarnings : undefined,
      generated_at: new Date().toISOString(),
    };

    await supa.from("api_cache").upsert({
      endpoint_key: cacheK,
      source: SOURCE,
      payload: data as any,
      fetched_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + TTL_SECONDS * 1000).toISOString(),
    });

    return new Response(
      JSON.stringify({ data, cached: false, source: SOURCE }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "erro desconhecido";
    console.error("gdelt-media-fetch error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});