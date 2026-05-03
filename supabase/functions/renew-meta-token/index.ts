import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import { z } from 'npm:zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const RequestSchema = z.object({
  clientId: z.string().uuid(),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
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
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = RequestSchema.parse(await req.json());
    const { clientId } = body;

    // Verify ownership
    const { data: client } = await supabase
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .eq('user_id', user.id)
      .single();

    if (!client) {
      return new Response(
        JSON.stringify({ success: false, error: 'Acesso não autorizado' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get current token
    const { data: integration } = await supabase
      .from('integrations')
      .select('meta_access_token, meta_page_id, meta_token_type')
      .eq('client_id', clientId)
      .single();

    if (!integration?.meta_access_token) {
      return new Response(
        JSON.stringify({ success: false, error: 'Nenhum token Meta configurado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const currentToken = integration.meta_access_token;

    // Step 1: Try to exchange for a long-lived token
    console.log('🔄 Attempting to exchange for long-lived token...');

    // First check if token is still valid
    const debugResp = await fetch(
      `https://graph.facebook.com/v21.0/debug_token?input_token=${currentToken}&access_token=${currentToken}`
    );
    
    let tokenInfo: any = null;
    let isExpired = false;

    if (debugResp.ok) {
      const debugData = await debugResp.json();
      tokenInfo = debugData.data;
      isExpired = tokenInfo?.is_valid === false;
      console.log('Token debug info:', {
        is_valid: tokenInfo?.is_valid,
        expires_at: tokenInfo?.expires_at ? new Date(tokenInfo.expires_at * 1000).toISOString() : 'never',
        type: tokenInfo?.type,
      });
    }

    if (isExpired) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Token expirado. Você precisa gerar um novo token no Meta for Developers.',
          expired: true,
          token_info: tokenInfo ? {
            expired_at: tokenInfo.expires_at ? new Date(tokenInfo.expires_at * 1000).toISOString() : null,
          } : null,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Try to get long-lived token via the Graph API
    // This requires the App ID and App Secret, which we don't have stored.
    // Instead, we try to get a Page Access Token which is long-lived by default
    // when derived from a long-lived user token.
    
    let newToken = currentToken;
    let newExpiresAt: string | null = null;
    let tokenType = integration.meta_token_type || 'short_lived';
    let renewed = false;

    if (integration.meta_page_id) {
      // Derive page access token - page tokens derived from long-lived user tokens never expire
      const pageResp = await fetch(
        `https://graph.facebook.com/v21.0/${integration.meta_page_id}?fields=access_token,name&access_token=${currentToken}`
      );

      if (pageResp.ok) {
        const pageData = await pageResp.json();
        if (pageData.access_token && pageData.access_token !== currentToken) {
          newToken = pageData.access_token;
          tokenType = 'page_token';
          renewed = true;
          console.log('✅ Derived Page Access Token successfully');

          // Check new token expiration
          const newDebugResp = await fetch(
            `https://graph.facebook.com/v21.0/debug_token?input_token=${newToken}&access_token=${newToken}`
          );
          if (newDebugResp.ok) {
            const newDebugData = await newDebugResp.json();
            const expiresAt = newDebugData.data?.expires_at;
            if (expiresAt && expiresAt > 0) {
              newExpiresAt = new Date(expiresAt * 1000).toISOString();
            } else {
              // expires_at = 0 means never expires
              newExpiresAt = null;
              tokenType = 'long_lived';
            }
          }
        }
      }
    }

    // Also check current token expiration if not renewed
    if (!renewed && tokenInfo?.expires_at) {
      newExpiresAt = tokenInfo.expires_at > 0 
        ? new Date(tokenInfo.expires_at * 1000).toISOString() 
        : null;
    }

    // Save updated token info
    const updateData: Record<string, unknown> = {
      meta_token_type: tokenType,
    };
    if (renewed) {
      updateData.meta_access_token = newToken;
    }
    if (newExpiresAt !== undefined) {
      updateData.meta_token_expires_at = newExpiresAt;
    }

    await supabase
      .from('integrations')
      .update(updateData)
      .eq('client_id', clientId);

    return new Response(
      JSON.stringify({
        success: true,
        renewed,
        token_type: tokenType,
        expires_at: newExpiresAt,
        never_expires: newExpiresAt === null && tokenType === 'long_lived',
        message: renewed
          ? 'Token renovado com sucesso! Token de página derivado.'
          : newExpiresAt
            ? `Token válido até ${new Date(newExpiresAt).toLocaleDateString('pt-BR')}`
            : 'Token válido (sem expiração definida)',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error renewing token:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
