/**
 * fetch-meta-comments - Edge Function (OPTIMIZED)
 * 
 * Optimized to prevent timeouts by:
 * 1) Removing per-comment Graph API fallback calls (N+1 problem)
 * 2) Batching profile resolution
 * 3) Batching engagement action checks
 * 4) Adding timeout protection for sentiment analysis
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import { z } from 'npm:zod@3.23.8';
import { getClientLLMConfig, callLLM, type LLMMessage } from '../_shared/llm-router.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const RequestSchema = z.object({
  clientId: z.string().uuid(),
  postsLimit: z.coerce.number().int().min(1).max(30).optional(),
});

const MAX_RUNTIME_MS = 50_000; // 50s safety margin (edge functions timeout at ~60s)

// IMPORTANT: Must be created per-request, not at module level
// Module-level Date.now() would persist across requests in warm containers
let REQUEST_START = Date.now();

function hasTimeLeft(marginMs = 5000): boolean {
  return (Date.now() - REQUEST_START) < (MAX_RUNTIME_MS - marginMs);
}

// ==== UTILITIES ====

function buildGraphUrl(path: string, params: Record<string, string>): string {
  const normalized = path.replace(/^\//, '');
  const url = new URL(`https://graph.facebook.com/v21.0/${normalized}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

async function fetchAllGraphPages<T>(initialUrl: string, opts?: { maxPages?: number }): Promise<T[]> {
  const maxPages = opts?.maxPages ?? 100;
  const items: T[] = [];
  let url: string | null = initialUrl;
  let pages = 0;

  type GraphPage<U> = { data?: U[]; paging?: { next?: string } };

  while (url && pages < maxPages) {
    pages++;
    const resp = await fetch(url);
    if (!resp.ok) {
      try {
        const err = await resp.json();
        console.error('Graph API page fetch failed', { url, err });
      } catch {
        console.error('Graph API page fetch failed', { url, status: resp.status });
      }
      break;
    }
    const json = (await resp.json()) as GraphPage<T>;
    if (Array.isArray(json?.data)) items.push(...json.data);
    url = json?.paging?.next ?? null;
  }

  return items;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ==== TYPES ====

interface SocialProfile {
  id: string;
  platform: string;
  platform_user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

interface CommentInsert {
  client_id: string;
  comment_id: string;
  post_id: string;
  text: string;
  author_name: string | null;
  author_id: string | null;
  author_profile_picture: string | null;
  platform: string;
  platform_user_id: string | null;
  social_profile_id: string | null;
  author_unavailable: boolean;
  author_unavailable_reason: string | null;
  status: string;
  sentiment: string;
  post_message: string | null;
  post_permalink_url: string | null;
  post_full_picture: string | null;
  post_media_type: string | null;
  comment_created_time: string | null;
  parent_comment_id: string | null;
  is_page_owner: boolean;
  is_hidden: boolean;
}

interface SyncStats {
  totalComments: number;
  newComments: number;
  updatedComments: number;
  facebookComments: number;
  instagramComments: number;
  facebookMissingAuthors: number;
  instagramMissingUsernames: number;
  profilesCreated: number;
  profilesUpdated: number;
}

// ==== BATCH IDENTITY RESOLUTION ====

async function batchResolveProfiles(
  supabase: SupabaseClient,
  clientId: string,
  platform: 'facebook' | 'instagram',
  users: Array<{ platformUserId: string; username: string | null; displayName: string | null; avatarUrl: string | null }>
): Promise<Map<string, string>> {
  // Returns Map<platformUserId, socialProfileId>
  const result = new Map<string, string>();
  if (users.length === 0) return result;

  // De-dupe
  const uniqueUsers = new Map<string, typeof users[0]>();
  for (const u of users) {
    if (!uniqueUsers.has(u.platformUserId)) uniqueUsers.set(u.platformUserId, u);
  }
  const userList = Array.from(uniqueUsers.values());
  const platformUserIds = userList.map(u => u.platformUserId);

  // Batch fetch existing profiles
  const { data: existing } = await supabase
    .from('social_profiles')
    .select('id, platform_user_id')
    .eq('client_id', clientId)
    .eq('platform', platform)
    .in('platform_user_id', platformUserIds);

  const existingMap = new Map<string, string>();
  for (const row of existing || []) {
    existingMap.set(row.platform_user_id, row.id);
    result.set(row.platform_user_id, row.id);
  }

  // Update last_seen for existing in bulk
  if (existing && existing.length > 0) {
    const existingIds = existing.map(e => e.id);
    for (const chunk of chunkArray(existingIds, 50)) {
      await supabase
        .from('social_profiles')
        .update({ last_seen: new Date().toISOString() })
        .in('id', chunk);
    }
  }

  // Insert missing profiles
  const toInsert = userList.filter(u => !existingMap.has(u.platformUserId));
  if (toInsert.length > 0) {
    for (const chunk of chunkArray(toInsert, 50)) {
      const rows = chunk.map(u => ({
        client_id: clientId,
        platform,
        platform_user_id: u.platformUserId,
        username: u.username,
        display_name: u.displayName,
        avatar_url: u.avatarUrl,
      }));
      const { data: inserted, error } = await supabase
        .from('social_profiles')
        .upsert(rows, { onConflict: 'client_id,platform,platform_user_id' })
        .select('id, platform_user_id');
      if (!error && inserted) {
        for (const row of inserted) {
          result.set(row.platform_user_id, row.id);
        }
      }
    }
  }

  return result;
}

// ==== FACEBOOK FETCH ====

async function fetchFacebookPostsWithComments(
  accessToken: string,
  pageId: string,
  postsLimit: number
): Promise<{ posts: any[]; log: string[] }> {
  const log: string[] = [];

  const commentFields = 'id,message,created_time,from{id,name,picture.width(100).height(100)},comment_count,is_hidden';
  const postFields = `id,message,created_time,full_picture,permalink_url,attachments{media_type},comments.limit(50){${commentFields}}`;

  const pageSize = Math.min(postsLimit, 10);
  const url = buildGraphUrl(`${pageId}/posts`, {
    fields: postFields,
    limit: String(pageSize),
    access_token: accessToken,
  });

  log.push(`[FB] Endpoint: /${pageId}/posts?fields=...&limit=${pageSize} (target: ${postsLimit})`);

  const resp = await fetch(url);
  if (!resp.ok) {
    const errBody = await resp.text();
    log.push(`[FB] Error ${resp.status}: ${errBody}`);
    console.error('Error fetching Facebook posts:', errBody);
    return { posts: [], log };
  }

  const json = await resp.json();
  let posts = json?.data ?? [];
  
  if (posts.length < postsLimit && json?.paging?.next) {
    let nextUrl: string | null = json.paging.next;
    while (posts.length < postsLimit && nextUrl && hasTimeLeft()) {
      const nextResp = await fetch(nextUrl);
      if (!nextResp.ok) break;
      const nextJson = await nextResp.json();
      posts = [...posts, ...(nextJson?.data ?? [])];
      nextUrl = nextJson?.paging?.next ?? null;
    }
    posts = posts.slice(0, postsLimit);
  }
  
  log.push(`[FB] Posts returned: ${posts.length}`);

  // Paginate comments and fetch replies - but respect time limit
  for (const post of posts) {
    if (!hasTimeLeft()) break;
    
    if (post.comments?.paging?.next) {
      const moreComments = await fetchAllGraphPages<any>(post.comments.paging.next, { maxPages: 5 });
      post.comments.data = [...(post.comments.data || []), ...moreComments];
    }

    // Fetch nested replies in parallel batches
    const commentsWithReplies = (post.comments?.data || []).filter((c: any) => c.comment_count > 0);
    for (const batch of chunkArray(commentsWithReplies, 5)) {
      if (!hasTimeLeft()) break;
      const replyPromises = batch.map((comment: any) => {
        const repliesUrl = buildGraphUrl(`${comment.id}/comments`, {
          fields: 'id,message,created_time,from{id,name,picture.width(100).height(100)},is_hidden',
          limit: '100',
          access_token: accessToken,
        });
        return fetchAllGraphPages<any>(repliesUrl, { maxPages: 3 }).then(replies => {
          comment.replies = { data: replies };
        });
      });
      await Promise.all(replyPromises);
    }
  }

  return { posts, log };
}

// ==== INSTAGRAM FETCH ====

async function fetchInstagramMediaWithComments(
  accessToken: string,
  igAccountId: string,
  postsLimit: number
): Promise<{ media: any[]; log: string[] }> {
  const log: string[] = [];

  const mediaUrl = buildGraphUrl(`${igAccountId}/media`, {
    fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp',
    limit: String(postsLimit),
    access_token: accessToken,
  });

  log.push(`[IG] Endpoint: /${igAccountId}/media`);

  const resp = await fetch(mediaUrl);
  if (!resp.ok) {
    const errBody = await resp.text();
    log.push(`[IG] Error ${resp.status}: ${errBody}`);
    console.error('Error fetching Instagram media:', errBody);
    return { media: [], log };
  }

  const json = await resp.json();
  const media = json?.data ?? [];
  log.push(`[IG] Media returned: ${media.length}`);

  // Fetch comments for each media - in parallel batches of 3
  for (const batch of chunkArray(media, 3)) {
    if (!hasTimeLeft()) break;
    await Promise.all(batch.map(async (m: any) => {
      const commentsUrl = buildGraphUrl(`${m.id}/comments`, {
        fields: 'id,text,username,timestamp,hidden,replies{id,text,username,timestamp,hidden}',
        limit: '100',
        access_token: accessToken,
      });
      const comments = await fetchAllGraphPages<any>(commentsUrl, { maxPages: 5 });
      m.comments = { data: comments };
      log.push(`[IG] Media ${m.id}: ${comments.length} comments`);
    }));
  }

  return { media, log };
}

// ==== PERSISTENCE ====

async function persistComments(
  supabase: SupabaseClient,
  clientId: string,
  rows: CommentInsert[]
): Promise<{ inserted: number; updated: number }> {
  if (rows.length === 0) return { inserted: 0, updated: 0 };

  const dedup = new Map<string, CommentInsert>();
  for (const r of rows) dedup.set(r.comment_id, r);
  const uniqueRows = Array.from(dedup.values());

  // Batch fetch existing - handle >1000 with chunking
  const commentIds = uniqueRows.map((r) => r.comment_id);
  const existingByCommentId = new Map<string, any>();
  
  for (const chunk of chunkArray(commentIds, 500)) {
    const { data: existing } = await supabase
      .from('comments')
      .select('id, comment_id, social_profile_id, author_unavailable, is_page_owner, parent_comment_id, is_hidden')
      .eq('client_id', clientId)
      .in('comment_id', chunk);

    for (const row of existing ?? []) existingByCommentId.set(row.comment_id, row);
  }

  const inserts: CommentInsert[] = [];
  const updates: Array<{ id: string; data: Record<string, unknown> }> = [];

  for (const r of uniqueRows) {
    const ex = existingByCommentId.get(r.comment_id);
    if (!ex) {
      inserts.push(r);
      continue;
    }

    const data: Record<string, unknown> = {};
    if (!ex.social_profile_id && r.social_profile_id) {
      data.social_profile_id = r.social_profile_id;
      data.platform_user_id = r.platform_user_id;
      data.author_name = r.author_name;
      data.author_id = r.author_id;
      data.author_profile_picture = r.author_profile_picture;
      data.author_unavailable = false;
      data.author_unavailable_reason = null;
    }
    if (ex.author_unavailable && r.social_profile_id) {
      data.social_profile_id = r.social_profile_id;
      data.platform_user_id = r.platform_user_id;
      data.author_name = r.author_name;
      data.author_id = r.author_id;
      data.author_profile_picture = r.author_profile_picture;
      data.author_unavailable = false;
      data.author_unavailable_reason = null;
    }
    if (r.is_page_owner && !ex.is_page_owner) {
      data.is_page_owner = true;
      data.status = 'responded';
    }
    if (r.parent_comment_id && !ex.parent_comment_id) {
      data.parent_comment_id = r.parent_comment_id;
    }
    // Update is_hidden status from Meta
    if (r.is_hidden !== ex.is_hidden) {
      data.is_hidden = r.is_hidden;
    }

    if (Object.keys(data).length > 0) {
      updates.push({ id: ex.id, data });
    }
  }

  let inserted = 0;
  let updated = 0;

  if (inserts.length > 0) {
    // Use upsert with onConflict to avoid duplicate key errors
    for (const chunk of chunkArray(inserts, 50)) {
      const { data: upserted, error: upsertError } = await supabase
        .from('comments')
        .upsert(chunk, { onConflict: 'comment_id,client_id', ignoreDuplicates: false })
        .select('id');
      if (upsertError) {
        console.error('Batch upsert failed:', upsertError);
      } else {
        inserted += upserted?.length || 0;
      }
    }
  }

  if (updates.length > 0) {
    for (const chunk of chunkArray(updates, 50)) {
      const results = await Promise.all(
        chunk.map((u) => supabase.from('comments').update(u.data).eq('id', u.id))
      );
      updated += results.filter((r) => !r.error).length;
    }
  }

  return { inserted, updated };
}

// ==== PERSIST POSTS (even without comments) ====
// We use a synthetic comment_id = "post_stub_{post_id}" to store post metadata
// so the post appears in the selector even before any real comments arrive.
async function persistPostStubs(
  supabase: SupabaseClient,
  clientId: string,
  posts: Array<{
    post_id: string;
    platform: string;
    post_message: string | null;
    post_permalink_url: string | null;
    post_full_picture: string | null;
    post_media_type: string | null;
    post_created_time: string | null;
  }>
): Promise<void> {
  if (posts.length === 0) return;

  // Only store stubs for posts that have a permalink (needed by picker)
  const stubs = posts
    .filter(p => p.post_permalink_url)
    .map(p => ({
      client_id: clientId,
      comment_id: `post_stub_${p.post_id}`,
      post_id: p.post_id,
      text: '__post_stub__',
      author_name: null,
      author_id: null,
      author_profile_picture: null,
      platform: p.platform,
      platform_user_id: null,
      social_profile_id: null,
      author_unavailable: true,
      author_unavailable_reason: 'post stub - no comment',
      status: 'ignored',
      sentiment: 'neutral',
      post_message: p.post_message,
      post_permalink_url: p.post_permalink_url,
      post_full_picture: p.post_full_picture,
      post_media_type: p.post_media_type,
      comment_created_time: p.post_created_time,
      parent_comment_id: null,
      is_page_owner: false,
      is_hidden: false,
    }));

  for (const chunk of chunkArray(stubs, 50)) {
    // ignoreDuplicates: false → always update stub with correct post date/metadata
    await supabase
      .from('comments')
      .upsert(chunk, { onConflict: 'comment_id,client_id', ignoreDuplicates: false });
  }
}

// ==== MAIN HANDLER ====

Deno.serve(async (req) => {
  // Reset timer per-request (critical for warm container reuse)
  REQUEST_START = Date.now();

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let clientIdVar: string | null = null;
  let userIdVar: string | null = null;
  const syncLog: string[] = [];

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: 'No authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    userIdVar = user.id;

    const body = RequestSchema.parse(await req.json());
    const { clientId } = body;
    const postsLimit = body.postsLimit ?? 30;
    clientIdVar = clientId;

    // Verify user owns this client
    const { data: clientOwner, error: clientOwnerError } = await supabaseClient
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .eq('user_id', user.id)
      .single();

    if (clientOwnerError || !clientOwner) {
      return new Response(JSON.stringify({ success: false, error: 'Acesso não autorizado a este cliente' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('=== fetch-meta-comments START ===');
    console.log('Client:', clientId, '| Posts limit:', postsLimit);
    syncLog.push(`Client: ${clientId}, postsLimit: ${postsLimit}`);

    // Get integration data
    const { data: integration, error: intError } = await supabaseClient
      .from('integrations')
      .select('meta_access_token, meta_page_id, meta_instagram_id')
      .eq('client_id', clientId)
      .single();

    if (intError || !integration?.meta_access_token || !integration?.meta_page_id) {
      throw new Error('Meta integration not configured. Configure your Meta access token and page ID first.');
    }

    syncLog.push(`Page ID: ${integration.meta_page_id}, IG: ${integration.meta_instagram_id || 'N/A'}`);

    // ==== DERIVE PAGE ACCESS TOKEN ====
    let pageAccessToken = integration.meta_access_token as string;

    try {
      const pageTokenResp = await fetch(
        buildGraphUrl(integration.meta_page_id, {
          fields: 'access_token,name',
          access_token: pageAccessToken,
        })
      );
      if (pageTokenResp.ok) {
        const pageInfo = await pageTokenResp.json();
        if (pageInfo.access_token) {
          if (pageInfo.access_token !== pageAccessToken) {
            syncLog.push(`Derived Page Access Token (page: ${pageInfo.name})`);
          }
          pageAccessToken = pageInfo.access_token;
        }
      } else {
        const errText = await pageTokenResp.text();
        try {
          const errJson = JSON.parse(errText);
          if (errJson?.error?.code === 190) {
            await supabaseClient
              .from('integrations')
              .update({ meta_token_type: 'expired' } as any)
              .eq('client_id', clientId);
            throw new Error('Token Meta expirado! Atualize o token na página de Integrações.');
          }
        } catch (parseErr) {
          if (parseErr instanceof Error && parseErr.message.includes('Token Meta expirado')) throw parseErr;
        }
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes('Token Meta expirado')) throw e;
      syncLog.push(`Error deriving page token: ${e}`);
    }

    const accessToken = pageAccessToken;

    const stats: SyncStats = {
      totalComments: 0, newComments: 0, updatedComments: 0,
      facebookComments: 0, instagramComments: 0,
      facebookMissingAuthors: 0, instagramMissingUsernames: 0,
      profilesCreated: 0, profilesUpdated: 0,
    };

    const allComments: CommentInsert[] = [];
    
    // Collect users for batch profile resolution
    const fbUsers: Array<{ platformUserId: string; username: string | null; displayName: string | null; avatarUrl: string | null }> = [];
    const igUsers: Array<{ platformUserId: string; username: string | null; displayName: string | null; avatarUrl: string | null }> = [];


    // ==== FETCH FB + IG IN PARALLEL (to maximize chances of saving stubs before timeout) ====
    console.log('--- Fetching Facebook + Instagram in parallel ---');
    syncLog.push('--- FETCHING FB + IG IN PARALLEL ---');

    const [fbResult, igResult] = await Promise.all([
      fetchFacebookPostsWithComments(accessToken, integration.meta_page_id, postsLimit),
      integration.meta_instagram_id
        ? fetchInstagramMediaWithComments(accessToken, integration.meta_instagram_id, postsLimit)
        : Promise.resolve({ media: [], log: ['[IG] No Instagram ID configured'] }),
    ]);

    const { posts: fbPosts, log: fbLog } = fbResult;
    const { media: igMedia, log: igLog } = igResult;
    syncLog.push(...fbLog, ...igLog);
    syncLog.push(`[FB] Posts fetched: ${fbPosts.length} | [IG] Media fetched: ${igMedia.length}`);
    console.log(`FB posts: ${fbPosts.length}, IG media: ${igMedia.length}`);

    // ==== PERSIST ALL POST STUBS IMMEDIATELY (before processing comments) ====
    // This guarantees stubs are saved even if we run out of time on comments
    const fbStubs = fbPosts.map(post => ({
      post_id: post.id,
      platform: 'facebook',
      post_message: post.message || null,
      post_permalink_url: post.permalink_url || null,
      post_full_picture: post.full_picture || null,
      post_media_type: post.attachments?.data?.[0]?.media_type || null,
      post_created_time: post.created_time ? new Date(post.created_time).toISOString() : null,
    }));

    const igStubs = igMedia.map((m: any) => {
      const isVideoMedia = m.media_type?.toLowerCase() === 'video';
      return {
        post_id: m.id,
        platform: 'instagram',
        post_message: m.caption || null,
        post_permalink_url: m.permalink || null,
        post_full_picture: isVideoMedia ? (m.thumbnail_url || m.media_url || null) : (m.media_url || m.thumbnail_url || null),
        post_media_type: m.media_type?.toLowerCase() || null,
        post_created_time: m.timestamp ? new Date(m.timestamp).toISOString() : null,
      };
    });

    await Promise.all([
      persistPostStubs(supabaseClient, clientId, fbStubs),
      persistPostStubs(supabaseClient, clientId, igStubs),
    ]);
    syncLog.push(`[STUBS] FB: ${fbStubs.length}, IG: ${igStubs.length} persisted`);
    console.log(`Post stubs saved - FB: ${fbStubs.length}, IG: ${igStubs.length}`);

    // ==== GET IG OWNER USERNAME ====
    let igOwnerUsername: string | null = null;
    if (integration.meta_instagram_id) {
      try {
        const igInfoResp = await fetch(
          buildGraphUrl(integration.meta_instagram_id, {
            fields: 'username',
            access_token: accessToken,
          })
        );
        if (igInfoResp.ok) {
          const igInfo = await igInfoResp.json();
          igOwnerUsername = igInfo.username || null;
          syncLog.push(`[IG] Owner username: ${igOwnerUsername}`);
        }
      } catch (e) {
        syncLog.push(`[IG] Could not fetch owner username: ${e}`);
      }
    }

    // ==== COLLECT FACEBOOK COMMENTS ====
    syncLog.push('--- PROCESSING FACEBOOK COMMENTS ---');
    for (const post of fbPosts) {
      const postId = post.id;
      const postMessage = post.message || null;
      const postPermalink = post.permalink_url || null;
      const postPicture = post.full_picture || null;
      const postMediaType = post.attachments?.data?.[0]?.media_type || null;

      const processComment = (comment: any, parentId: string | null) => {
        stats.facebookComments++;
        const authorId = comment.from?.id || null;
        const authorName = comment.from?.name || null;
        const avatarUrl = comment.from?.picture?.data?.url || comment.from?.picture?.url || null;
        const isHidden = comment.is_hidden === true;

        if (authorId) {
          fbUsers.push({ platformUserId: authorId, username: null, displayName: authorName, avatarUrl });
        } else {
          stats.facebookMissingAuthors++;
        }

        const isPageOwner = !!authorId && authorId === integration.meta_page_id;

        allComments.push({
          client_id: clientId,
          comment_id: comment.id,
          post_id: postId,
          text: comment.message || '',
          author_name: authorName,
          author_id: authorId,
          author_profile_picture: avatarUrl,
          platform: 'facebook',
          platform_user_id: authorId,
          social_profile_id: null,
          author_unavailable: !authorId,
          author_unavailable_reason: authorId ? null : 'from field not returned by Meta API',
          status: isPageOwner ? 'responded' : 'pending',
          sentiment: 'neutral',
          post_message: postMessage,
          post_permalink_url: postPermalink,
          post_full_picture: postPicture,
          post_media_type: postMediaType,
          comment_created_time: comment.created_time ? new Date(comment.created_time).toISOString() : null,
          parent_comment_id: parentId,
          is_page_owner: isPageOwner,
          is_hidden: isHidden,
        });

        for (const reply of comment.replies?.data || []) {
          processComment(reply, comment.id);
        }
      };

      for (const comment of post.comments?.data || []) {
        processComment(comment, null);
      }
    }

    // ==== COLLECT INSTAGRAM COMMENTS ====
    syncLog.push('--- PROCESSING INSTAGRAM COMMENTS ---');
    for (const m of igMedia) {
      const postId = m.id;
      const postMessage = m.caption || null;
      const postPermalink = m.permalink || null;
      const isVideoMedia = m.media_type?.toLowerCase() === 'video';
      const postPicture = isVideoMedia
        ? (m.thumbnail_url || m.media_url || null)
        : (m.media_url || m.thumbnail_url || null);
      const postMediaType = m.media_type?.toLowerCase() || null;

      const processIgComment = (comment: any, parentId: string | null) => {
        stats.instagramComments++;
        const username = comment.username || null;
        const isHidden = comment.hidden === true;

        if (username) {
          igUsers.push({ platformUserId: username, username, displayName: null, avatarUrl: null });
        } else {
          stats.instagramMissingUsernames++;
        }

        const isPageOwner = !!username && !!igOwnerUsername && username.toLowerCase() === igOwnerUsername.toLowerCase();

        allComments.push({
          client_id: clientId,
          comment_id: comment.id,
          post_id: postId,
          text: comment.text || '',
          author_name: username ? `@${username}` : null,
          author_id: username,
          author_profile_picture: null,
          platform: 'instagram',
          platform_user_id: username,
          social_profile_id: null,
          author_unavailable: !username,
          author_unavailable_reason: username ? null : 'username not returned by Instagram API',
          status: isPageOwner ? 'responded' : 'pending',
          sentiment: 'neutral',
          post_message: postMessage,
          post_permalink_url: postPermalink,
          post_full_picture: postPicture,
          post_media_type: postMediaType,
          comment_created_time: comment.timestamp ? new Date(comment.timestamp).toISOString() : null,
          parent_comment_id: parentId,
          is_page_owner: isPageOwner,
          is_hidden: isHidden,
        });

        for (const reply of comment.replies?.data || []) {
          processIgComment(reply, comment.id);
        }
      };

      for (const comment of m.comments?.data || []) {
        processIgComment(comment, null);
      }
    }


    // ==== BATCH PROFILE RESOLUTION ====
    syncLog.push('--- PROFILE RESOLUTION ---');
    const fbProfileMap = await batchResolveProfiles(supabaseClient, clientId, 'facebook', fbUsers);
    const igProfileMap = await batchResolveProfiles(supabaseClient, clientId, 'instagram', igUsers);
    stats.profilesCreated = fbProfileMap.size + igProfileMap.size; // approximate

    // Assign social_profile_ids to comments
    for (const c of allComments) {
      if (c.platform_user_id) {
        const map = c.platform === 'facebook' ? fbProfileMap : igProfileMap;
        c.social_profile_id = map.get(c.platform_user_id) || null;
      }
    }

    stats.totalComments = allComments.length;

    // ==== PERSIST ====
    syncLog.push(`Total comments to persist: ${allComments.length}`);
    const { inserted, updated } = await persistComments(supabaseClient, clientId, allComments);
    stats.newComments = inserted;
    stats.updatedComments = updated;
    syncLog.push(`Inserted: ${inserted}, Updated: ${updated}`);

    // ==== ENGAGEMENT ACTIONS ====
    // NOTE: engagement_actions are now created automatically via the DB trigger
    // "trigger_auto_engagement_action" that fires on INSERT/UPDATE of comments.
    // This guarantees 100% reliability - no more missed actions due to timeouts or bugs.
    // Here we only need to: link orphans + recalculate scores.
    if (hasTimeLeft()) {
      syncLog.push('--- ENGAGEMENT SCORING ---');

      // Link any orphan actions that can now be matched to registered supporters
      try {
        const { data: linkedCount } = await supabaseClient.rpc('link_orphan_engagement_actions', { p_client_id: clientId });
        syncLog.push(`Orphan actions linked: ${linkedCount}`);
      } catch (e) { syncLog.push(`Error linking orphans: ${e}`); }

      // Recalculate scores for ALL supporters of this client
      try {
        const { data: allSupporters } = await supabaseClient
          .from('supporters')
          .select('id')
          .eq('client_id', clientId);
        
        if (allSupporters && allSupporters.length > 0) {
          // Recalculate in parallel batches of 10 for speed
          for (const chunk of chunkArray(allSupporters, 10)) {
            await Promise.all(
              chunk.map(s => supabaseClient.rpc('calculate_engagement_score', { p_supporter_id: s.id }))
            );
          }
          syncLog.push(`Scores recalculated for ${allSupporters.length} supporters`);
        }
      } catch (e) { syncLog.push(`Error recalculating scores: ${e}`); }

      // Snapshot monthly scores
      try {
        await supabaseClient.rpc('snapshot_monthly_scores', { p_client_id: clientId });
      } catch (e) { syncLog.push(`Error snapshotting scores: ${e}`); }
    }

    // ==== SENTIMENT ANALYSIS (only if time left) ====
    let sentimentAnalyzed = 0;
    if (hasTimeLeft(10000)) {
      syncLog.push('--- SENTIMENT ANALYSIS ---');
      try {
        const llmConfig = await getClientLLMConfig(supabaseClient, clientId);
        syncLog.push(`LLM: ${llmConfig.provider}/${llmConfig.model}`);

        const { data: unanalyzed } = await supabaseClient
          .from('comments')
          .select('id, text')
          .eq('client_id', clientId)
          .eq('sentiment', 'neutral')
          .eq('is_page_owner', false)
          .order('created_at', { ascending: false })
          .limit(50); // Reduced from 100

        if (unanalyzed && unanalyzed.length > 0) {
          syncLog.push(`Comments to analyze: ${unanalyzed.length}`);
          
          for (const batch of chunkArray(unanalyzed, 10)) {
            if (!hasTimeLeft(5000)) {
              syncLog.push('Skipping remaining sentiment (time limit)');
              break;
            }

            const batchTexts = batch.map((c: any, i: number) => `[${i + 1}] ${c.text.slice(0, 200)}`).join('\n');
            
            const messages: LLMMessage[] = [{
              role: 'user',
              content: `Classifique o sentimento de cada comentário abaixo. Responda APENAS com o número e o sentimento, um por linha, no formato: "1:positive", "2:negative" ou "3:neutral".\n\n${batchTexts}\n\nResposta:`,
            }];

            try {
              const response = await callLLM(llmConfig, { messages, maxTokens: 200, temperature: 0 });
              const lines = response.content.trim().split('\n');
              
              for (const line of lines) {
                const match = line.match(/(\d+)\s*[:.\-)\s]\s*(positive|negative|neutral)/i);
                if (match) {
                  const idx = parseInt(match[1]) - 1;
                  const sentiment = match[2].toLowerCase();
                  if (idx >= 0 && idx < batch.length && ['positive', 'negative', 'neutral'].includes(sentiment)) {
                    await supabaseClient.from('comments').update({ sentiment }).eq('id', batch[idx].id);
                    sentimentAnalyzed++;
                  }
                }
              }
            } catch (llmErr) {
              syncLog.push(`LLM batch error: ${llmErr}`);
            }
          }
        }
        syncLog.push(`Sentiments analyzed: ${sentimentAnalyzed}`);
      } catch (llmConfigErr) {
        syncLog.push(`LLM config error: ${llmConfigErr}`);
      }
    } else {
      syncLog.push('Sentiment analysis skipped (time limit)');
    }

    // Log action
    await supabaseClient.from('action_logs').insert({
      client_id: clientId,
      user_id: user.id,
      action: 'fetch_meta_comments',
      status: 'success',
      details: { ...stats, posts_limit: postsLimit, sentiment_analyzed: sentimentAnalyzed, runtime_ms: Date.now() - REQUEST_START },
    });

    console.log('=== fetch-meta-comments END ===', stats, `Runtime: ${Date.now() - REQUEST_START}ms`);

    const warnings: string[] = [];
    if (stats.facebookComments > 0 && stats.facebookMissingAuthors > 0) {
      const pct = Math.round((stats.facebookMissingAuthors / stats.facebookComments) * 100);
      if (pct > 90) {
        warnings.push(`⚠️ CRÍTICO: ${pct}% dos comentários do Facebook estão sem autor. Coloque o App Meta em modo "Live".`);
      } else {
        warnings.push(`Facebook: ${stats.facebookMissingAuthors} comentários sem autor identificado.`);
      }
    }
    if (stats.instagramComments > 0 && stats.instagramMissingUsernames > 0) {
      const pct = Math.round((stats.instagramMissingUsernames / stats.instagramComments) * 100);
      if (pct === 100) {
        warnings.push(`⚠️ Instagram: Nenhum @username capturado. Verifique a permissão "instagram_manage_comments".`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Sincronização concluída! ${stats.newComments} novos, ${stats.updatedComments} atualizados (FB: ${stats.facebookComments}, IG: ${stats.instagramComments}).`,
        ...stats, warnings,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in fetch-meta-comments:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    try {
      const sb = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
      if (clientIdVar && userIdVar) {
        await sb.from('action_logs').insert({
          client_id: clientIdVar, user_id: userIdVar,
          action: 'fetch_meta_comments', status: 'error',
          details: { error: errorMessage, sync_log: syncLog, runtime_ms: Date.now() - REQUEST_START },
        });
      }
    } catch (logErr) {
      console.error('Failed to log action error:', logErr);
    }

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
