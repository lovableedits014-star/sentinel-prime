// deno-lint-ignore-file no-explicit-any
// Importação resiliente de locais TSE: o navegador lê o CSV localmente e envia
// apenas lotes pequenos para esta função. Assim não há ZIP/CSV gigante dentro da Edge Function.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPER_ADMIN_EMAIL = "lovableedits014@gmail.com";
const MAX_ROWS_PER_BATCH = 1000;

type LocalPayload = {
  ano: number;
  turno?: number;
  cargo?: string;
  cod_municipio: number;
  municipio: string;
  uf: string;
  zona: number;
  nr_local: number;
  nome_local?: string | null;
  endereco?: string | null;
  numero?: number;
  nome_candidato?: string | null;
  votos?: number;
  bairro?: string | null;
};

const textOrNull = (value: unknown, max = 500) => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed.slice(0, max) : null;
};

const toInt = (value: unknown) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

function normalizeRows(rows: unknown, anoFallback: number, ufFallback: string) {
  if (!Array.isArray(rows)) throw new Error("Campo 'rows' deve ser uma lista.");
  if (rows.length === 0) throw new Error("Nenhum local recebido no lote.");
  if (rows.length > MAX_ROWS_PER_BATCH) throw new Error(`Lote grande demais. Envie no máximo ${MAX_ROWS_PER_BATCH} locais por chamada.`);

  const dedup = new Map<string, Required<LocalPayload>>();
  for (const raw of rows as LocalPayload[]) {
    const ano = toInt(raw?.ano || anoFallback);
    const codMunicipio = toInt(raw?.cod_municipio);
    const zona = toInt(raw?.zona);
    const nrLocal = toInt(raw?.nr_local);
    const municipio = textOrNull(raw?.municipio, 120);
    const uf = (textOrNull(raw?.uf || ufFallback, 2) || ufFallback).toUpperCase();

    if (!ano || !codMunicipio || !zona || !nrLocal || !municipio || uf.length !== 2) continue;

    const row: Required<LocalPayload> = {
      ano,
      turno: toInt(raw?.turno) || 0,
      cargo: textOrNull(raw?.cargo, 40) || "CADASTRO",
      cod_municipio: codMunicipio,
      municipio,
      uf,
      zona,
      nr_local: nrLocal,
      nome_local: textOrNull(raw?.nome_local, 300),
      endereco: textOrNull(raw?.endereco, 500),
      numero: toInt(raw?.numero) || 0,
      nome_candidato: textOrNull(raw?.nome_candidato, 200),
      votos: toInt(raw?.votos) || 0,
      bairro: textOrNull(raw?.bairro, 180),
    };

    const key = `${row.ano}|${row.turno}|${row.cargo}|${row.cod_municipio}|${row.zona}|${row.nr_local}|${row.numero}`;
    dedup.set(key, row);
  }

  return Array.from(dedup.values());
}

async function assertSuperAdmin(req: Request) {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return { error: "Não autenticado", status: 401 } as const;
  }

  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) {
    return { error: "Sessão inválida", status: 401 } as const;
  }
  if ((userData.user.email || "").toLowerCase() !== SUPER_ADMIN_EMAIL) {
    return { error: "Apenas o Super-Admin pode importar locais TSE.", status: 403 } as const;
  }

  return { user: userData.user } as const;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = await assertSuperAdmin(req);
    if ("error" in auth) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: auth.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const ano = toInt(body?.ano) || 2024;
    const uf = String(body?.uf || "MS").toUpperCase().slice(0, 2);
    const rows = normalizeRows(body?.rows, ano, uf);

    if (rows.length === 0) {
      return new Response(JSON.stringify({ ok: true, inserted: 0, ignored: Array.isArray(body?.rows) ? body.rows.length : 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { error } = await admin
      .from("tse_votacao_local")
      .upsert(rows, { onConflict: "ano,turno,cargo,cod_municipio,zona,nr_local,numero" });

    if (error) {
      console.error("Erro ao gravar lote TSE locais:", error.message);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, inserted: rows.length, ignored: (body?.rows?.length || 0) - rows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro fatal import-tse-locais:", err);
    return new Response(JSON.stringify({ error: String((err as any)?.message || err) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
