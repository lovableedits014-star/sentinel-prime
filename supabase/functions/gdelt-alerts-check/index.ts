import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * gdelt-alerts-check
 * Varre regras ativas em media_alert_rules, consulta GDELT para cada uma e
 * dispara eventos quando os limiares (volume e/ou sentimento) são ultrapassados.
 *
 * Disparada por cron job (a cada 1h) ou manualmente (POST com body { rule_id }).
 */

const GDELT_BASE = "https://api.gdeltproject.org/api/v2/doc/doc";
const MAX_RUNTIME_MS = 50000;

type Article = {
  title: string;
  url: string;
  domain: string;
  seendate: string;
  tone: number | null;
};

type Rule = {
  id: string;
  client_id: string;
  name: string;
  is_active: boolean;
  keywords: string[];
  uf: string | null;
  municipio: string | null;
  country: string;
  language: string | null;
  domains: string[] | null;
  exclude_terms: string[] | null;
  timespan: string;
  alert_type: "volume" | "sentiment" | "both";
  min_volume: number;
  volume_growth_pct: number;
  negative_tone_threshold: number;
  negative_ratio_threshold: number;
  cooldown_minutes: number;
  last_triggered_at: string | null;
};

function buildBaseQuery(rule: Rule): string {
  const parts: string[] = [];
  const kw = (rule.keywords || []).map((t) => t.trim()).filter(Boolean);
  if (kw.length > 0) {
    const wrapped = kw.map((t) => (t.includes(" ") && !t.startsWith('"') ? `"${t}"` : t));
    parts.push(wrapped.length > 1 ? `(${wrapped.join(" OR ")})` : wrapped[0]);
  }
  if (rule.municipio) parts.push(`"${rule.municipio}"`);
  if (rule.uf) parts.push(rule.uf);
  if (rule.country && rule.country !== "all") parts.push(`sourcecountry:${rule.country}`);
  if (rule.language) parts.push(`sourcelang:${rule.language}`);
  if (rule.domains && rule.domains.length > 0) {
    const dom = rule.domains.map((d) => `domain:${d}`).join(" OR ");
    parts.push(rule.domains.length > 1 ? `(${dom})` : dom);
  }
  if (rule.exclude_terms && rule.exclude_terms.length > 0) {
    for (const t of rule.exclude_terms) parts.push(`-${t.includes(" ") ? `"${t}"` : t}`);
  }
  return parts.join(" ");
}

async function fetchArticles(query: string, timespan: string, max = 75): Promise<Article[]> {
  const url = `${GDELT_BASE}?query=${encodeURIComponent(query)}&mode=ArtList&format=json&maxrecords=${max}&timespan=${encodeURIComponent(timespan)}&sort=DateDesc`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return [];
  const text = await res.text();
  if (!text) return [];
  let json: any;
  try { json = JSON.parse(text); } catch { return []; }
  const arts = Array.isArray(json?.articles) ? json.articles : [];
  return arts.map((a: any) => ({
    title: a.title || "",
    url: a.url || "",
    domain: a.domain || "",
    seendate: a.seendate || "",
    tone: typeof a.tone === "number" ? a.tone : a.tone ? Number(a.tone) : null,
  }));
}

/** Janela anterior (mesma duração) para comparar crescimento. Aproxima por 'timespan'. */
function previousTimespan(ts: string): string {
  // Para checagem simples: contar volume da janela anterior usando a própria janela duplicada e subtraindo.
  // O GDELT não permite janela arbitrária facilmente; aqui usamos o dobro do timespan para inferir o anterior.
  const m = ts.match(/^(\d+)([hd])$/);
  if (!m) return ts;
  const n = parseInt(m[1]);
  return `${n * 2}${m[2]}`;
}

function summarize(articles: Article[]) {
  const tones = articles.map((a) => a.tone).filter((t): t is number => typeof t === "number");
  const avg = tones.length ? tones.reduce((a, b) => a + b, 0) / tones.length : null;
  let positives = 0, negatives = 0, neutrals = 0;
  for (const t of tones) {
    if (t >= 1.5) positives++;
    else if (t <= -1.5) negatives++;
    else neutrals++;
  }
  return { avg, positives, negatives, neutrals };
}

