import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import { z } from 'npm:zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const RequestSchema = z.object({
  clientId: z.string().uuid(),
  action: z.enum(['delete', 'hide', 'unhide', 'block_user', 'unblock_user']),
  commentId: z.string().uuid().optional(),
  blockedUserId: z.string().uuid().optional(),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

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

    const body = RequestSchema.parse(await req.json());
    const { commentId, clientId, action, blockedUserId } = body;

    const { data: hasAccess } = await supabaseClient.rpc('user_has_client_access', {
      _client_id: clientId, _user_id: user.id,
    });
    if (!hasAccess) {
      return new Response(JSON.stringify({ success: false, error: 'Acesso não autorizado' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get integration (needed for all actions)
    const { data: integration, error: intError } = await supabaseClient
      .from('integrations')
      .select('meta_access_token, meta_page_id')
      .eq('client_id', clientId)
      .single();
    if (intError || !integration?.meta_access_token) {
      return new Response(JSON.stringify({ success: false, error: 'Integração Meta não configurada' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Derive page access token
    let pageAccessToken = integration.meta_access_token;
    try {
      const pageTokenResp = await fetch(
        `https://graph.facebook.com/v21.0/${integration.meta_page_id}?fields=access_token&access_token=${integration.meta_access_token}`
      );
      if (pageTokenResp.ok) {
        const pageInfo = await pageTokenResp.json();
        if (pageInfo.access_token) pageAccessToken = pageInfo.access_token;
      }
    } catch (e) { console.warn('Could not derive page token:', e); }

    let result: { success: boolean; message: string };

    // === UNBLOCK USER (uses blockedUserId, no commentId) ===
    if (action === 'unblock_user') {
      if (!blockedUserId) {
        return new Response(JSON.stringify({ success: false, error: 'blockedUserId é obrigatório' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const { data: blocked, error: bErr } = await supabaseClient
        .from('blocked_users')
        .select('id, platform, platform_user_id, author_name')
        .eq('id', blockedUserId)
        .eq('client_id', clientId)
        .single();
      if (bErr || !blocked) {
        return new Response(JSON.stringify({ success: false, error: 'Bloqueio não encontrado' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      let apiMsg = '';
      if (blocked.platform === 'facebook') {
        const unblockUrl = `https://graph.facebook.com/v21.0/${integration.meta_page_id}/blocked?user=${blocked.platform_user_id}&access_token=${pageAccessToken}`;
        const resp = await fetch(unblockUrl, { method: 'DELETE' });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          console.warn('Unblock Meta error:', err);
          apiMsg = ` (Meta: ${err?.error?.message || 'falha'})`;
        }
      } else {
        apiMsg = ' (Instagram não suporta desbloqueio via API — remova manualmente pelo app)';
      }

      await supabaseClient.from('blocked_users').delete().eq('id', blockedUserId);
      result = { success: true, message: `Usuário desbloqueado!${apiMsg}` };

      await supabaseClient.from('action_logs').insert({
        client_id: clientId, user_id: user.id,
        action: `comment_${action}`, status: 'success',
        details: { blocked_user_id: blockedUserId, platform: blocked.platform },
      });
      return new Response(JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === ACTIONS THAT NEED A COMMENT ===
    if (!commentId) {
      return new Response(JSON.stringify({ success: false, error: 'commentId é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: comment, error: commentError } = await supabaseClient
      .from('comments')
      .select('comment_id, platform, author_id, platform_user_id, author_name, avatar_url')
      .eq('id', commentId)
      .eq('client_id', clientId)
      .single();
    if (commentError || !comment) {
      return new Response(JSON.stringify({ success: false, error: 'Comentário não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const isInstagram = comment.platform === 'instagram';

    switch (action) {
      case 'delete': {
        const resp = await fetch(`https://graph.facebook.com/v21.0/${comment.comment_id}?access_token=${pageAccessToken}`, { method: 'DELETE' });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          if (err?.error?.code === 100) {
            await supabaseClient.from('comments').delete().eq('id', commentId);
            result = { success: true, message: 'Comentário já foi removido da plataforma. Registro local removido.' };
            break;
          }
          return new Response(JSON.stringify({ success: false, error: `Erro Meta API: ${err?.error?.message || 'Falha ao excluir'}` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        await supabaseClient.from('comments').delete().eq('id', commentId);
        result = { success: true, message: 'Comentário excluído com sucesso!' };
        break;
      }

      case 'hide':
      case 'unhide': {
        const isHide = action === 'hide';
        const body = isInstagram
          ? { hide: isHide, access_token: pageAccessToken }
          : { is_hidden: isHide, access_token: pageAccessToken };
        const resp = await fetch(`https://graph.facebook.com/v21.0/${comment.comment_id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          if (err?.error?.code === 100 && isHide) {
            await supabaseClient.from('comments').delete().eq('id', commentId);
            result = { success: true, message: 'Comentário já removido da plataforma. Registro atualizado.' };
            break;
          }
          if (err?.error?.error_subcode === 1446036 && isHide) {
            await supabaseClient.from('comments').update({ is_hidden: true }).eq('id', commentId);
            result = { success: true, message: 'Comentário já estava ocultado.' };
            break;
          }
          return new Response(JSON.stringify({ success: false, error: `Erro Meta API: ${err?.error?.message || 'Falha'}` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        await supabaseClient.from('comments').update({ is_hidden: isHide }).eq('id', commentId);
        result = { success: true, message: isHide ? 'Comentário ocultado!' : 'Comentário desocultado!' };
        break;
      }

      case 'block_user': {
        const userId = comment.author_id || comment.platform_user_id;
        if (!userId) {
          return new Response(JSON.stringify({ success: false, error: 'ID do usuário não disponível' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        let apiMsg = '';
        let apiSuccess = false;

        if (!isInstagram) {
          const resp = await fetch(`https://graph.facebook.com/v21.0/${integration.meta_page_id}/blocked`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user: userId, access_token: pageAccessToken }),
          });
          if (resp.ok) {
            apiSuccess = true;
            apiMsg = 'Usuário bloqueado da página!';
            // Auto-hide
            try {
              const hideResp = await fetch(`https://graph.facebook.com/v21.0/${comment.comment_id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_hidden: true, access_token: pageAccessToken }),
              });
              if (hideResp.ok) {
                await supabaseClient.from('comments').update({ is_hidden: true }).eq('id', commentId);
                apiMsg += ' Comentário ocultado.';
              }
            } catch (_) { /* ignore */ }
          } else {
            const err = await resp.json().catch(() => ({}));
            console.error('Block error:', err);
            apiMsg = `Erro Meta API: ${err?.error?.message || 'Falha ao bloquear'}`;
          }
        } else {
          // Instagram - no API support, but still register locally
          apiMsg = 'Instagram não permite bloqueio via API. Registrado localmente — bloqueie manualmente pelo app.';
          apiSuccess = true; // allow local record
        }

        if (apiSuccess) {
          // Insert/upsert into blocked_users
          await supabaseClient.from('blocked_users').upsert({
            client_id: clientId,
            platform: comment.platform,
            platform_user_id: userId,
            author_name: comment.author_name,
            avatar_url: comment.avatar_url,
            blocked_by: user.id,
            reason: isInstagram ? 'instagram_manual' : 'facebook_api',
          }, { onConflict: 'client_id,platform,platform_user_id' });
          result = { success: true, message: apiMsg };
        } else {
          return new Response(JSON.stringify({ success: false, error: apiMsg }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        break;
      }

      default:
        return new Response(JSON.stringify({ success: false, error: 'Ação inválida' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    await supabaseClient.from('action_logs').insert({
      client_id: clientId, user_id: user.id,
      action: `comment_${action}`, status: 'success',
      details: { comment_id: commentId, platform: comment.platform },
    });

    return new Response(JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error in manage-comment:', error);
    const errorMessage = error instanceof z.ZodError
      ? 'Dados inválidos: ' + error.errors.map(e => e.message).join(', ')
      : error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(JSON.stringify({ success: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
