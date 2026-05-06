import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { generateEmbedding, buildDocEmbeddingText, EMBEDDING_MODEL } from "../_shared/embeddings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { clientId, limit = 25 } = await req.json();
    if (!clientId) {
      return new Response(JSON.stringify({ error: "clientId obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: docs, error } = await admin
      .from("ic_knowledge_documents")
      .select("id, titulo, resumo_executivo, texto_integral, tags, bairros_citados, pessoas_citadas, propostas, bandeiras")
      .eq("client_id", clientId)
      .is("embedding", null)
      .limit(limit);
    if (error) throw error;

    let ok = 0, fail = 0;
    for (const d of docs ?? []) {
      try {
        const text = buildDocEmbeddingText(d as any);
        const emb = await generateEmbedding(text);
        const { error: upErr } = await admin
          .from("ic_knowledge_documents")
          .update({
            embedding: emb as any,
            embedding_model: EMBEDDING_MODEL,
            embedded_at: new Date().toISOString(),
          })
          .eq("id", (d as any).id);
        if (upErr) throw upErr;
        ok++;
      } catch (e: any) {
        console.warn("backfill falhou", (d as any).id, e?.message);
        fail++;
      }
    }

    return new Response(JSON.stringify({ processed: ok, failed: fail, remaining: (docs?.length ?? 0) >= limit }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
