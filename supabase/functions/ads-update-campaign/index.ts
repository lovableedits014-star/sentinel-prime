// Edge Function: ads-update-campaign
// Pausar, reativar, encerrar, ajustar orçamento. Todos com auditoria.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import { z } from 'npm:zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const Schema = z.object({
  clientId: z.string().uuid(),
  campaignLocalId: z.string().uuid(),
  action: z.enum(['pause','resume','archive','update_budget']),
  newDailyBudgetCents: z.number().optional(),
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

    const p = Schema.parse(await req.json());
    const { data: hasAccess } = await supabase.rpc('user_has_client_access', { _client_id: p.clientId, _user_id: user.id });
    if (!hasAccess) return resp({ success: false, error: 'Forbidden' }, 403);

    const { data: camp } = await supabase
      .from('ads_campaigns').select('*').eq('id', p.campaignLocalId).eq('client_id', p.clientId).maybeSingle();
    if (!camp) return resp({ success: false, error: 'Campanha não encontrada' }, 404);

    const { data: integration } = await supabase
      .from('integrations').select('meta_access_token').eq('client_id', p.clientId).maybeSingle();
    const token = integration?.meta_access_token;
    if (!token) return resp({ success: false, error: 'Token Meta ausente' }, 400);

    const metaId = camp.meta_campaign_id;
    let body: Record<string, string> = { access_token: token };
    let newLocalStatus = camp.status;
    let newDaily = camp.daily_budget_cents;

    if (p.action === 'pause') { body.status = 'PAUSED'; newLocalStatus = 'PAUSED'; }
    else if (p.action === 'resume') { body.status = 'ACTIVE'; newLocalStatus = 'ACTIVE'; }
    else if (p.action === 'archive') { body.status = 'ARCHIVED'; newLocalStatus = 'ARCHIVED'; }
    else if (p.action === 'update_budget') {
      if (!p.newDailyBudgetCents || p.newDailyBudgetCents < 500) return resp({ success: false, error: 'Orçamento mínimo R$5,00' }, 400);
      body.daily_budget = String(p.newDailyBudgetCents);
      newDaily = p.newDailyBudgetCents;
    }

    const params = new URLSearchParams(body);
    const r = await fetch(`https://graph.facebook.com/v21.0/${metaId}`, { method: 'POST', body: params });
    const data = await r.json();
    if (!r.ok || data.error) return resp({ success: false, error: data.error?.message || 'Falha Meta', meta_error: data.error }, 400);

    await supabase.from('ads_campaigns').update({
      status: newLocalStatus,
      daily_budget_cents: newDaily,
      last_synced_at: new Date().toISOString(),
    }).eq('id', camp.id);

    await supabase.from('ads_audit_log').insert({
      client_id: p.clientId,
      user_id: user.id,
      action: p.action,
      target_type: 'campaign',
      target_id: metaId,
      details: { local_id: camp.id, prev_status: camp.status, new_status: newLocalStatus, prev_budget: camp.daily_budget_cents, new_budget: newDaily },
    });

    return resp({ success: true, status: newLocalStatus, daily_budget_cents: newDaily });
  } catch (e) {
    console.error(e);
    return resp({ success: false, error: (e as Error).message }, 500);
  }
});

function resp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
