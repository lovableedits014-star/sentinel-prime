// Edge Function: ads-sync-campaigns
// Sincronização read-only: traz campanhas/adsets/ads + insights diários dos últimos 30d
// Cache local em ads_campaigns/ads_adsets/ads_creatives/ads_insights_daily

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import { z } from 'npm:zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RequestSchema = z.object({
  clientId: z.string().uuid(),
  daysBack: z.number().min(1).max(90).default(30),
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

    const { clientId, daysBack } = RequestSchema.parse(await req.json());
    const { data: hasAccess } = await supabase.rpc('user_has_client_access', { _client_id: clientId, _user_id: user.id });
    if (!hasAccess) return resp({ success: false, error: 'Forbidden' }, 403);

    const { data: account } = await supabase
      .from('ads_accounts')
      .select('id, meta_ad_account_id')
      .eq('client_id', clientId)
      .eq('ativa', true)
      .maybeSingle();
    if (!account) return resp({ success: false, error: 'Nenhuma conta de anúncio cadastrada' }, 400);

    const { data: integration } = await supabase
      .from('integrations').select('meta_access_token').eq('client_id', clientId).maybeSingle();
    const token = integration?.meta_access_token;
    if (!token) return resp({ success: false, error: 'Token Meta ausente' }, 400);

    const rawId = (account.meta_ad_account_id || '').trim();
    if (!/^(act_)?\d+$/.test(rawId)) {
      return resp({ success: false, error: `ID da conta inválido: "${rawId}". Use o formato act_123456789 (só números após act_).` }, 400);
    }
    const adAccountId = rawId.startsWith('act_') ? rawId : `act_${rawId}`;
    const counts = { campaigns: 0, adsets: 0, ads: 0, insights: 0 };

    // Campanhas
    const campResp = await fetch(
      `https://graph.facebook.com/v21.0/${adAccountId}/campaigns?fields=id,name,objective,status,special_ad_categories,daily_budget,lifetime_budget,start_time,stop_time&limit=200&access_token=${token}`
    );
    if (!campResp.ok) {
      const err = await campResp.json().catch(() => ({}));
      return resp({ success: false, error: err?.error?.message || 'Falha ao buscar campanhas' }, 400);
    }
    const campData = await campResp.json();
    for (const c of (campData.data || [])) {
      await supabase.from('ads_campaigns').upsert({
        client_id: clientId,
        ads_account_id: account.id,
        meta_campaign_id: c.id,
        nome: c.name,
        objetivo: c.objective,
        status: c.status,
        special_ad_categories: c.special_ad_categories || [],
        is_political: (c.special_ad_categories || []).includes('ISSUES_ELECTIONS_POLITICS'),
        daily_budget_cents: c.daily_budget ? parseInt(c.daily_budget) : null,
        lifetime_budget_cents: c.lifetime_budget ? parseInt(c.lifetime_budget) : null,
        start_time: c.start_time || null,
        stop_time: c.stop_time || null,
        last_synced_at: new Date().toISOString(),
        raw_data: c,
      }, { onConflict: 'client_id,meta_campaign_id' });
      counts.campaigns++;
    }

    // Insights account-level diários
    const since = new Date(Date.now() - daysBack * 86400000).toISOString().slice(0, 10);
    const until = new Date().toISOString().slice(0, 10);
    const insResp = await fetch(
      `https://graph.facebook.com/v21.0/${adAccountId}/insights?fields=spend,impressions,reach,clicks,ctr,cpc,cpm,actions&time_increment=1&time_range={"since":"${since}","until":"${until}"}&access_token=${token}`
    );
    if (insResp.ok) {
      const insData = await insResp.json();
      for (const row of (insData.data || [])) {
        const leadAction = (row.actions || []).find((a: any) => a.action_type === 'lead');
        const leads = leadAction ? parseInt(leadAction.value) : 0;
        const spendCents = Math.round(parseFloat(row.spend || '0') * 100);
        await supabase.from('ads_insights_daily').upsert({
          client_id: clientId,
          level: 'account',
          level_id: adAccountId,
          date: row.date_start,
          spend_cents: spendCents,
          impressions: parseInt(row.impressions || '0'),
          reach: parseInt(row.reach || '0'),
          clicks: parseInt(row.clicks || '0'),
          ctr: row.ctr ? parseFloat(row.ctr) : null,
          cpc_cents: row.cpc ? Math.round(parseFloat(row.cpc) * 100) : null,
          cpm_cents: row.cpm ? Math.round(parseFloat(row.cpm) * 100) : null,
          leads,
          cpr_cents: leads > 0 ? Math.round(spendCents / leads) : null,
          raw_data: row,
          synced_at: new Date().toISOString(),
        }, { onConflict: 'client_id,level,level_id,date' });
        counts.insights++;
      }
    }

    await supabase.from('ads_audit_log').insert({
      client_id: clientId,
      user_id: user.id,
      action: 'sync_campaigns',
      target_type: 'account',
      target_id: adAccountId,
      details: counts,
    });

    return resp({ success: true, counts });
  } catch (e) {
    console.error(e);
    return resp({ success: false, error: (e as Error).message }, 500);
  }
});

function resp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
