import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import { z } from 'npm:zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const RequestSchema = z.object({ clientId: z.string().uuid() });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { clientId } = RequestSchema.parse(await req.json());

    const { data: hasAccess } = await supabaseClient.rpc('user_has_client_access', {
      _client_id: clientId, _user_id: user.id,
    });
    if (!hasAccess) {
      return new Response(JSON.stringify({ success: false, error: 'Acesso não autorizado' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: integration, error: intError } = await supabaseClient
      .from('integrations')
      .select('meta_access_token, meta_page_id')
      .eq('client_id', clientId)
      .single();
    if (intError || !integration?.meta_access_token || !integration?.meta_page_id) {
      return new Response(JSON.stringify({ success: false, error: 'Integração Meta não configurada' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Derive page access token
    let pageAccessToken = integration.meta_access_token;
    try {
      const r = await fetch(`https://graph.facebook.com/v21.0/${integration.meta_page_id}?fields=access_token&access_token=${integration.meta_access_token}`);
      if (r.ok) {
        const j = await r.json();
        if (j.access_token) pageAccessToken = j.access_token;
      }
    } catch (_) { /* ignore */ }

    // Paginate /{page-id}/blocked
    const fetchedIds = new Set<string>();
    const upserts: Array<{
      client_id: string; platform: string; platform_user_id: string;
      author_name: string | null; avatar_url: string | null;
      blocked_by: string; reason: string;
    }> = [];

    let nextUrl: string | null =
      `https://graph.facebook.com/v21.0/${integration.meta_page_id}/blocked?fields=id,name,picture.type(normal){url}&limit=100&access_token=${pageAccessToken}`;

    let pages = 0;
    while (nextUrl && pages < 50) {
      pages++;
      const resp = await fetch(nextUrl);
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        const errMsg = err?.error?.message || `HTTP ${resp.status}`;
        console.error('Meta /blocked error:', err);
        return new Response(JSON.stringify({
          success: false,
          error: `Erro Meta API: ${errMsg}. Talvez seja necessário reconectar a página com a permissão "pages_manage_engagement".`,
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const json = await resp.json();
      const items: any[] = json?.data ?? [];
      for (const it of items) {
        if (!it?.id) continue;
        fetchedIds.add(String(it.id));
        upserts.push({
          client_id: clientId,
          platform: 'facebook',
          platform_user_id: String(it.id),
          author_name: it.name ?? null,
          avatar_url: it?.picture?.data?.url ?? null,
          blocked_by: user.id,
          reason: 'facebook_synced',
        });
      }
      nextUrl = json?.paging?.next ?? null;
    }

    let added = 0;
    if (upserts.length > 0) {
      // Determine which are new vs existing for counts
      const { data: existing } = await supabaseClient
        .from('blocked_users')
        .select('platform_user_id')
        .eq('client_id', clientId)
        .eq('platform', 'facebook');
      const existingSet = new Set((existing ?? []).map((r: any) => r.platform_user_id));
      added = upserts.filter(u => !existingSet.has(u.platform_user_id)).length;

      const { error: upErr } = await supabaseClient
        .from('blocked_users')
        .upsert(upserts, { onConflict: 'client_id,platform,platform_user_id' });
      if (upErr) {
        console.error('Upsert error:', upErr);
        return new Response(JSON.stringify({ success: false, error: `Falha ao salvar: ${upErr.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // Remove local FB records that are no longer blocked on Facebook
    let removed = 0;
    const { data: localFb } = await supabaseClient
      .from('blocked_users')
      .select('id, platform_user_id')
      .eq('client_id', clientId)
      .eq('platform', 'facebook');
    const stale = (localFb ?? []).filter((r: any) => !fetchedIds.has(r.platform_user_id));
    if (stale.length > 0) {
      const { error: delErr } = await supabaseClient
        .from('blocked_users')
        .delete()
        .in('id', stale.map((s: any) => s.id));
      if (!delErr) removed = stale.length;
    }

    await supabaseClient.from('action_logs').insert({
      client_id: clientId,
      user_id: user.id,
      action: 'blocked_users_sync',
      status: 'success',
      details: { total: fetchedIds.size, added, removed, pages },
    });

    return new Response(JSON.stringify({
      success: true,
      total: fetchedIds.size,
      added,
      removed,
      message: `Sincronizado: ${fetchedIds.size} bloqueados (${added} novos, ${removed} removidos).`,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error in sync-blocked-users:', error);
    const msg = error instanceof z.ZodError
      ? 'Dados inválidos: ' + error.errors.map(e => e.message).join(', ')
      : error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(JSON.stringify({ success: false, error: msg }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
