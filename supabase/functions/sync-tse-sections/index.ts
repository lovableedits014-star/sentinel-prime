// deno-lint-ignore-file no-explicit-any
import * as asn1js from "npm:asn1js@3.0.10";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" };
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ADMIN_SYNC_TOKEN = Deno.env.get("TSE_SYNC_ADMIN_TOKEN") || "";
const YEAR = 2026;
const TURN = 1;
const PLEITO = 3220;
const ELECTIONS = new Set([6257, 6259]);
const TSE_BASE = "https://resultados.tse.jus.br/oficial/ele2026";
const MAX_BATCH = 80;
const FETCH_CONCURRENCY = 8;
const UPSERT_BATCH = 1000;

type SectionTarget = { zone: string; section: string; aggregated: number[] };
type VoteRow = {
  ano: number;
  turno: number;
  pleito: number;
  eleicao: number;
  uf: string;
  cod_municipio: number;
  municipio: string;
  zona: number;
  secao: number;
  secoes_agregadas: number[];
  nr_local: number;
  cargo: number;
  numero: number;
  partido_numero: number | null;
  votos: number;
  tse_hash: string;
  source: string;
  updated_at: string;
};

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders });
const children = (node: any): any[] =>
  Array.isArray(node?.valueBlock?.value) ? node.valueBlock.value : [];
const isUniversal = (node: any, tag: number) =>
  node?.idBlock?.tagClass === 1 && node?.idBlock?.tagNumber === tag;
const isContext = (node: any, tag: number) =>
  node?.idBlock?.tagClass === 3 && node?.idBlock?.tagNumber === tag;

function integerValue(node: any): number {
  if (!node) return 0;
  if (node.valueBlock?.valueDec !== undefined) return Number(node.valueBlock.valueDec);
  let value = 0;
  for (const byte of node.valueBlock?.valueHexView || []) value = value * 256 + byte;
  return value;
}

function findElectionResults(rootChildren: any[]) {
  return rootChildren.find(
    (node) =>
      isUniversal(node, 16) &&
      children(node).some((election) => {
        const id = integerValue(children(election)[0]);
        return id === 6257 || id === 6259;
      }),
  );
}

function decodeBu(
  encoded: ArrayBuffer,
  target: SectionTarget,
  municipalityCode: number,
  municipalityName: string,
  uf: string,
  hash: string,
): VoteRow[] {
  const envelope = asn1js.fromBER(encoded);
  if (envelope.offset === -1) throw new Error(`Envelope ASN.1 invalido: ${envelope.result.error}`);
  const content = children(envelope.result).find((node) => isUniversal(node, 4));
  if (!content) throw new Error("Envelope do BU sem conteudo.");
  const contentBytes = content.valueBlock.valueHexView.slice();
  const decoded = asn1js.fromBER(contentBytes.buffer);
  if (decoded.offset === -1) throw new Error(`BU ASN.1 invalido: ${decoded.result.error}`);

  const root = children(decoded.result);
  const sectionIdentification = root.find((node) => {
    const fields = children(node);
    const municipalityZone = children(fields[0]);
    return (
      municipalityZone.length >= 2 &&
      integerValue(municipalityZone[0]) === municipalityCode &&
      integerValue(municipalityZone[1]) === Number(target.zone)
    );
  });
  const identificationFields = children(sectionIdentification);
  const localNumber = integerValue(identificationFields[1]);
  const sectionNumber = integerValue(identificationFields[2]);
  if (!localNumber || !sectionNumber) throw new Error("BU sem identificacao de local/secao.");

  const elections = findElectionResults(root);
  if (!elections) throw new Error("BU sem resultados por eleicao.");
  const rows: VoteRow[] = [];
  const now = new Date().toISOString();
  const electionItems = children(elections).filter((item) =>
    ELECTIONS.has(integerValue(children(item)[0])),
  );
  if (!electionItems.length) throw new Error("Eleicoes 6257/6259 ausentes no BU.");
  for (const election of electionItems) {
    const electionId = integerValue(children(election)[0]);
    const voteResults = children(election).find(
      (node, index) =>
        index >= 2 &&
        isUniversal(node, 16) &&
        children(node).some((result) => isUniversal(children(result)[0], 10)),
    );
    if (!voteResults) continue;
    for (const result of children(voteResults)) {
      const cargoGroups = children(result).find(
        (node, index) => index >= 2 && isUniversal(node, 16),
      );
      if (!cargoGroups) continue;
      for (const cargoGroup of children(cargoGroups)) {
        const cargoFields = children(cargoGroup);
        const cargo = integerValue(cargoFields[0]);
        if (![1, 3, 5, 6, 7].includes(cargo)) continue;
        const candidateVotes = cargoFields.find(
          (node, index) => index >= 2 && isUniversal(node, 16),
        );
        if (!candidateVotes) continue;
        for (const vote of children(candidateVotes)) {
          const voteFields = children(vote);
          if (integerValue(voteFields.find((node) => isContext(node, 1))) !== 1) continue;
          const candidate = voteFields.find((node) => isContext(node, 3));
          if (!candidate) continue;
          const candidateFields = children(candidate);
          const number = integerValue(candidateFields[1]);
          if (!number) continue;
          rows.push({
            ano: YEAR,
            turno: TURN,
            pleito: PLEITO,
            eleicao: electionId,
            uf,
            cod_municipio: municipalityCode,
            municipio: municipalityName,
            zona: Number(target.zone),
            secao: sectionNumber,
            secoes_agregadas: target.aggregated,
            nr_local: localNumber,
            cargo,
            numero: number,
            partido_numero: integerValue(candidateFields[0]) || null,
            votos: integerValue(voteFields.find((node) => isContext(node, 2))),
            tse_hash: hash,
            source: "resultados_tse_bu",
            updated_at: now,
          });
        }
      }
    }
  }
  return rows;
}

