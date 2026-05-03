import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import { z } from 'npm:zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const RequestSchema = z.object({
  commentId: z.string().uuid(),
  clientId: z.string().uuid(),
  action: z.enum(['delete', 'hide', 'unhide', 'block_user']),
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
      return new Response(
        JSON.stringify({ success: false, error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = RequestSchema.parse(await req.json());
    const { commentId, clientId, action } = body;

    // Verify user owns this client
    const { data: client, error: clientError } = await supabaseClient
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .eq('user_id', user.id)
      .single();

    if (clientError || !client) {
      return new Response(
        JSON.stringify({ success: false, error: 'Acesso não autorizado' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get comment
    const { data: comment, error: commentError } = await supabaseClient
      .from('comments')
      .select('comment_id, platform, author_id, platform_user_id')
      .eq('id', commentId)
      .eq('client_id', clientId)
      .single();

    if (commentError || !comment) {
      return new Response(
        JSON.stringify({ success: false, error: 'Comentário não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get integration
    const { data: integration, error: intError } = await supabaseClient
      .from('integrations')
      .select('meta_access_token, meta_page_id')
      .eq('client_id', clientId)
      .single();

    if (intError || !integration?.meta_access_token) {
      return new Response(
        JSON.stringify({ success: false, error: 'Integração Meta não configurada' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Derive page access token
    let pageAccessToken = integration.meta_access_token;
    try {
      const pageTokenResp = await fetch(
        `https://graph.facebook.com/v21.0/${integration.meta_page_id}?fields=access_token&access_token=${integration.meta_access_token}`
      );
      if (pageTokenResp.ok) {
        const pageInfo = await pageTokenResp.json();
        if (pageInfo.access_token) {
          pageAccessToken = pageInfo.access_token;
        }
      }
    } catch (e) {
      console.warn('Could not derive page token:', e);
    }

    const isInstagram = comment.platform === 'instagram';
    let result: { success: boolean; message: string };

    switch (action) {
      case 'delete': {
        const deleteUrl = `https://graph.facebook.com/v21.0/${comment.comment_id}?access_token=${pageAccessToken}`;
        const resp = await fetch(deleteUrl, { method: 'DELETE' });
        
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          const errCode = err?.error?.code;
          console.error('Delete comment error:', err);

          // Comment not found - already deleted on Meta, just clean up locally
          if (errCode === 100) {
            await supabaseClient.from('comments').delete().eq('id', commentId);
            result = { success: true, message: 'Comentário já foi removido da plataforma. Registro local removido.' };
            break;
          }

          const errMsg = err?.error?.message || 'Falha ao excluir comentário';
          return new Response(
            JSON.stringify({ success: false, error: `Erro Meta API: ${errMsg}` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        await supabaseClient.from('comments').delete().eq('id', commentId);
        result = { success: true, message: 'Comentário excluído com sucesso!' };
        break;
      }

      case 'hide': {
        const hideUrl = `https://graph.facebook.com/v21.0/${comment.comment_id}`;
        const hideBody = isInstagram 
          ? { hide: true, access_token: pageAccessToken }
          : { is_hidden: true, access_token: pageAccessToken };
        
        const resp = await fetch(hideUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(hideBody),
        });

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          const errCode = err?.error?.code;
          const errSubcode = err?.error?.error_subcode;
          console.error('Hide comment error:', err);

          // Comment not found (already deleted on Meta) - sync local state
          if (errCode === 100) {
            await supabaseClient.from('comments').delete().eq('id', commentId);
            result = { success: true, message: 'Comentário já foi removido da plataforma. Registro local atualizado.' };
            break;
          }
          // Already hidden/spam (subcode 1446036) - sync local state
          if (errSubcode === 1446036) {
            await supabaseClient.from('comments').update({ is_hidden: true }).eq('id', commentId);
            result = { success: true, message: 'Comentário já estava ocultado. Status atualizado.' };
            break;
          }

          const errMsg = err?.error?.message || 'Falha ao ocultar comentário';
          return new Response(
            JSON.stringify({ success: false, error: `Erro Meta API: ${errMsg}` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        await supabaseClient.from('comments').update({ is_hidden: true }).eq('id', commentId);
        result = { success: true, message: 'Comentário ocultado!' };
        break;
      }

      case 'unhide': {
        const unhideUrl = `https://graph.facebook.com/v21.0/${comment.comment_id}`;
        const unhideBody = isInstagram
          ? { hide: false, access_token: pageAccessToken }
          : { is_hidden: false, access_token: pageAccessToken };
        
        const resp = await fetch(unhideUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(unhideBody),
        });

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          const errMsg = err?.error?.message || 'Falha ao desocultar comentário';
          console.error('Unhide comment error:', err);
          return new Response(
            JSON.stringify({ success: false, error: `Erro Meta API: ${errMsg}` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        await supabaseClient.from('comments').update({ is_hidden: false }).eq('id', commentId);
        result = { success: true, message: 'Comentário desocultado!' };
        break;
      }

      case 'block_user': {
        // Block user from the page
        // Facebook: POST /{page-id}/blocked with user=PSID
        // Instagram: Not directly supported via API - we can only delete comments
        
        const userId = comment.author_id || comment.platform_user_id;
        if (!userId) {
          return new Response(
            JSON.stringify({ success: false, error: 'ID do usuário não disponível para bloqueio' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (isInstagram) {
          // Instagram doesn't have a direct block API for pages
          // We can use the comment moderation to hide all comments
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: 'O Instagram não permite bloqueio de usuários via API. Use o app do Instagram para bloquear este usuário.' 
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const blockUrl = `https://graph.facebook.com/v21.0/${integration.meta_page_id}/blocked`;
        const resp = await fetch(blockUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user: userId,
            access_token: pageAccessToken,
          }),
        });

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          const errMsg = err?.error?.message || 'Falha ao bloquear usuário';
          console.error('Block user error:', err);
          return new Response(
            JSON.stringify({ success: false, error: `Erro Meta API: ${errMsg}` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Auto-hide the comment after blocking the user
        let autoHideMsg = '';
        try {
          const hideResp = await fetch(`https://graph.facebook.com/v21.0/${comment.comment_id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_hidden: true, access_token: pageAccessToken }),
          });
          if (hideResp.ok) {
            await supabaseClient.from('comments').update({ is_hidden: true }).eq('id', commentId);
            autoHideMsg = ' Comentário ocultado automaticamente.';
          } else {
            const hideErr = await hideResp.json().catch(() => ({}));
            // If already hidden or comment gone, still mark locally
            if (hideErr?.error?.error_subcode === 1446036) {
              await supabaseClient.from('comments').update({ is_hidden: true }).eq('id', commentId);
              autoHideMsg = ' Comentário já estava ocultado.';
            } else {
              console.warn('Auto-hide after block failed:', hideErr);
            }
          }
        } catch (e) {
          console.warn('Auto-hide after block exception:', e);
        }

        result = { success: true, message: `Usuário bloqueado da página!${autoHideMsg}` };
        break;
      }

      default:
        return new Response(
          JSON.stringify({ success: false, error: 'Ação inválida' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    // Log action
    await supabaseClient.from('action_logs').insert({
      client_id: clientId,
      user_id: user.id,
      action: `comment_${action}`,
      status: 'success',
      details: { comment_id: commentId, platform: comment.platform }
    });

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in manage-comment:', error);
    const errorMessage = error instanceof z.ZodError 
      ? 'Dados inválidos: ' + error.errors.map(e => e.message).join(', ')
      : error instanceof Error ? error.message : 'Erro desconhecido';
    
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
