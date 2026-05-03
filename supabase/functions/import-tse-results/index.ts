// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { HttpReader, BlobReader, ZipReader, Uint8ArrayWriter, configure } from "https://deno.land/x/zipjs@v2.7.45/index.js";

// Desliga workers (não funcionam bem em edge functions Deno)
configure({ useWebWorkers: false });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPER_ADMIN_EMAIL = "lovableedits014@gmail.com";

// Mapeamos por NOME de coluna (cabeçalho do CSV) em vez de índice — o layout
// muda entre anos do TSE (2022 tem federações, 2018 não, etc).

function parseCsvLine(line: string): string[] {
  // CSV do TSE: separador ';' e campos entre aspas duplas
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ';' && !inQuotes) {
      out.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function decodeLatin1(buf: Uint8Array): string {
  // Os CSVs do TSE são em ISO-8859-1
  return new TextDecoder("iso-8859-1").decode(buf);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Cliente com token do usuário p/ validar identidade
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if ((userData.user.email || "").toLowerCase() !== SUPER_ADMIN_EMAIL) {
      return new Response(JSON.stringify({ error: "Apenas o Super-Admin pode importar dados do TSE." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { ano = 2022, uf = "MS", storage_path } = await req.json().catch(() => ({}));
    const anoNum = Number(ano);
    const ufStr = String(uf).toUpperCase();
    if (![2018, 2020, 2022, 2024].includes(anoNum)) {
      return new Response(JSON.stringify({ error: "Ano inválido" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Estratégia 1: storage_path (upload manual) — usado quando o CDN do TSE bloqueia.
    // Estratégia 2 (fallback): tenta direto do CDN com range requests.
    let reader: any;
    if (storage_path && typeof storage_path === "string") {
      console.log("Lendo ZIP do Storage:", storage_path);
      const { data: fileBlob, error: dlErr } = await admin.storage.from("tse-imports").download(storage_path);
      if (dlErr || !fileBlob) {
        return new Response(JSON.stringify({ error: `Falha ao ler ZIP do Storage: ${dlErr?.message || "arquivo não encontrado"}` }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      console.log("ZIP carregado:", fileBlob.size, "bytes");
      reader = new ZipReader(new BlobReader(fileBlob));
    } else {
      const zipUrl = `https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_candidato_munzona/votacao_candidato_munzona_${anoNum}.zip`;
      console.log("Abrindo ZIP via HTTP range:", zipUrl);
      reader = new ZipReader(new HttpReader(zipUrl, { useRangeHeader: true, preventHeadRequest: false }));
    }
    const entries = await reader.getEntries();
    console.log("Entries no ZIP:", entries.length);
    const target = entries.find((e: any) => e.filename.toUpperCase().includes(`_${ufStr}.CSV`));
    if (!target) {
      await reader.close();
      return new Response(JSON.stringify({ error: `CSV da UF ${ufStr} não encontrado no ZIP` }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    console.log("Extraindo apenas:", target.filename, "(", target.uncompressedSize, "bytes )");

    // Extrai SOMENTE o CSV da UF — muito menor que o ZIP completo
    const buf: Uint8Array = await target.getData!(new Uint8ArrayWriter());
    await reader.close();
    const text = decodeLatin1(buf);
    console.log("CSV decodificado:", text.length, "chars");

    const lines = text.split(/\r?\n/);
    if (lines.length < 2) {
      return new Response(JSON.stringify({ error: "CSV vazio" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const header = parseCsvLine(lines[0]).map((h) => h.trim().toUpperCase().replace(/^"|"$/g, ""));
    const idx = (name: string) => header.indexOf(name);
    const I = {
      TURNO: idx("NR_TURNO"),
      UF: idx("SG_UF"),
      COD_MUN: idx("CD_MUNICIPIO"),
      MUN: idx("NM_MUNICIPIO"),
      ZONA: idx("NR_ZONA"),
      CARGO: idx("DS_CARGO"),
      NUMERO: idx("NR_CANDIDATO"),
      NOME_COMPLETO: idx("NM_CANDIDATO"),
      NOME_URNA: idx("NM_URNA_CANDIDATO"),
      PARTIDO: idx("SG_PARTIDO"),
      SITUACAO: idx("DS_SIT_TOT_TURNO"),
      VOTOS: idx("QT_VOTOS_NOMINAIS"),
    };
    console.log("Mapeamento de colunas:", I);
    const missing = Object.entries(I).filter(([_, v]) => v === -1).map(([k]) => k);
    if (missing.length) {
      return new Response(JSON.stringify({ error: `Colunas ausentes no CSV: ${missing.join(", ")}`, header }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const dataLines = lines.slice(1).filter((l) => l && l.trim().length > 0);
    console.log("Linhas a processar:", dataLines.length);

    // Agrega votos por (cargo, cod_mun, zona, numero) — o CSV tem 1 linha por cargo total/transito; somamos
    type Row = {
      ano: number; turno: number; cargo: string; cod_municipio: number; municipio: string;
      uf: string; zona: number; numero: number; nome_urna: string; nome_completo: string;
      partido: string; situacao: string; votos: number;
    };
    const agg = new Map<string, Row>();

    for (const line of dataLines) {
      const cols = parseCsvLine(line);
      if (cols.length < header.length - 2) continue;
      const cargoTxt = (cols[I.CARGO] || "").replace(/^"|"$/g, "").trim();
      // Normalizar nomes de cargos
      const cargo = cargoTxt
        .replace(/^DEPUTADO ESTADUAL$/i, "Deputado Estadual")
        .replace(/^DEPUTADO FEDERAL$/i, "Deputado Federal")
        .replace(/^DEPUTADO DISTRITAL$/i, "Deputado Distrital")
        .replace(/^GOVERNADOR$/i, "Governador")
        .replace(/^SENADOR$/i, "Senador")
        .replace(/^PRESIDENTE$/i, "Presidente")
        .replace(/^VEREADOR$/i, "Vereador")
        .replace(/^PREFEITO$/i, "Prefeito");
      if (!cargo) continue;
      const numero = parseInt((cols[I.NUMERO] || "0").replace(/"/g, ""), 10);
      if (!numero) continue;
      const cod_mun = parseInt((cols[I.COD_MUN] || "0").replace(/"/g, ""), 10);
      const zona = parseInt((cols[I.ZONA] || "0").replace(/"/g, ""), 10);
      const turno = parseInt((cols[I.TURNO] || "1").replace(/"/g, ""), 10);
      const votos = parseInt((cols[I.VOTOS] || "0").replace(/"/g, ""), 10) || 0;
      const key = `${turno}|${cargo}|${cod_mun}|${zona}|${numero}`;
      const existing = agg.get(key);
      if (existing) {
        existing.votos += votos;
      } else {
        agg.set(key, {
          ano: anoNum,
          turno,
          cargo,
          cod_municipio: cod_mun,
          municipio: (cols[I.MUN] || "").replace(/"/g, "").trim(),
          uf: (cols[I.UF] || ufStr).replace(/"/g, "").trim(),
          zona,
          numero,
          nome_urna: (cols[I.NOME_URNA] || "").replace(/"/g, "").trim() || (null as any),
          nome_completo: (cols[I.NOME_COMPLETO] || "").replace(/"/g, "").trim() || (null as any),
          partido: (cols[I.PARTIDO] || "").replace(/"/g, "").trim() || (null as any),
          situacao: (cols[I.SITUACAO] || "").replace(/"/g, "").trim() || (null as any),
          votos,
        });
      }
    }

    const all = Array.from(agg.values());
    console.log("Linhas agregadas:", all.length);

    // Insere em lotes
    const BATCH = 1000;
    let inserted = 0;
    let failed = 0;
    for (let i = 0; i < all.length; i += BATCH) {
      const slice = all.slice(i, i + BATCH);
      const { error } = await admin
        .from("tse_votacao_zona")
        .upsert(slice, { onConflict: "ano,turno,cargo,cod_municipio,zona,numero" });
      if (error) {
        console.error("Erro no lote", i, error.message);
        failed += slice.length;
      } else {
        inserted += slice.length;
      }
    }

    return new Response(
      JSON.stringify({ ok: true, ano: anoNum, uf: ufStr, total: all.length, inserted, failed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Erro fatal:", err);
    return new Response(JSON.stringify({ error: String(err?.message || err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});