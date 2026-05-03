import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import { z } from 'npm:zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const RequestSchema = z.object({
  commentId: z.string().uuid(),
  clientId: z.string().uuid(),
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
    const { commentId, clientId } = body;

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
      .select('comment_id, platform')
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
    const { data: integration } = await supabaseClient
      .from('integrations')
      .select('meta_access_token, meta_page_id')
      .eq('client_id', clientId)
      .single();

    if (!integration?.meta_access_token) {
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

    if (isInstagram) {
      // Instagram doesn't support liking comments via API
      return new Response(
        JSON.stringify({ success: false, error: 'A API do Instagram não permite curtir comentários. Esta ação só está disponível para Facebook.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Facebook: POST /{comment-id}/likes
    console.log(`👍 Liking comment ${comment.comment_id}...`);
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${comment.comment_id}/likes?access_token=${pageAccessToken}`,
      { method: 'POST' }
    );

    const responseBody = await response.text();

    if (!response.ok) {
      let errorMessage = 'Falha ao curtir comentário';
      try {
        const errorData = JSON.parse(responseBody);
        console.error('❌ Meta API error:', errorData);
        errorMessage = errorData.error?.message || errorMessage;
      } catch {
        console.error('❌ Meta API error (non-JSON):', responseBody);
      }
      return new Response(
        JSON.stringify({ success: false, error: errorMessage }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Comment liked successfully');

    // Log action
    await supabaseClient.from('action_logs').insert({
      client_id: clientId,
      user_id: user.id,
      action: 'react_to_comment',
      status: 'success',
      details: { comment_id: commentId, platform: comment.platform }
    });

    return new Response(
      JSON.stringify({ success: true, message: 'Comentário curtido!' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error reacting to comment:', error);
    const errorMessage = error instanceof z.ZodError 
      ? 'Dados inválidos'
      : error instanceof Error ? error.message : 'Erro desconhecido';
    
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
