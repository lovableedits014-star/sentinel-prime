// ic-import-posts
// Orquestra a importação de posts (presentes em public.comments) como documentos
// na memória (ic_knowledge_documents). Para cada post elegível, chama
// ic-extract-knowledge com sourceType="post" — que já reusa toda a pipeline
// LLM (resumo, propostas, promessas, bandeiras, bordões, embeddings).
//
// Input JSON:
//   {
//     clientId: string,
//     sinceDate?: string (ISO),     // limita por comment_created_time
//     limit?: number = 25,          // máx posts por chamada (evita timeout/custo)
//     postIds?: string[],           // restringe a posts específicos (atalho 1-a-1)
//     replace?: boolean = false     // reprocessa mesmo se já existir documento
//   }
//
// Saída:
//   { eligible, processed, skipped_existing, skipped_empty, failed, errors[] }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ImportRequest {
  clientId: string;
  sinceDate?: string;
  limit?: number;
  postIds?: string[];
  replace?: boolean;
}

type PostAggregate = {
  post_id: string;
  platform: string;
  post_message: string | null;
  post_permalink_url: string | null;
  published_at: string | null;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 500) {
  return jsonResponse({ error: message }, status);
}

async function listPosts(
  admin: ReturnType<typeof createClient>,
  clientId: string,
  opts: { sinceDate?: string; postIds?: string[]; hardLimit: number },
): Promise<PostAggregate[]> {
  // Sem DISTINCT ON via PostgREST. Buscamos comentários ordenados por data
  // crescente e agrupamos em memória pegando o mais antigo por post_id.
  // hardLimit limita quantos COMENTÁRIOS varrer (não posts) — usamos um
  // múltiplo razoável para garantir cobertura.
  let q = admin
    .from("comments")
    .select("post_id, platform, post_message, post_permalink_url, comment_created_time")
    .eq("client_id", clientId)
    .not("post_id", "is", null)
    .order("comment_created_time", { ascending: false })
    .limit(opts.hardLimit);

  if (opts.sinceDate) q = q.gte("comment_created_time", opts.sinceDate);
  if (opts.postIds && opts.postIds.length > 0) q = q.in("post_id", opts.postIds);

  const { data, error } = await q;
  if (error) throw new Error("Falha ao listar comentários: " + error.message);

  const map = new Map<string, PostAggregate>();
  for (const row of (data ?? []) as any[]) {
    const key = `${row.post_id}::${row.platform ?? "unknown"}`;
    const existing = map.get(key);
    const candidate: PostAggregate = {
      post_id: row.post_id,
      platform: row.platform ?? "unknown",
      post_message: row.post_message ?? null,
      post_permalink_url: row.post_permalink_url ?? null,
      published_at: row.comment_created_time ?? null,
    };
    if (!existing) {
      map.set(key, candidate);
    } else {
      // mantém a data MAIS ANTIGA como aproximação da publicação
      if (
        candidate.published_at &&
        (!existing.published_at || candidate.published_at < existing.published_at)
      ) {
        existing.published_at = candidate.published_at;
      }
      // preenche campos faltantes
      if (!existing.post_message && candidate.post_message) {
        existing.post_message = candidate.post_message;
      }
      if (!existing.post_permalink_url && candidate.post_permalink_url) {
        existing.post_permalink_url = candidate.post_permalink_url;
      }
    }
  }
  // ordena por data desc
  return Array.from(map.values()).sort((a, b) => {
    const da = a.published_at ?? "";
    const db = b.published_at ?? "";
    return db.localeCompare(da);
  });
}

async function alreadyImportedIds(
  admin: ReturnType<typeof createClient>,
  clientId: string,
  postIds: string[],
): Promise<Set<string>> {
  if (postIds.length === 0) return new Set();
  const { data, error } = await admin
    .from("ic_knowledge_documents")
    .select("source_ref")
    .eq("client_id", clientId)
    .eq("tipo_documento", "post_social")
    .in("source_ref", postIds);
  if (error) {
    console.warn("[ic-import-posts] alreadyImported lookup failed:", error.message);
    return new Set();
  }
  return new Set((data ?? []).map((r: any) => r.source_ref).filter(Boolean));
}

async function callExtract(post: PostAggregate, clientId: string, authHeader: string) {
  const title = (post.post_message ?? "").trim().slice(0, 80) ||
    `Post ${post.platform} ${post.post_id.slice(0, 8)}`;
  const text = (post.post_message ?? "").trim();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/ic-extract-knowledge`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
      apikey: SERVICE_KEY,
    },
    body: JSON.stringify({
      clientId,
      sourceType: "post",
      sourceId: post.post_id,
      sourceUrl: post.post_permalink_url ?? null,
      sourceDate: post.published_at ?? null,
      text,
      documentTitleHint: title,
      triggerSuggestions: false,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`extract HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as ImportRequest;
    const clientId = body?.clientId;
    if (!clientId) return errorResponse("clientId é obrigatório", 400);

    const limit = Math.max(1, Math.min(body?.limit ?? 25, 100));
    const replace = !!body?.replace;
    const sinceDate = body?.sinceDate;
    const postIds = body?.postIds;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Listamos até ~3000 comentários para reconstruir posts. Posts são raros
    // comparados a comentários, então isso cobre milhares de posts.
    const hardLimit = postIds?.length ? Math.max(2000, postIds.length * 50) : 3000;
    const allPosts = await listPosts(admin, clientId, { sinceDate, postIds, hardLimit });

    // sem legenda → fica só na timeline visual, não vai pra memória
    const withText = allPosts.filter((p) => (p.post_message ?? "").trim().length >= 30);
    const skipped_empty = allPosts.length - withText.length;

    // dedupe
    const existing = replace ? new Set<string>() : await alreadyImportedIds(
      admin,
      clientId,
      withText.map((p) => p.post_id),
    );
    const eligible = withText.filter((p) => !existing.has(p.post_id));
    const skipped_existing = withText.length - eligible.length;

    const toProcess = eligible.slice(0, limit);

    // Processa em background: a extração via LLM (Groq) sofre retries longos
    // em 429, então 25 posts sequenciais facilmente extrapolam o limite de
    // CPU/wall-time do worker. Respondemos imediatamente e seguimos extraindo
    // — a UI vê os documentos aparecerem via refetch da Timeline.
    const runBackground = async () => {
      let processed = 0;
      let failed = 0;
      for (const post of toProcess) {
        try {
          await callExtract(post, clientId);
          processed++;
        } catch (e: any) {
          failed++;
          console.warn("[ic-import-posts] bg falhou", post.post_id, e?.message);
        }
        await new Promise((r) => setTimeout(r, 400));
      }
      console.log(
        `[ic-import-posts] bg done client=${clientId} processed=${processed} failed=${failed}`,
      );
    };

    // @ts-ignore EdgeRuntime existe no runtime Supabase
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(runBackground());
    } else {
      // fallback: dispara sem await (não bloqueia resposta)
      runBackground().catch((e) => console.error("[ic-import-posts] bg crash", e));
    }

    return jsonResponse({
      eligible: eligible.length,
      accepted: toProcess.length,
      skipped_existing,
      skipped_empty,
      remaining: Math.max(0, eligible.length - toProcess.length),
      status: "processing",
      message:
        "Importação iniciada em segundo plano. Os documentos vão aparecer na Timeline conforme forem processados.",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("ic-import-posts error:", msg);
    return errorResponse(msg);
  }
});
