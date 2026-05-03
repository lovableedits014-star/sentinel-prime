// Edge function: resolve-supporter-profiles
// Resolve supporter_profiles inválidos (share_xxx ou username não-numérico) 
// para o ID numérico real do Facebook, e tenta o mesmo para Instagram.
//
// Estratégias por ordem:
//  1) Match em comments existentes (platform_username -> author_id numérico)
//  2) Para share_xxx: chama resolve-social-link p/ obter handle real, depois resolve via Graph API
//  3) Para username não-numérico: chama Graph API direto p/ obter ID

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface ProfileRow {
  id: string;
  supporter_id: string;
  platform: string;
  platform_user_id: string;
  platform_username: string | null;
  client_id: string;
  supporter_name: string | null;
  meta_access_token: string | null;
  meta_page_id: string | null;
}

const isNumericId = (v: string | null) => !!v && /^\d+$/.test(v);
const isShareToken = (v: string) => /^share_/i.test(v);

function normalizeName(s: string): string {
  return s
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

async function resolveShareToken(shareId: string, platform: string): Promise<string | null> {
  const url = platform === "instagram"
    ? `https://www.instagram.com/share/${shareId}`
    : `https://www.facebook.com/share/${shareId}`;
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/resolve-social-link`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, platform }),
    });
    const data = await res.json();
    return data?.resolved && data?.usuario ? String(data.usuario) : null;
  } catch (e) {
    console.warn("resolveShareToken erro:", e);
    return null;
  }
}

async function fbHandleToNumericId(handle: string, accessToken: string): Promise<string | null> {
  // Se já é numérico, devolve.
  if (isNumericId(handle)) return handle;
  try {
    const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(handle)}?fields=id,name&access_token=${encodeURIComponent(accessToken)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data?.id && /^\d+$/.test(data.id)) return data.id;
    console.warn("Graph API não devolveu id numérico:", data?.error?.message || JSON.stringify(data));
    return null;
  } catch (e) {
    console.warn("fbHandleToNumericId erro:", e);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const clientIdFilter: string | undefined = body.client_id;
    const profileIdFilter: string | undefined = body.profile_id;
    const dryRun: boolean = body.dry_run === true;
    const limit: number = Math.min(Number(body.limit ?? 100), 500);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1) Buscar perfis problemáticos (com client_id e nome do supporter via join)
    let baseQuery = supabase
      .from("supporter_profiles")
      .select("id, supporter_id, platform, platform_user_id, platform_username, supporters!inner(client_id, name)");
    if (profileIdFilter) {
      baseQuery = baseQuery.eq("id", profileIdFilter);
    } else {
      baseQuery = baseQuery.limit(limit * 3);
    }
    const { data: rawRows, error } = await baseQuery;
    if (error) throw error;

    // 2) Carregar integrations por client_id em uma query separada
    const allClientIds = [...new Set((rawRows || []).map((r: any) => r.supporters?.client_id).filter(Boolean))] as string[];
    const { data: integrationsRows } = await supabase
      .from("integrations")
      .select("client_id, meta_access_token, meta_page_id")
      .in("client_id", allClientIds.length ? allClientIds : ["00000000-0000-0000-0000-000000000000"]);
    const integrationsByClient = new Map<string, { meta_access_token: string | null; meta_page_id: string | null }>(
      (integrationsRows || []).map((i: any) => [i.client_id, { meta_access_token: i.meta_access_token, meta_page_id: i.meta_page_id }]),
    );

    const rows: ProfileRow[] = (rawRows || [])
      .map((r: any) => {
        const cid = r.supporters?.client_id;
        const integ = cid ? integrationsByClient.get(cid) : null;
        return {
          id: r.id,
          supporter_id: r.supporter_id,
          platform: r.platform,
          platform_user_id: r.platform_user_id || "",
          platform_username: r.platform_username,
          client_id: cid,
          supporter_name: r.supporters?.name || null,
          meta_access_token: integ?.meta_access_token ?? null,
          meta_page_id: integ?.meta_page_id ?? null,
        };
      })
      .filter((r) => {
        if (clientIdFilter && r.client_id !== clientIdFilter) return false;
        if (!r.platform_user_id) return true;
        return !isNumericId(r.platform_user_id);
      })
      .slice(0, limit);

    console.log(`Processando ${rows.length} perfis problemáticos (dry_run=${dryRun})`);

    // Pré-carregar índice de comments por (client, platform) -> Map<normalized_name, author_id>
    const targetClients = [...new Set(rows.map((r) => r.client_id).filter(Boolean))] as string[];
    const nameIndex = new Map<string, Map<string, string>>(); // key: `${client}:${platform}`
    if (targetClients.length) {
      const { data: commentRows } = await supabase
        .from("comments")
        .select("client_id, platform, author_id, author_name")
        .in("client_id", targetClients)
        .not("author_id", "is", null)
        .not("author_name", "is", null)
        .limit(20000);
      for (const c of commentRows || []) {
        if (!c.author_id || !c.author_name) continue;
        const key = `${c.client_id}:${c.platform || "facebook"}`;
        let m = nameIndex.get(key);
        if (!m) { m = new Map(); nameIndex.set(key, m); }
        const norm = normalizeName(c.author_name);
        if (norm && !m.has(norm)) m.set(norm, c.author_id);
      }
    }

    const results = {
      total: rows.length,
      resolved_via_comments: 0,
      resolved_via_graph: 0,
      resolved_via_share: 0,
      failed: 0,
      details: [] as any[],
    };

    for (const row of rows) {
      let newId: string | null = null;
      let strategy = "";

      // Estratégia 1: matchar pelo NOME do supporter contra author_name dos comentários
      // (autor já comentou antes -> temos o author_id numérico)
      if (row.supporter_name) {
        const key = `${row.client_id}:${row.platform}`;
        const m = nameIndex.get(key);
        const candidate = m?.get(normalizeName(row.supporter_name));
        if (candidate && (row.platform !== "facebook" || /^\d+$/.test(candidate))) {
          newId = candidate;
          strategy = "name_match_in_comments";
          results.resolved_via_comments++;
        }
      }

      // Estratégia 2: share_xxx -> seguir redirect e tentar achar o handle real
      // depois tentar matchar handle contra index OU contra author_name
      if (!newId && isShareToken(row.platform_user_id)) {
        const shareCode = row.platform_user_id.replace(/^share_/i, "");
        const realHandle = await resolveShareToken(shareCode, row.platform);
        if (realHandle) {
          if (isNumericId(realHandle)) {
            newId = realHandle;
            strategy = "share_to_id";
            results.resolved_via_share++;
          } else if (row.platform === "instagram") {
            // IG: o handle resolvido já é o identificador estável
            newId = realHandle;
            strategy = "share_to_handle_ig";
            results.resolved_via_share++;
          } else if (row.platform === "facebook") {
            // FB: tentar achar id numérico via index de comments cruzando handle vs author_name
            const m = nameIndex.get(`${row.client_id}:facebook`);
            if (m) {
              for (const [norm, authorId] of m.entries()) {
                if (norm.replace(/\s+/g, ".") === realHandle.toLowerCase()
                    || norm.replace(/\s+/g, "") === realHandle.toLowerCase()) {
                  newId = authorId;
                  strategy = "share_to_handle_to_name_match";
                  results.resolved_via_share++;
                  break;
                }
              }
            }
          }
        }
      }

      if (!newId) {
        results.failed++;
        results.details.push({
          id: row.id,
          old_user_id: row.platform_user_id,
          status: "failed",
        });
        continue;
      }

      results.details.push({
        id: row.id,
        old_user_id: row.platform_user_id,
        new_user_id: newId,
        strategy,
      });

      if (!dryRun) {
        // Atualizar perfil — tratar conflito (já existe esse ID numérico p/ outro supporter)
        const { error: upErr } = await supabase
          .from("supporter_profiles")
          .update({
            platform_user_id: newId,
            // mantém platform_username p/ rastro
          })
          .eq("id", row.id);
        if (upErr) {
          console.warn(`Falha ao atualizar ${row.id}:`, upErr.message);
        }
      }
    }

    // Após atualizar, religar engagement_actions órfãs por client
    const clients = [...new Set(rows.map((r) => r.client_id))];
    if (!dryRun) {
      for (const cid of clients) {
        if (!cid) continue;
        const { error: linkErr } = await supabase.rpc("link_orphan_engagement_actions", { p_client_id: cid });
        if (linkErr) console.warn(`link_orphan_engagement_actions erro p/ ${cid}:`, linkErr.message);
      }
    }

    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("resolve-supporter-profiles erro:", e);
    return new Response(JSON.stringify({ error: e?.message || "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
