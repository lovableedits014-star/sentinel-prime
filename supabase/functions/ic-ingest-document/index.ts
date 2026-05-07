// Ingere documentos vindos de PDF (storage), URL pública ou nota manual,
// extrai texto e dispara ic-extract-knowledge para virar documento estruturado.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/ic-utils.ts";
// pdfjs-dist legacy build funciona em Deno/Workers (puro JS).
import * as pdfjs from "https://esm.sh/pdfjs-dist@4.0.379/legacy/build/pdf.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Mode = "pdf" | "url" | "manual";

interface IngestRequest {
  clientId: string;
  mode: Mode;
  // pdf
  storagePath?: string;       // ex: "<user_id>/abc.pdf"
  // url
  url?: string;
  // manual
  text?: string;
  // todos
  title?: string;
  date?: string;              // YYYY-MM-DD
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  // Desabilita worker — roda em main thread
  // @ts-ignore
  const loadingTask = pdfjs.getDocument({ data: bytes, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: false });
  const doc = await loadingTask.promise;
  let out = "";
  const max = Math.min(doc.numPages, 200);
  for (let i = 1; i <= max; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const strs = (content.items as any[]).map((it) => (typeof it?.str === "string" ? it.str : "")).filter(Boolean);
    out += strs.join(" ") + "\n\n";
  }
  return out.trim();
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|br|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractTitleFromHtml(html: string): string | null {
  const og = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);
  if (og?.[1]) return og[1].trim();
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return t?.[1]?.trim() || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as IngestRequest;
    const { clientId, mode, storagePath, url, text, title, date } = body || ({} as IngestRequest);

    if (!clientId) return errorResponse("clientId é obrigatório", 400);
    if (!mode) return errorResponse("mode é obrigatório", 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    let extractedText = "";
    let sourceUrl: string | null = null;
    let sourceRef: string | null = null;
    let titleHint = title || "";
    let extractSourceType: "pdf" | "url" | "manual_doc" = "manual_doc";

    if (mode === "pdf") {
      if (!storagePath) return errorResponse("storagePath é obrigatório", 400);
      const { data: file, error: dlErr } = await admin.storage.from("ic-documents").download(storagePath);
      if (dlErr || !file) return errorResponse(`Falha ao baixar PDF: ${dlErr?.message || "arquivo não encontrado"}`, 400);
      const bytes = new Uint8Array(await file.arrayBuffer());
      try {
        extractedText = await extractPdfText(bytes);
      } catch (e: any) {
        return errorResponse(`Falha ao ler PDF: ${e?.message || e}`, 400);
      }
      sourceRef = storagePath;
      extractSourceType = "pdf";
      if (!titleHint) titleHint = storagePath.split("/").pop()?.replace(/\.pdf$/i, "") || "Documento PDF";
    } else if (mode === "url") {
      if (!url) return errorResponse("url é obrigatório", 400);
      try {
        const res = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; LovableMemoryBot/1.0)",
            "Accept": "text/html,application/xhtml+xml",
          },
          redirect: "follow",
        });
        if (!res.ok) return errorResponse(`URL retornou ${res.status}`, 400);
        const html = await res.text();
        extractedText = htmlToText(html);
        if (!titleHint) titleHint = extractTitleFromHtml(html) || url;
      } catch (e: any) {
        return errorResponse(`Falha ao buscar URL: ${e?.message || e}`, 400);
      }
      sourceUrl = url;
      sourceRef = url;
      extractSourceType = "url";
    } else if (mode === "manual") {
      if (!text || text.trim().length < 30) return errorResponse("texto muito curto (mín 30 chars)", 400);
      extractedText = text.trim();
      extractSourceType = "manual_doc";
      sourceRef = `manual:${crypto.randomUUID()}`;
      if (!titleHint) titleHint = "Nota manual";
    } else {
      return errorResponse(`mode inválido: ${mode}`, 400);
    }

    if (!extractedText || extractedText.length < 30) {
      return errorResponse("Conteúdo extraído insuficiente para análise", 400);
    }

    // Limita tamanho para não estourar contexto (extract-knowledge faz map-reduce a partir disso)
    const MAX_CHARS = 120_000;
    if (extractedText.length > MAX_CHARS) extractedText = extractedText.slice(0, MAX_CHARS);

    // Chama ic-extract-knowledge
    const extractRes = await fetch(`${SUPABASE_URL}/functions/v1/ic-extract-knowledge`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({
        clientId,
        sourceType: extractSourceType,
        sourceId: sourceRef,
        sourceUrl,
        sourceDate: date ?? null,
        text: extractedText,
        documentTitleHint: titleHint,
        triggerSuggestions: true,
      }),
    });

    const extractJson = await extractRes.json().catch(() => ({}));
    if (!extractRes.ok) {
      return errorResponse(`Falha na extração: ${extractJson?.error || extractRes.statusText}`, 500);
    }

    return jsonResponse({
      ok: true,
      mode,
      chars: extractedText.length,
      ...extractJson,
    });
  } catch (e: any) {
    console.error("ic-ingest-document error:", e?.message || e);
    return errorResponse(e?.message || String(e));
  }
});
