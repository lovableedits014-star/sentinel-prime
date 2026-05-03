import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import { z } from 'npm:zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const RequestSchema = z.object({
  clientId: z.string().uuid(),
  checkPermissions: z.boolean().optional(),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = RequestSchema.parse(await req.json());
    const { clientId, checkPermissions = true } = body;

    // Verify user owns this client
    const { data: client, error: clientError } = await supabaseClient
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .eq('user_id', user.id)
      .single();

    if (clientError || !client) {
      return new Response(JSON.stringify({ success: false, error: 'Acesso não autorizado a este cliente' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('=== test-meta-connection START ===');
    console.log('Client:', clientId);

    // Get integration data
    const { data: integration, error: intError } = await supabaseClient
      .from('integrations')
      .select('meta_access_token, meta_page_id, meta_instagram_id')
      .eq('client_id', clientId)
      .single();

    if (intError || !integration?.meta_access_token || !integration?.meta_page_id) {
      return new Response(JSON.stringify({ success: false, error: 'Integração Meta não configurada. Configure seu token de acesso e ID da página.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const storedToken = integration.meta_access_token;
    const pageId = integration.meta_page_id;

    // Step 1: Determine token type by trying to get Page Access Token
    let userToken: string | null = null;
    let pageToken: string = storedToken;
    let tokenType = 'unknown';

    try {
      const pageTokenResp = await fetch(
        `https://graph.facebook.com/v21.0/${pageId}?fields=access_token,name&access_token=${storedToken}`
      );
      
      if (pageTokenResp.ok) {
        const pageInfo = await pageTokenResp.json();
        if (pageInfo.access_token && pageInfo.access_token !== storedToken) {
          userToken = storedToken;
          pageToken = pageInfo.access_token;
          tokenType = 'user_token';
          console.log('Token type: User Access Token (derived Page Token successfully)');
        } else {
          tokenType = 'page_token';
          console.log('Token type: Page Access Token');
        }
      } else {
        // Token might be expired or invalid - return the actual error
        const errBody = await pageTokenResp.json().catch(() => ({}));
        const metaError = errBody?.error?.message || `HTTP ${pageTokenResp.status}`;
        console.error('Failed to validate token:', metaError);
        return new Response(JSON.stringify({ 
          success: false, 
          error: `Erro ao validar token Meta: ${metaError}` 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } catch (e) {
      console.error('Could not determine token type:', e);
      return new Response(JSON.stringify({ 
        success: false, 
        error: `Erro de conexão com Meta API: ${e instanceof Error ? e.message : 'Erro desconhecido'}` 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 2: Test connection - get page info using page token
    const pageResponse = await fetch(
      `https://graph.facebook.com/v21.0/${pageId}?fields=name,id&access_token=${pageToken}`
    );

    if (!pageResponse.ok) {
      const error = await pageResponse.json().catch(() => ({}));
      const metaError = error?.error?.message || `HTTP ${pageResponse.status}`;
      return new Response(JSON.stringify({ 
        success: false, 
        error: `Erro ao conectar com Meta: ${metaError}` 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const pageData = await pageResponse.json();

    // Step 3: Check permissions
    let permissions: { name: string; granted: boolean }[] = [];
    if (checkPermissions) {
      const permToken = userToken || storedToken;
      try {
        const permResp = await fetch(
          `https://graph.facebook.com/v21.0/me/permissions?access_token=${permToken}`
        );
        
        if (permResp.ok) {
          const permData = await permResp.json();
          const grantedPerms = (permData.data || [])
            .filter((p: any) => p.status === 'granted')
            .map((p: any) => p.permission);

          const requiredPerms = [
            'pages_read_engagement',
            'pages_manage_metadata',
            'pages_manage_engagement',
            'pages_show_list',
            'instagram_basic',
            'instagram_manage_comments',
            'public_profile',
          ];

          permissions = requiredPerms.map((name) => ({
            name,
            granted: grantedPerms.includes(name),
          }));
        }
      } catch (e) {
        console.warn('Could not check permissions:', e);
      }
    }

    // Step 4: Test comment fetch
    let commentIdentityTest = { tested: false, working: false, sample: null as any };
    try {
      const testUrl = `https://graph.facebook.com/v21.0/${pageId}/posts?fields=comments.limit(1){from{id,name}}&limit=1&access_token=${pageToken}`;
      const testResp = await fetch(testUrl);
      if (testResp.ok) {
        const testData = await testResp.json();
        const firstComment = testData?.data?.[0]?.comments?.data?.[0];
        commentIdentityTest.tested = true;
        if (firstComment?.from?.id) {
          commentIdentityTest.working = true;
          commentIdentityTest.sample = {
            has_id: !!firstComment.from.id,
            has_name: !!firstComment.from.name,
          };
        }
      }
    } catch (e) {
      console.warn('Comment identity test failed:', e);
    }

    // Step 5: Check Instagram
    let instagramStatus = null;
    if (integration.meta_instagram_id) {
      try {
        const igResp = await fetch(
          `https://graph.facebook.com/v21.0/${integration.meta_instagram_id}?fields=id,username&access_token=${pageToken}`
        );
        if (igResp.ok) {
          const igData = await igResp.json();
          instagramStatus = { connected: true, username: igData.username || igData.id };
        } else {
          instagramStatus = { connected: false, error: 'Could not fetch IG account' };
        }
      } catch (e) {
        instagramStatus = { connected: false, error: String(e) };
      }
    }

    // Log action
    await supabaseClient.from('action_logs').insert({
      client_id: clientId,
      user_id: user.id,
      action: 'test_meta_connection',
      status: 'success',
      details: { 
        page_name: pageData.name, 
        page_id: pageData.id,
        token_type: tokenType,
        permissions_checked: permissions.length,
        comment_identity_test: commentIdentityTest,
        instagram_status: instagramStatus,
      }
    });

    console.log('=== test-meta-connection END ===');

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Conexão bem-sucedida!',
        page_name: pageData.name,
        page_id: pageData.id,
        token_type: tokenType,
        permissions,
        comment_identity: commentIdentityTest,
        instagram: instagramStatus,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error testing Meta connection:', error);
    const errorMessage = error instanceof z.ZodError 
      ? 'Dados inválidos'
      : error instanceof Error
      ? error.message
      : 'Erro desconhecido';
    
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