async function fetchWithRetry(url: string, kind: "json" | "binary", attempts = 3) {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { Accept: kind === "json" ? "application/json" : "application/octet-stream" },
      });
      if (!response.ok) throw new Error(`TSE respondeu HTTP ${response.status}`);
      return kind === "json" ? await response.json() : await response.arrayBuffer();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 300));
    }
  }
  throw new Error(`${lastError?.message || "Falha ao consultar o TSE"}: ${url}`);
}

async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
) {
  const output = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (true) {
        const index = cursor++;
        if (index >= items.length) return;
        output[index] = await mapper(items[index]);
      }
    }),
  );
  return output;
}

async function assertAuthenticated(req: Request) {
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) throw new Error("Nao autenticado.");
  const token = authorization.slice(7);
  if (token === SERVICE_KEY) return;
  const adminSyncToken = req.headers.get("x-tse-sync-token") || "";
  if (ADMIN_SYNC_TOKEN && adminSyncToken === ADMIN_SYNC_TOKEN) return;
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authorization } },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("Sessao invalida.");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ error: "Metodo nao permitido." }, 405);
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  let municipalityCode = 0;
  let municipalityName = "";
  let uf = "MS";
  try {
    await assertAuthenticated(req);
    const body = await req.json().catch(() => ({}));
    uf = String(body?.uf || "MS")
      .trim()
      .toUpperCase();
    municipalityCode = Number.parseInt(String(body?.cod_municipio || ""), 10);
    const requestedBatch = Number.parseInt(String(body?.batch_size || 60), 10);
    const batchSize = Math.max(1, Math.min(MAX_BATCH, requestedBatch || 60));
    if (uf !== "MS") throw new Error("A sincronizacao por secao esta limitada a MS.");
    if (!municipalityCode) throw new Error("Municipio invalido.");

    const ufLower = uf.toLowerCase();
    const configUrl = `${TSE_BASE}/arquivo-urna/${PLEITO}/config/${ufLower}/${ufLower}-p${String(PLEITO).padStart(6, "0")}-cs.json`;
    const config = (await fetchWithRetry(configUrl, "json")) as any;
    const scope = (config?.abr || []).find(
      (item: any) => String(item?.cd || "").toUpperCase() === uf,
    );
    const municipality = (scope?.mu || []).find(
      (item: any) => Number.parseInt(String(item?.cd || ""), 10) === municipalityCode,
    );
    if (!municipality) throw new Error(`Municipio ${municipalityCode} nao encontrado no TSE.`);
    municipalityName = String(municipality.nm || "")
      .trim()
      .toUpperCase();

    const allSections: SectionTarget[] = [];
    let totalSections = 0;
    for (const zone of municipality.zon || []) {
      for (const section of zone.sec || []) {
        totalSections++;
        if (section.nsp !== undefined && section.nsp !== null && String(section.nsp) !== "")
          continue;
        allSections.push({
          zone: String(zone.cd || "").padStart(4, "0"),
          section: String(section.ns || "").padStart(4, "0"),
          aggregated: Array.isArray(section.nsa)
            ? section.nsa
                .map((value: unknown) => Number.parseInt(String(value), 10))
                .filter(Boolean)
            : [],
        });
      }
    }

    const { data: currentStatus } = await admin
      .from("tse_secao_sync_status")
      .select("proximo_cursor")
      .eq("ano", YEAR)
      .eq("turno", TURN)
      .eq("uf", uf)
      .eq("cod_municipio", municipalityCode)
      .maybeSingle();
    const requestedCursor = body?.restart === true ? 0 : Number(currentStatus?.proximo_cursor || 0);
    const cursor = Math.max(0, Math.min(requestedCursor, allSections.length));
    const batch = allSections.slice(cursor, cursor + batchSize);

    await admin.from("tse_secao_sync_status").upsert({
      ano: YEAR,
      turno: TURN,
      uf,
      cod_municipio: municipalityCode,
      municipio: municipalityName,
      status: "running",
      total_secoes: totalSections,
      secoes_principais: allSections.length,
      secoes_processadas: cursor,
      proximo_cursor: cursor,
      erro: null,
      updated_at: new Date().toISOString(),
    });
    if (batch.length === 0) {
      await admin.from("tse_secao_sync_status").upsert({
        ano: YEAR,
        turno: TURN,
        uf,
        cod_municipio: municipalityCode,
        municipio: municipalityName,
        status: "success",
        total_secoes: totalSections,
        secoes_principais: allSections.length,
        secoes_processadas: allSections.length,
        proximo_cursor: allSections.length,
        erro: null,
        updated_at: new Date().toISOString(),
      });
      return respond({
        ok: true,
        complete: true,
        processed: allSections.length,
        total: allSections.length,
      });
    }

    const decoded = await mapConcurrent(batch, FETCH_CONCURRENCY, async (target) => {
      const auxName = `p${String(PLEITO).padStart(6, "0")}-${ufLower}-m${String(municipalityCode).padStart(5, "0")}-z${target.zone}-s${target.section}-aux.json`;
      const base = `${TSE_BASE}/arquivo-urna/${PLEITO}/dados/${ufLower}/${String(municipalityCode).padStart(5, "0")}/${target.zone}/${target.section}`;
      const aux = (await fetchWithRetry(`${base}/${auxName}`, "json")) as any;
      const latest = (aux?.hashes || []).at(-1);
      const buFile = (latest?.arq || []).find((file: any) => file?.tp === "bu")?.nm;
      if (!latest?.hash || !buFile)
        throw new Error(`BU nao encontrado para ${target.zone}/${target.section}.`);
      const binary = (await fetchWithRetry(
        `${base}/${latest.hash}/${buFile}`,
        "binary",
      )) as ArrayBuffer;
      return decodeBu(binary, target, municipalityCode, municipalityName, uf, String(latest.hash));
    });
    const rows = decoded.flat();

    for (const zone of new Set(batch.map((item) => item.zone))) {
      const sections = batch
        .filter((item) => item.zone === zone)
        .map((item) => Number(item.section));
      const { error } = await admin
        .from("tse_votacao_secao")
        .delete()
        .eq("ano", YEAR)
        .eq("turno", TURN)
        .eq("uf", uf)
        .eq("cod_municipio", municipalityCode)
        .eq("zona", Number(zone))
        .in("secao", sections);
      if (error)
        throw new Error(`Falha ao substituir secoes da zona ${Number(zone)}: ${error.message}`);
    }
    for (let offset = 0; offset < rows.length; offset += UPSERT_BATCH) {
      const { error } = await admin
        .from("tse_votacao_secao")
        .upsert(rows.slice(offset, offset + UPSERT_BATCH), {
          onConflict: "ano,turno,cod_municipio,zona,secao,cargo,numero",
        });
      if (error) throw new Error(`Falha ao gravar votos por secao: ${error.message}`);
    }

    const nextCursor = cursor + batch.length;
    const complete = nextCursor >= allSections.length;
    const { error: statusError } = await admin.from("tse_secao_sync_status").upsert({
      ano: YEAR,
      turno: TURN,
      uf,
      cod_municipio: municipalityCode,
      municipio: municipalityName,
      status: complete ? "success" : "partial",
      total_secoes: totalSections,
      secoes_principais: allSections.length,
      secoes_processadas: nextCursor,
      proximo_cursor: nextCursor,
      erro: null,
      updated_at: new Date().toISOString(),
    });
    if (statusError) throw new Error(`Falha ao atualizar progresso: ${statusError.message}`);
    return respond({
      ok: true,
      complete,
      municipio: municipalityName,
      cod_municipio: municipalityCode,
      processed: nextCursor,
      total: allSections.length,
      official_sections: totalSections,
      batch_sections: batch.length,
      rows_imported: rows.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("sync-tse-sections:", message);
    if (municipalityCode && municipalityName) {
      await admin.from("tse_secao_sync_status").upsert({
        ano: YEAR,
        turno: TURN,
        uf,
        cod_municipio: municipalityCode,
        municipio: municipalityName,
        status: "error",
        erro: message.slice(0, 2000),
        updated_at: new Date().toISOString(),
      });
    }
    return respond({ error: message }, /autenticado|Sessao/i.test(message) ? 403 : 500);
  }
});
