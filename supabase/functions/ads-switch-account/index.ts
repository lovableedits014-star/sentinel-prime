// Edge Function: ads-switch-account
// Marca uma conta de anúncio como ativa para o cliente, desativando as demais.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import { z } from 'npm:zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const RequestSchema = z.object({
  clientId: z.string().uuid(),
  metaAdAccountId: z.string().min(3),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return resp({ success: false, error: 'No auth' }, 401);
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (!user) return resp({ success: false, error: 'Unauthorized' }, 401);

    const { clientId, metaAdAccountId } = RequestSchema.parse(await req.json());
    const { data: hasAccess } = await supabase.rpc('user_has_client_access', { _client_id: clientId, _user_id: user.id });
    if (!hasAccess) return resp({ success: false, error: 'Forbidden' }, 403);

    const normId = metaAdAccountId.startsWith('act_') ? metaAdAccountId : `act_${metaAdAccountId.replace(/^act_?/, '')}`;

    const { data: target } = await supabase
      .from('ads_accounts')
      .select('id')
      .eq('client_id', clientId)
      .eq('meta_ad_account_id', normId)
      .maybeSingle();

    if (!target) return resp({ success: false, error: 'Conta não encontrada para este cliente' }, 404);

    // Desativa as outras
    await supabase.from('ads_accounts').update({ ativa: false }).eq('client_id', clientId).neq('id', target.id);
    // Ativa a escolhida
    const { error } = await supabase.from('ads_accounts').update({ ativa: true }).eq('id', target.id);
    if (error) return resp({ success: false, error: error.message }, 500);

    return resp({ success: true, active_account_id: target.id });
  } catch (e) {
    return resp({ success: false, error: (e as Error).message }, 500);
  }
});

function resp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
