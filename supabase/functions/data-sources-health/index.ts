// deno-lint-ignore-file no-explicit-any
// Testa rapidamente a saúde de cada fonte de dados externa que o sistema usa
// e cruza com a "última atualização" no banco. Apenas Super-Admin.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPER_ADMIN_EMAIL = "lovableedits014@gmail.com";

type SourceResult = {
  id: string;
  name: string;
  category: "API automática" | "Upload manual";
  url: string;
  ok: boolean;
  status: number | null;
  latency_ms: number | null;
  message: string;
  last_update: string | null;
  records: number | null;
};

async function ping(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number | null; latency_ms: number; message: string }> {
  const start = Date.now();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    clearTimeout(t);
    return {
      ok: res.ok,
      status: res.status,
      latency_ms: Date.now() - start,
      message: res.ok ? "OK" : `HTTP ${res.status} ${res.statusText}`,
    };
  } catch (e: any) {
    return { ok: false, status: null, latency_ms: Date.now() - start, message: String(e?.message || e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if ((userData.user.email || "").toLowerCase() !== SUPER_ADMIN_EMAIL) {
      return new Response(JSON.stringify({ error: "Apenas o Super-Admin pode rodar diagnóstico." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Testes em paralelo para ser rápido
    const tests = await Promise.all([
      ping("https://servicodados.ibge.gov.br/api/v1/localidades/estados/MS/municipios"),
      ping("https://api.gdeltproject.org/api/v2/doc/doc?query=lula&mode=ArtList&maxrecords=1&format=json"),
      ping("https://brasilapi.com.br/api/feriados/v1/2026"),
      ping("https://cdn.tse.jus.br/estatistica/sead/odsele/eleitorado_locais_votacao/eleitorado_local_votacao_2024.zip", { method: "HEAD" }),
      ping("https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_candidato_munzona/votacao_candidato_munzona_2024.zip", { method: "HEAD" }),
      ping("https://graph.facebook.com/v21.0/", { method: "HEAD" }),
    ]);

    // Última atualização e contagem por fonte (no banco)
    const [zonaCount, localCount, ibgeCache, gdeltCache, holidaysCache] = await Promise.all([
      admin.from("tse_votacao_zona").select("created_at", { count: "exact", head: false }).order("created_at", { ascending: false }).limit(1),
      admin.from("tse_votacao_local").select("created_at", { count: "exact", head: false }).order("created_at", { ascending: false }).limit(1),
      admin.from("ibge_municipios" as any).select("updated_at", { count: "exact", head: false }).order("updated_at", { ascending: false }).limit(1).then((r: any) => r).catch(() => ({ data: null, count: null, error: { message: "tabela ausente" } })),
      admin.from("gdelt_articles" as any).select("created_at", { count: "exact", head: false }).order("created_at", { ascending: false }).limit(1).then((r: any) => r).catch(() => ({ data: null, count: null, error: null })),
      admin.from("holidays_cache" as any).select("created_at", { count: "exact", head: false }).order("created_at", { ascending: false }).limit(1).then((r: any) => r).catch(() => ({ data: null, count: null, error: null })),
    ]);

    const sources: SourceResult[] = [
      {
        id: "ibge", name: "IBGE — Municípios e Censo", category: "API automática",
        url: "servicodados.ibge.gov.br",
        ok: tests[0].ok, status: tests[0].status, latency_ms: tests[0].latency_ms, message: tests[0].message,
        last_update: (ibgeCache as any)?.data?.[0]?.updated_at ?? null,
        records: (ibgeCache as any)?.count ?? null,
      },
      {
        id: "gdelt", name: "GDELT — Mídia e Alertas", category: "API automática",
        url: "api.gdeltproject.org",
        ok: tests[1].ok, status: tests[1].status, latency_ms: tests[1].latency_ms, message: tests[1].message,
        last_update: (gdeltCache as any)?.data?.[0]?.created_at ?? null,
        records: (gdeltCache as any)?.count ?? null,
      },
      {
        id: "feriados", name: "Feriados Nacionais (Brasil API)", category: "API automática",
        url: "brasilapi.com.br",
        ok: tests[2].ok, status: tests[2].status, latency_ms: tests[2].latency_ms, message: tests[2].message,
        last_update: (holidaysCache as any)?.data?.[0]?.created_at ?? null,
        records: (holidaysCache as any)?.count ?? null,
      },
      {
        id: "tse_locais", name: "TSE — Locais de Votação (ZIP)", category: "Upload manual",
        url: "cdn.tse.jus.br/eleitorado_local_votacao",
        ok: tests[3].ok, status: tests[3].status, latency_ms: tests[3].latency_ms,
        message: tests[3].ok ? "CDN acessível" : `${tests[3].message} — use upload manual de ZIP`,
        last_update: (localCount as any)?.data?.[0]?.created_at ?? null,
        records: (localCount as any)?.count ?? null,
      },
      {
        id: "tse_resultados", name: "TSE — Resultados por Zona (ZIP)", category: "Upload manual",
        url: "cdn.tse.jus.br/votacao_candidato_munzona",
        ok: tests[4].ok, status: tests[4].status, latency_ms: tests[4].latency_ms,
        message: tests[4].ok ? "CDN acessível" : `${tests[4].message} — use upload manual de ZIP`,
        last_update: (zonaCount as any)?.data?.[0]?.created_at ?? null,
        records: (zonaCount as any)?.count ?? null,
      },
      {
        id: "meta", name: "Meta Graph API (Facebook/Instagram)", category: "API automática",
        url: "graph.facebook.com",
        ok: tests[5].ok || tests[5].status === 400, // Graph retorna 400 sem token, mas a conexão funcionou
        status: tests[5].status, latency_ms: tests[5].latency_ms,
        message: tests[5].status ? "Endpoint respondeu" : tests[5].message,
        last_update: null,
        records: null,
      },
    ];

    return new Response(JSON.stringify({ ok: true, checked_at: new Date().toISOString(), sources }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err?.message || err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});