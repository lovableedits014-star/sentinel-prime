// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" };
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const TSE_BASE = "https://resultados.tse.jus.br/oficial/ele2026";
const PLEITO = 3220;
const YEAR = 2026;
const TURN = 1;
const FETCH_CONCURRENCY = 6;
const UPSERT_BATCH = 500;

type CargoConfig = { code: string; name: string; election: number };

const CARGOS: Record<string, CargoConfig> = {
  "0001": { code: "0001", name: "Presidente", election: 6257 },
  "0003": { code: "0003", name: "Governador", election: 6259 },
  "0005": { code: "0005", name: "Senador", election: 6259 },
  "0006": { code: "0006", name: "Deputado Federal", election: 6259 },
  "0007": { code: "0007", name: "Deputado Estadual", election: 6259 },
};

type ZoneTarget = { municipalityCode: string; municipalityName: string; zoneCode: string };
type VoteRow = {
  ano: number;
  turno: number;
  cargo: string;
  cod_municipio: number;
  municipio: string;
  uf: string;
  zona: number;
  numero: number;
  nome_urna: string | null;
  nome_completo: string | null;
  partido: string | null;
  situacao: string | null;
  votos: number;
  seq_candidato: number | null;
  percentual: number | null;
  eleicao: number;
  pleito: number;
  tse_idg: number | null;
  tse_generated_at: string | null;
  source: string;
  sync_id: string;
};

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders });

const toInt = (value: unknown) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : 0;
};
const toNullableInt = (value: unknown) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
};
const toDecimal = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number.parseFloat(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};
const padElection = (election: number) => String(election).padStart(6, "0");

async function fetchJson(url: string, attempts = 3): Promise<any> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "SentinelPrime-TSE-Sync/1.0" },
      });
      if (!response.ok) throw new Error(`TSE respondeu HTTP ${response.status} para ${url}`);
      return await response.json();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    }
  }
  throw lastError || new Error(`Falha ao consultar ${url}`);
}

function getZoneTargets(config: any, uf: string): ZoneTarget[] {
  const scope = (config?.abr || []).find(
    (item: any) => String(item?.cd || "").toUpperCase() === uf,
  );
  if (!scope) throw new Error(`UF ${uf} nao encontrada no arquivo EA16 do TSE.`);
  const targets: ZoneTarget[] = [];
  for (const municipality of scope.mu || []) {
    const municipalityCode = String(municipality?.cd || "").padStart(5, "0");
    const municipalityName = String(municipality?.nm || "")
      .trim()
      .toUpperCase();
    for (const zone of municipality?.zon || []) {
      targets.push({
        municipalityCode,
        municipalityName,
        zoneCode: String(zone?.cd || "").padStart(4, "0"),
      });
    }
  }
  return targets;
}

function flattenResult(
  payload: any,
  target: ZoneTarget,
  uf: string,
  cargo: CargoConfig,
  syncId: string,
): VoteRow[] {
  const rows: VoteRow[] = [];
  const generatedAt = payload?.dg && payload?.hg ? `${payload.dg} ${payload.hg}` : null;
  const idg = toNullableInt(payload?.idg);
  for (const cargoNode of payload?.carg || []) {
    for (const aggregation of cargoNode?.agr || []) {
      for (const party of aggregation?.par || []) {
        for (const candidate of party?.cand || []) {
          const number = toInt(candidate?.n);
          if (!number) continue;
          rows.push({
            ano: YEAR,
            turno: TURN,
            cargo: cargo.name,
            cod_municipio: toInt(target.municipalityCode),
            municipio: target.municipalityName,
            uf,
            zona: toInt(target.zoneCode),
            numero: number,
            nome_urna: candidate?.nmu ? String(candidate.nmu).trim() : null,
            nome_completo: candidate?.nm ? String(candidate.nm).trim() : null,
            partido: party?.sg ? String(party.sg).trim() : null,
            situacao: candidate?.st
              ? String(candidate.st).trim()
              : candidate?.dvt
                ? String(candidate.dvt).trim()
                : null,
            votos: toInt(candidate?.vap),
            seq_candidato: toNullableInt(candidate?.sqcand),
            percentual: toDecimal(candidate?.pvap),
            eleicao: cargo.election,
            pleito: PLEITO,
            tse_idg: idg,
            tse_generated_at: generatedAt,
            source: "resultados_tse_ea20",
            sync_id: syncId,
          });
        }
      }
    }
  }
  return rows;
}