function evaluate(rule: Rule, current: Article[], previousTotal: number) {
  const total = current.length;
  const sum = summarize(current);
  const negRatio = total > 0 ? sum.negatives / total : 0;

  // Crescimento: previousTotal aqui é o total da janela DUPLA → janela anterior = previousTotal - total
  const prevWindow = Math.max(0, previousTotal - total);
  const growth = prevWindow > 0 ? ((total - prevWindow) / prevWindow) * 100 : (total >= rule.min_volume ? 999 : 0);

  let volumeFired = false;
  let sentimentFired = false;

  if (rule.alert_type === "volume" || rule.alert_type === "both") {
    if (total >= rule.min_volume && growth >= rule.volume_growth_pct) volumeFired = true;
  }
  if (rule.alert_type === "sentiment" || rule.alert_type === "both") {
    if (total >= Math.max(3, Math.floor(rule.min_volume / 3))) {
      const toneBad = sum.avg !== null && sum.avg <= rule.negative_tone_threshold;
      const ratioBad = negRatio >= rule.negative_ratio_threshold;
      if (toneBad || ratioBad) sentimentFired = true;
    }
  }

  if (!volumeFired && !sentimentFired) return null;

  const kind = volumeFired && sentimentFired ? "both" : volumeFired ? "volume_spike" : "negative_sentiment";
  // Severidade
  let severity: "info" | "aviso" | "critico" = "aviso";
  if (growth >= 200 || negRatio >= 0.7) severity = "critico";
  else if (growth < 100 && negRatio < 0.5) severity = "info";

  return {
    kind,
    severity,
    total,
    prevWindow,
    growth,
    sum,
    negRatio,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const start = Date.now();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Suporta execução manual de uma única regra
  let onlyRuleId: string | null = null;
  if (req.method === "POST") {
    try {
      const body = await req.json();
      onlyRuleId = body?.rule_id || null;
    } catch {/* ignora */}
  }

  let q = supabase
    .from("media_alert_rules")
    .select("*")
    .eq("is_active", true);
  if (onlyRuleId) q = q.eq("id", onlyRuleId);

  const { data: rules, error } = await q;
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: any[] = [];
  for (const rule of (rules as Rule[]) || []) {
    if (Date.now() - start > MAX_RUNTIME_MS) break;

    // Cooldown
    if (!onlyRuleId && rule.last_triggered_at) {
      const diffMin = (Date.now() - new Date(rule.last_triggered_at).getTime()) / 60000;
      if (diffMin < rule.cooldown_minutes) {
        results.push({ rule: rule.id, skipped: "cooldown" });
        continue;
      }
    }

    const baseQuery = buildBaseQuery(rule);
    if (baseQuery.length < 2) {
      results.push({ rule: rule.id, skipped: "empty_query" });
      continue;
    }

    try {
      const [current, previousDouble] = await Promise.all([
        fetchArticles(baseQuery, rule.timespan, 75),
        fetchArticles(baseQuery, previousTimespan(rule.timespan), 150),
      ]);

      const evalResult = evaluate(rule, current, previousDouble.length);

      // Atualiza last_checked_at sempre
      await supabase
        .from("media_alert_rules")
        .update({ last_checked_at: new Date().toISOString() })
        .eq("id", rule.id);

      if (!evalResult) {
        results.push({ rule: rule.id, fired: false, total: current.length });
        continue;
      }

      const samples = current.slice(0, 5).map((a) => ({
        title: a.title, url: a.url, domain: a.domain, tone: a.tone, seendate: a.seendate,
      }));

      const { error: insErr } = await supabase.from("media_alert_events").insert({
        client_id: rule.client_id,
        rule_id: rule.id,
        rule_name: rule.name,
        trigger_kind: evalResult.kind,
        severity: evalResult.severity,
        total_articles: evalResult.total,
        previous_articles: evalResult.prevWindow,
        growth_pct: Number(evalResult.growth.toFixed(2)),
        avg_tone: evalResult.sum.avg !== null ? Number(evalResult.sum.avg.toFixed(2)) : null,
        negatives: evalResult.sum.negatives,
        positives: evalResult.sum.positives,
        neutrals: evalResult.sum.neutrals,
        negative_ratio: Number(evalResult.negRatio.toFixed(3)),
        query_snapshot: baseQuery,
        sample_articles: samples,
      });

      if (!insErr) {
        await supabase
          .from("media_alert_rules")
          .update({ last_triggered_at: new Date().toISOString() })
          .eq("id", rule.id);
      }

      results.push({ rule: rule.id, fired: true, kind: evalResult.kind, severity: evalResult.severity });
    } catch (err) {
      results.push({ rule: rule.id, error: String(err) });
    }
  }

  return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});