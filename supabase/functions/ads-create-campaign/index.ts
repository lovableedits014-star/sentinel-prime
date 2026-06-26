// Edge Function: ads-create-campaign
// Roda o Guard Eleitoral, e se aprovado, cria Campaign + AdSet + Creative + Ad na Meta Marketing API.
// Persiste localmente em ads_campaigns/ads_adsets/ads_creatives.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import { z } from 'npm:zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const Schema = z.object({
  clientId: z.string().uuid(),
  nome: z.string().min(3),
  objetivo: z.enum(['OUTCOME_AWARENESS','OUTCOME_TRAFFIC','OUTCOME_ENGAGEMENT','OUTCOME_LEADS','OUTCOME_SALES']),
  texto_principal: z.string().min(5),
  texto_descricao: z.string().default(''),
  call_to_action: z.string().default('LEARN_MORE'),
  link_destino: z.string().url().optional(),
  imagem_url: z.string().url().optional(),
  page_id: z.string().optional(),
  budget_diario_cents: z.number().min(500), // R$5 mínimo
  budget_total_cents: z.number().default(0),
  start_time: z.string(),
  stop_time: z.string().optional(),
  audience: z.object({
    cidades: z.array(z.object({ key: z.string(), name: z.string() })).default([]),
    estados: z.array(z.string()).default([]),
    radius_km: z.number().default(0),
    age_min: z.number().min(18).default(18),
    age_max: z.number().max(65).default(65),
    genders: z.array(z.number()).default([]),
    interesses: z.array(z.object({ id: z.string(), name: z.string() })).default([]),
  }),
  gerado_por_ia: z.boolean().default(false),
  mencoes_adversarios: z.array(z.string()).default([]),
  force_publish: z.boolean().default(false), // só publica se guard aprovou
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

    const { data: account } = await supabase
      .from('ads_accounts').select('*').eq('client_id', p.clientId).eq('ativa', true).maybeSingle();
    if (!account) return resp({ success: false, error: 'Conta não cadastrada' }, 400);

    const { data: integration } = await supabase
      .from('integrations').select('meta_access_token').eq('client_id', p.clientId).maybeSingle();
    const token = integration?.meta_access_token;
    if (!token) return resp({ success: false, error: 'Token Meta ausente' }, 400);

    // 1) Validação Guard inline
    const guardResp = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/ads-guard-check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({
        clientId: p.clientId,
        nome: p.nome,
        objetivo: p.objetivo,
        texto_principal: p.texto_principal,
        texto_descricao: p.texto_descricao,
        budget_total_cents: p.budget_total_cents || (p.budget_diario_cents * 30),
        budget_diario_cents: p.budget_diario_cents,
        imagem_url: p.imagem_url,
        gerado_por_ia: p.gerado_por_ia,
        mencoes_adversarios: p.mencoes_adversarios,
      }),
    });
    const guard = await guardResp.json();
    if (!guard.success) return resp({ success: false, error: 'Guard falhou', detail: guard }, 400);
    if (!guard.canPublish && !p.force_publish) {
      return resp({ success: false, error: 'Guard bloqueou publicação', guard }, 400);
    }

    const adAccountId = account.meta_ad_account_id;
    const disclaimer = account.disclaimer_pago_por;

    // 2) Criar Campaign
    const campParams = new URLSearchParams({
      name: p.nome,
      objective: p.objetivo,
      status: 'PAUSED', // sempre criar pausado para segurança
      special_ad_categories: JSON.stringify(['ISSUES_ELECTIONS_POLITICS']),
      access_token: token,
    });
    const campResp = await fetch(`https://graph.facebook.com/v21.0/${adAccountId}/campaigns`, { method: 'POST', body: campParams });
    const campData = await campResp.json();
    if (!campResp.ok || campData.error) {
      return resp({ success: false, error: campData.error?.message || 'Falha ao criar campanha Meta', meta_error: campData.error }, 400);
    }
    const campaignId = campData.id;

    // 3) Criar AdSet
    const targeting: any = {
      age_min: p.audience.age_min,
      age_max: p.audience.age_max,
      geo_locations: {
        countries: ['BR'],
        ...(p.audience.cidades.length > 0 ? { cities: p.audience.cidades.map(c => ({ key: c.key, radius: p.audience.radius_km || 10, distance_unit: 'kilometer' })) } : {}),
        ...(p.audience.estados.length > 0 ? { regions: p.audience.estados.map(uf => ({ key: uf })) } : {}),
      },
      ...(p.audience.genders.length > 0 ? { genders: p.audience.genders } : {}),
      ...(p.audience.interesses.length > 0 ? { interests: p.audience.interesses } : {}),
    };
    const adsetParams = new URLSearchParams({
      name: `${p.nome} — Conjunto`,
      campaign_id: campaignId,
      daily_budget: String(p.budget_diario_cents),
      billing_event: 'IMPRESSIONS',
      optimization_goal: p.objetivo === 'OUTCOME_LEADS' ? 'LEAD_GENERATION' : 'REACH',
      targeting: JSON.stringify(targeting),
      status: 'PAUSED',
      start_time: p.start_time,
      ...(p.stop_time ? { end_time: p.stop_time } : {}),
      access_token: token,
    });
    const adsetResp = await fetch(`https://graph.facebook.com/v21.0/${adAccountId}/adsets`, { method: 'POST', body: adsetParams });
    const adsetData = await adsetResp.json();
    if (!adsetResp.ok || adsetData.error) {
      return resp({ success: false, error: adsetData.error?.message || 'Falha ao criar conjunto', meta_error: adsetData.error }, 400);
    }
    const adsetId = adsetData.id;

    // 4) Criar Creative
    const textoFinal = `${p.texto_principal}\n\n${disclaimer}`;
    const creativeBody: any = {
      name: `${p.nome} — Criativo`,
      object_story_spec: {
        page_id: p.page_id || account.meta_page_id_default || undefined,
        link_data: p.imagem_url ? {
          message: textoFinal,
          link: p.link_destino || `https://${adAccountId}.facebook.com`,
          image_url: p.imagem_url,
          call_to_action: { type: p.call_to_action },
          description: p.texto_descricao,
        } : undefined,
      },
      access_token: token,
    };
    const creativeResp = await fetch(`https://graph.facebook.com/v21.0/${adAccountId}/adcreatives`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(creativeBody),
    });
    const creativeData = await creativeResp.json();

    // 5) Persistir local
    const { data: localCamp } = await supabase.from('ads_campaigns').insert({
      client_id: p.clientId,
      ads_account_id: account.id,
      meta_campaign_id: campaignId,
      nome: p.nome,
      objetivo: p.objetivo,
      status: 'PAUSED',
      special_ad_categories: ['ISSUES_ELECTIONS_POLITICS'],
      is_political: true,
      daily_budget_cents: p.budget_diario_cents,
      lifetime_budget_cents: p.budget_total_cents || null,
      start_time: p.start_time,
      stop_time: p.stop_time || null,
      last_synced_at: new Date().toISOString(),
      raw_data: { campaign: campData, adset: adsetData, creative: creativeData, guard },
    }).select().single();

    await supabase.from('ads_audit_log').insert({
      client_id: p.clientId,
      user_id: user.id,
      action: 'create_campaign',
      target_type: 'campaign',
      target_id: campaignId,
      details: { nome: p.nome, objetivo: p.objetivo, budget_diario_cents: p.budget_diario_cents, guard_warnings: guard.warnCount },
    });

    return resp({
      success: true,
      campaign: { id: campaignId, local_id: localCamp?.id, status: 'PAUSED' },
      adset: { id: adsetId },
      creative: creativeData,
      guard,
      message: 'Campanha criada PAUSADA na Meta. Ative pelo painel quando estiver pronto.',
    });
  } catch (e) {
    console.error(e);
    return resp({ success: false, error: (e as Error).message }, 500);
  }
});

function resp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
