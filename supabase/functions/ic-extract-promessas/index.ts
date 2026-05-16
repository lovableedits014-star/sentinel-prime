// Extrai/sincroniza promessas estruturadas a partir de ic_knowledge_documents
// Pode rodar para 1 documento (documentId) ou em backfill (clientId + limit).
// Usa a lista doc.promessas já extraída pelo LLM e parseia prazo/bairro.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/ic-utils.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const TIPO_KEYWORDS: Array<[string, RegExp]> = [
  ["saude", /\b(saúde|saude|ubs|ups|hospital|posto|psf|samu|médic|medic|enfermag|vacin|farmác|farmac)\b/i],
  ["educacao", /\b(educa|escola|creche|cmei|cmei|professor|professora|merenda|alfabeti|universid|faculd)\b/i],
  ["infraestrutura", /\b(asfalt|pavimenta|rua|avenida|ponte|esgoto|saneamento|ilumina|praça|praca|parque|reforma|obra)\b/i],
  ["seguranca", /\b(seguran|polic|guarda|câmera|camera|monitora|delegacia)\b/i],
  ["economia", /\b(empreg|trabalh|empreend|renda|microcrédit|microcredit|capacit|empresa|comércio|comercio)\b/i],
  ["social", /\b(assistên|assisten|cesta|bolsa|idoso|criança|crianca|mulher|moradia|casa popular)\b/i],
  ["meio_ambiente", /\b(ambient|ecolog|reciclag|árvore|arvore|verde|sustenta|lixo)\b/i],
];

function inferTipo(texto: string, temaHint?: string): string {
  const hay = `${temaHint ?? ""} ${texto}`;
  for (const [k, r] of TIPO_KEYWORDS) if (r.test(hay)) return k;
  return "outro";
}

function tryParsePrazoData(prazoTexto: string | null | undefined, fallback?: string | null): string | null {
  if (!prazoTexto) return null;
  const s = prazoTexto.toLowerCase().trim();
  // 30/06/2025
  const m1 = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m1) {
    const y = m1[3].length === 2 ? 2000 + Number(m1[3]) : Number(m1[3]);
    return `${y}-${m1[2].padStart(2, "0")}-${m1[1].padStart(2, "0")}`;
  }
  // junho de 2025
  const meses = ["janeiro","fevereiro","março","marco","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  const m2 = s.match(/(janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)[^\d]+(\d{4})/);
  if (m2) {
    const idx = meses.indexOf(m2[1]); const month = (idx === 3 ? 3 : idx) + 1; // marco->março
    const realMonth = m2[1] === "marco" ? 3 : (meses.indexOf(m2[1]) + 1);
    return `${m2[2]}-${String(realMonth).padStart(2,"0")}-01`;
  }
  // "em 90 dias", "em 6 meses", "em 1 ano"
  const base = fallback ? new Date(fallback) : new Date();
  const md = s.match(/(\d+)\s*dia/);
  if (md) { base.setDate(base.getDate() + Number(md[1])); return base.toISOString().slice(0,10); }
  const mm = s.match(/(\d+)\s*m[eê]s/);
  if (mm) { base.setMonth(base.getMonth() + Number(mm[1])); return base.toISOString().slice(0,10); }
  const my = s.match(/(\d+)\s*ano/);
  if (my) { base.setFullYear(base.getFullYear() + Number(my[1])); return base.toISOString().slice(0,10); }
  // só ano: "2026"
  const onlyYear = s.match(/^\s*(\d{4})\s*$/);
  if (onlyYear) return `${onlyYear[1]}-12-31`;
  return null;
}

function pickBairro(promessa: any, doc: any): string | null {
  if (promessa?.bairro) return String(promessa.bairro).slice(0, 120);
  if (promessa?.para_quem && /bairro|jardim|jd\.|vila|parque/i.test(promessa.para_quem)) {
    return String(promessa.para_quem).slice(0, 120);
  }
  // se o documento citou só 1 bairro
  if (Array.isArray(doc?.bairros_citados) && doc.bairros_citados.length === 1) {
    return String(doc.bairros_citados[0]?.nome || "").slice(0, 120) || null;
  }
  return null;
}

async function processDocument(admin: any, clientId: string, doc: any) {
  // Apaga promessas anteriores deste documento (idempotência)
  await admin.from("ic_promessas").delete()
    .eq("client_id", clientId)
    .eq("documento_origem_id", doc.id);

  const list = Array.isArray(doc.promessas) ? doc.promessas : [];
  const rows: any[] = [];
  for (const p of list) {
    const texto = (p?.texto || p?.titulo || "").toString().trim();
    if (!texto) continue;
    const prazoTexto = p?.prazo || p?.prazo_texto || null;
    rows.push({
      client_id: clientId,
      texto: texto.slice(0, 1000),
      prazo_texto: prazoTexto ? String(prazoTexto).slice(0, 200) : null,
      prazo_data: tryParsePrazoData(prazoTexto, doc.data_evento),
      bairro: pickBairro(p, doc),
      beneficiario: p?.para_quem ? String(p.para_quem).slice(0, 200) : null,
      tipo: inferTipo(texto, p?.tema),
      status: "aberta",
      documento_origem_id: doc.id,
      transcription_id: doc.transcription_id ?? null,
      evidencias: [],
    });
  }
  if (rows.length === 0) return 0;
  const { error } = await admin.from("ic_promessas").insert(rows);
  if (error) { console.error("[ic-extract-promessas] insert err:", error.message); return 0; }
  return rows.length;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const { clientId, documentId, limit = 50 } = body || {};
    if (!clientId) return errorResponse("clientId é obrigatório", 400);

    // Tenant guard: revalida acesso do usuário ao client_id alvo.
    const { requireClientAccess } = await import("../_shared/auth-guard.ts");
    const guard = await requireClientAccess(req, clientId);
    if (!guard.ok) return guard.response;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    if (documentId) {
      const { data: doc, error } = await admin
        .from("ic_knowledge_documents")
        .select("id, transcription_id, data_evento, promessas, bairros_citados")
        .eq("id", documentId)
        .eq("client_id", clientId)
        .maybeSingle();
      if (error || !doc) return errorResponse("Documento não encontrado");
      const n = await processDocument(admin, clientId, doc);
      return jsonResponse({ ok: true, documents: 1, promessas_inseridas: n });
    }

    // Backfill: documentos sem promessas registradas
    const { data: docs, error } = await admin
      .from("ic_knowledge_documents")
      .select("id, transcription_id, data_evento, promessas, bairros_citados")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(Math.min(limit, 200));
    if (error) return errorResponse(error.message);

    let docsProc = 0; let total = 0;
    for (const d of (docs ?? [])) {
      const n = await processDocument(admin, clientId, d);
      docsProc++; total += n;
    }
    return jsonResponse({ ok: true, documents: docsProc, promessas_inseridas: total });
  } catch (e: any) {
    console.error("[ic-extract-promessas] erro:", e?.message);
    return errorResponse(e?.message || "Erro");
  }
});
