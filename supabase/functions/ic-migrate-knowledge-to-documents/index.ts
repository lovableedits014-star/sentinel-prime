/**
 * Migra a memória antiga: para cada ic_transcriptions sem documento,
 * chama ic-extract-knowledge no novo modo (que gera ic_knowledge_documents).
 * Os fatos antigos de candidate_knowledge são apagados pelo próprio extractor.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/ic-utils.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { clientId, limit = 20 } = await req.json();
    if (!clientId) return errorResponse("clientId é obrigatório", 400);

    const { requireClientAccess } = await import("../_shared/auth-guard.ts");
    const guard = await requireClientAccess(req, clientId);
    if (!guard.ok) return guard.response;
    const userAuthHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: existingDocs } = await admin
      .from("ic_knowledge_documents")
      .select("transcription_id")
      .eq("client_id", clientId);
    const done = new Set((existingDocs ?? []).map((d: any) => d.transcription_id).filter(Boolean));

    const { data: trs, error } = await admin
      .from("ic_transcriptions")
      .select("id, full_text, segments, filename, created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(limit * 3);
    if (error) throw error;

    const pending = (trs ?? []).filter((t: any) => !done.has(t.id)).slice(0, limit);

    const results: any[] = [];
    for (const t of pending) {
      const text =
        (t.full_text && t.full_text.length > 30
          ? t.full_text
          : (Array.isArray(t.segments) ? t.segments.map((s: any) => s?.text ?? "").join(" ") : "")
        ).trim();
      if (text.length < 50) {
        results.push({ id: t.id, skipped: "texto curto" });
        continue;
      }
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/ic-extract-knowledge`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: userAuthHeader, apikey: SERVICE_KEY },
          body: JSON.stringify({
            clientId,
            sourceType: "transcription",
            sourceId: t.id,
            sourceDate: t.created_at,
            text,
            documentTitleHint: t.filename || undefined,
            triggerSuggestions: false,
          }),
        });
        const j = await r.json();
        results.push({ id: t.id, ok: r.ok, ...j });
      } catch (e: any) {
        results.push({ id: t.id, error: e?.message || String(e) });
      }
    }

    return jsonResponse({
      total_transcriptions: trs?.length ?? 0,
      already_migrated: done.size,
      processed_now: results.length,
      results,
    });
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : String(e));
  }
});