async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function assertSuperAdmin(req: Request) {
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) throw new Error("Nao autenticado.");
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) throw new Error("Sessao invalida.");
  const { data: isSuperAdmin, error: adminError } = await userClient.rpc("is_super_admin");
  if (adminError || !isSuperAdmin)
    throw new Error("Apenas o Super Admin pode sincronizar resultados do TSE.");
  return userData.user;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ error: "Metodo nao permitido." }, 405);
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  let runId: string | null = null;
  try {
    const user = await assertSuperAdmin(req);
    const body = await req.json().catch(() => ({}));
    const uf = String(body?.uf || "MS")
      .trim()
      .toUpperCase();
    const cargoCode = String(body?.cargo_codigo || "0006").padStart(4, "0");
    const cargo = CARGOS[cargoCode];
    if (uf !== "MS")
      return respond({ error: "A primeira versao da integracao oficial esta limitada a MS." }, 400);
    if (!cargo) return respond({ error: `Cargo invalido: ${cargoCode}` }, 400);

    const syncId = crypto.randomUUID();
    runId = syncId;
    const { error: runError } = await admin.from("tse_sync_runs").insert({
      id: syncId,
      ano: YEAR,
      turno: TURN,
      uf,
      cargo: cargo.name,
      cargo_codigo: cargo.code,
      eleicao: cargo.election,
      pleito: PLEITO,
      status: "running",
      created_by: user.id,
    });
    if (runError)
      throw new Error(`Nao foi possivel iniciar a auditoria da carga: ${runError.message}`);

    const ufLower = uf.toLowerCase();
    const sectionConfigUrl = `${TSE_BASE}/arquivo-urna/${PLEITO}/config/${ufLower}/${ufLower}-p${String(PLEITO).padStart(6, "0")}-cs.json`;
    const sectionConfig = await fetchJson(sectionConfigUrl);
    const targets = getZoneTargets(sectionConfig, uf);
    if (targets.length === 0) throw new Error(`Nenhuma zona eleitoral encontrada para ${uf}.`);

    const electionPadded = padElection(cargo.election);
    const batches = await mapConcurrent(targets, FETCH_CONCURRENCY, async (target) => {
      const fileName = `${ufLower}${target.municipalityCode}-z${target.zoneCode}-c${cargo.code}-e${electionPadded}-u.json`;
      const payload = await fetchJson(`${TSE_BASE}/${cargo.election}/dados/${ufLower}/${fileName}`);
      return flattenResult(payload, target, uf, cargo, syncId);
    });
    const rows = batches.flat();
    if (rows.length === 0)
      throw new Error(`O TSE nao retornou candidatos para ${cargo.name}/${uf}.`);

    let imported = 0;
    for (let offset = 0; offset < rows.length; offset += UPSERT_BATCH) {
      const batch = rows.slice(offset, offset + UPSERT_BATCH);
      const { error } = await admin
        .from("tse_votacao_zona")
        .upsert(batch, { onConflict: "ano,turno,cargo,cod_municipio,zona,numero" });
      if (error)
        throw new Error(
          `Falha ao gravar lote ${Math.floor(offset / UPSERT_BATCH) + 1}: ${error.message}`,
        );
      imported += batch.length;
    }

    const { error: cleanupError } = await admin
      .from("tse_votacao_zona")
      .delete()
      .eq("ano", YEAR)
      .eq("turno", TURN)
      .eq("uf", uf)
      .eq("cargo", cargo.name)
      .or(`sync_id.neq.${syncId},sync_id.is.null`);
    if (cleanupError)
      throw new Error(
        `Carga concluida, mas a limpeza da versao anterior falhou: ${cleanupError.message}`,
      );

    const municipalities = new Set(targets.map((item) => item.municipalityCode)).size;
    const { error: finishError } = await admin
      .from("tse_sync_runs")
      .update({
        status: "success",
        municipalities,
        zones: targets.length,
        rows_imported: imported,
        tse_files: targets.length,
        finished_at: new Date().toISOString(),
      })
      .eq("id", syncId);
    if (finishError) console.error("Falha ao finalizar auditoria:", finishError.message);

    return respond({
      ok: true,
      ano: YEAR,
      turno: TURN,
      uf,
      cargo: cargo.name,
      cargo_codigo: cargo.code,
      eleicao: cargo.election,
      pleito: PLEITO,
      municipalities,
      zones: targets.length,
      files: targets.length,
      inserted: imported,
      sync_id: syncId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("sync-tse-2026:", message);
    if (runId) {
      await admin
        .from("tse_sync_runs")
        .update({
          status: "error",
          error_message: message.slice(0, 2000),
          finished_at: new Date().toISOString(),
        })
        .eq("id", runId);
    }
    return respond({ error: message }, /autenticado|Sessao|Super Admin/i.test(message) ? 403 : 500);
  }
});
