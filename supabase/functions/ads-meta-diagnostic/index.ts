// Edge Function: ads-meta-diagnostic
// Roda checklist completo Meta Ads + verifica configuração eleitoral local
// Persiste resultado em ads_identity_status

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import { z } from 'npm:zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const RequestSchema = z.object({
  clientId: z.string().uuid(),
  adAccountIdOverride: z.string().optional(),
});

type Issue = {
  code: string;
  severity: 'block' | 'warn' | 'info';
  title: string;
  why: string;
  howToFix: string;
  link?: string;
};

const REQUIRED_ADS_PERMS = [
  'ads_management',
  'ads_read',
  'business_management',
  'leads_retrieval',
  'pages_manage_ads',
  'read_insights',
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResp({ success: false, error: 'No authorization header' }, 401);

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) return jsonResp({ success: false, error: 'Unauthorized' }, 401);

    const { clientId, adAccountIdOverride } = RequestSchema.parse(await req.json());

    const { data: hasAccess } = await supabase.rpc('user_has_client_access', {
      _client_id: clientId, _user_id: user.id,
    });
    if (!hasAccess) return jsonResp({ success: false, error: 'Acesso negado' }, 403);

    // 1) Carregar token Meta e conta de anúncio
    const { data: integration } = await supabase
      .from('integrations')
      .select('meta_access_token, meta_page_id, meta_instagram_id')
      .eq('client_id', clientId)
      .maybeSingle();

    const { data: adsAccount } = await supabase
      .from('ads_accounts')
      .select('*')
      .eq('client_id', clientId)
      .eq('ativa', true)
      .maybeSingle();

    const adAccountId = adAccountIdOverride || adsAccount?.meta_ad_account_id;
    const token = integration?.meta_access_token;
    const issues: Issue[] = [];

    const status = {
      client_id: clientId,
      ads_account_id: adsAccount?.id ?? null,
      has_ads_management: false,
      has_ads_read: false,
      has_business_management: false,
      has_leads_retrieval: false,
      has_pages_manage_ads: false,
      business_manager_linked: false,
      ad_account_active: false,
      pixel_configured: false,
      political_identity_confirmed: false,
      political_identity_expires_at: null as string | null,
      authorized_advertiser_linked: false,
      disclaimer_configured: !!adsAccount?.disclaimer_pago_por,
      cnpj_eleitoral_set: !!adsAccount?.cnpj_eleitoral,
      raw_response: {} as Record<string, unknown>,
      issues: [] as Issue[],
      overall_status: 'unknown' as 'ok' | 'warning' | 'blocked' | 'unknown',
    };

    if (!token) {
      issues.push({
        code: 'no_token',
        severity: 'block',
        title: 'Token Meta não configurado',
        why: 'Sem token não conseguimos acessar nenhum dado da sua conta de anúncios.',
        howToFix: 'Vá em Configurações → Integrações Meta e cadastre o token de acesso (de preferência um System User Token).',
      });
      status.overall_status = 'blocked';
    } else {
      // 2) Permissões
      try {
        const permResp = await fetch(`https://graph.facebook.com/v21.0/me/permissions?access_token=${token}`);
        if (permResp.ok) {
          const permData = await permResp.json();
          const granted = new Set((permData.data || []).filter((p: any) => p.status === 'granted').map((p: any) => p.permission));
          status.has_ads_management = granted.has('ads_management');
          status.has_ads_read = granted.has('ads_read');
          status.has_business_management = granted.has('business_management');
          status.has_leads_retrieval = granted.has('leads_retrieval');
          status.has_pages_manage_ads = granted.has('pages_manage_ads');
          status.raw_response.permissions = Array.from(granted);

          for (const perm of REQUIRED_ADS_PERMS) {
            if (!granted.has(perm)) {
              issues.push({
                code: `missing_perm_${perm}`,
                severity: 'block',
                title: `Falta permissão: ${perm}`,
                why: `A Marketing API exige ${perm} para gerenciar anúncios pela plataforma.`,
                howToFix: `No App Meta Developers, adicione ${perm} no App Review e refaça a autorização gerando novo token.`,
                link: 'https://developers.facebook.com/apps',
              });
            }
          }
        } else {
          const err = await permResp.json().catch(() => ({}));
          issues.push({
            code: 'token_invalid',
            severity: 'block',
            title: 'Token Meta inválido ou expirado',
            why: err?.error?.message || 'Não conseguimos validar o token.',
            howToFix: 'Gere um novo token (de preferência System User Token, que não expira) e atualize em Configurações.',
          });
        }
      } catch (e) {
        issues.push({
          code: 'meta_unreachable',
          severity: 'block',
          title: 'Não foi possível conectar à API Meta',
          why: (e as Error).message,
          howToFix: 'Verifique sua conexão e tente novamente em alguns minutos.',
        });
      }

      // 3) Business Manager + conta de anúncio
      if (adAccountId) {
        try {
          const acctResp = await fetch(
            `https://graph.facebook.com/v21.0/${adAccountId}?fields=name,account_status,business,disable_reason,funding_source_details,currency&access_token=${token}`
          );
          if (acctResp.ok) {
            const acctData = await acctResp.json();
            status.business_manager_linked = !!acctData.business;
            status.ad_account_active = acctData.account_status === 1;
            status.raw_response.account = acctData;
            if (!status.ad_account_active) {
              issues.push({
                code: 'ad_account_inactive',
                severity: 'block',
                title: `Conta de anúncios inativa (status ${acctData.account_status})`,
                why: 'Contas inativas, bloqueadas ou em revisão não podem publicar anúncios.',
                howToFix: 'Acesse o Gerenciador de Anúncios da Meta e verifique o motivo. Pode ser pendência de pagamento ou revisão de identidade.',
                link: 'https://business.facebook.com/billing_hub/accounts',
              });
            }
          } else {
            const err = await acctResp.json().catch(() => ({}));
            issues.push({
              code: 'ad_account_not_found',
              severity: 'block',
              title: 'Conta de anúncio não encontrada',
              why: err?.error?.message || `Não foi possível acessar ${adAccountId}.`,
              howToFix: 'Confirme o ID da conta (formato act_XXXXXXXX) e se o token tem acesso a ela.',
            });
          }
        } catch (e) {
          console.error('account check failed', e);
        }

        // 4) Pixel
        try {
          const pixResp = await fetch(
            `https://graph.facebook.com/v21.0/${adAccountId}/adspixels?fields=id,name,last_fired_time&access_token=${token}`
          );
          if (pixResp.ok) {
            const pixData = await pixResp.json();
            status.pixel_configured = (pixData.data || []).length > 0;
            status.raw_response.pixels = pixData.data;
            if (!status.pixel_configured) {
              issues.push({
                code: 'no_pixel',
                severity: 'warn',
                title: 'Nenhum Pixel Meta configurado',
                why: 'O Pixel é necessário para mensurar conversões e otimizar campanhas de leads.',
                howToFix: 'No Gerenciador de Eventos da Meta, crie um Pixel e instale o código no seu site/portal.',
                link: 'https://business.facebook.com/events_manager2',
              });
            }
          }
        } catch (e) { console.error('pixel check failed', e); }
      } else {
        issues.push({
          code: 'no_ad_account',
          severity: 'block',
          title: 'Conta de anúncio não cadastrada',
          why: 'Você precisa vincular uma conta de anúncio (ID act_XXXXX) ao client.',
          howToFix: 'Use o botão "Cadastrar conta de anúncio" abaixo e informe o ID.',
        });
      }
    }

    // 5) Configuração eleitoral local (não depende da API Meta)
    if (!adsAccount?.cnpj_eleitoral) {
      issues.push({
        code: 'no_cnpj_eleitoral',
        severity: 'block',
        title: 'CNPJ eleitoral não cadastrado',
        why: 'Por lei (TSE), todo anúncio político precisa ser pago por CNPJ eleitoral do candidato/partido/coligação.',
        howToFix: 'Cadastre o CNPJ eleitoral assim que o TSE liberar (após o registro de candidatura em 2026).',
      });
    }
    if (!adsAccount?.disclaimer_pago_por) {
      issues.push({
        code: 'no_disclaimer',
        severity: 'block',
        title: 'Disclaimer "Pago por..." não configurado',
        why: 'A Meta exige um aviso de "isenção de responsabilidade" em anúncios políticos identificando quem paga.',
        howToFix: 'Cadastre na ficha da conta: ex: "Pago por João da Silva — CNPJ 12.345.678/0001-90".',
      });
    }
    if (!adsAccount?.candidato_cargo) {
      issues.push({
        code: 'no_cargo',
        severity: 'warn',
        title: 'Cargo do candidato não definido',
        why: 'Sem o cargo não conseguimos aplicar o limite de gasto correto do TSE.',
        howToFix: 'Selecione o cargo (governador, senador, deputado federal/estadual).',
      });
    }

    // Não temos como checar "confirmação de identidade política" via API pública — exige verificação manual
    // Marcamos como warning informativo
    issues.push({
      code: 'manual_identity_check',
      severity: 'info',
      title: 'Confirme sua identidade política Meta manualmente',
      why: 'A Meta exige confirmação de identidade (CPF + selfie + documento) para anunciar sobre eleições no Brasil. Essa verificação não é detectável via API pública — você precisa conferir manualmente.',
      howToFix: 'Acesse facebook.com/ID na conta que vai anunciar. Se o status for "ativo", marque como confirmado abaixo. A verificação expira anualmente.',
      link: 'https://www.facebook.com/ID',
    });

    status.issues = issues;
    const hasBlock = issues.some(i => i.severity === 'block');
    const hasWarn = issues.some(i => i.severity === 'warn');
    status.overall_status = hasBlock ? 'blocked' : hasWarn ? 'warning' : 'ok';

    // Persistir
    await supabase.from('ads_identity_status').insert(status);

    return jsonResp({ success: true, status, summary: {
      total: issues.length,
      blocking: issues.filter(i => i.severity === 'block').length,
      warnings: issues.filter(i => i.severity === 'warn').length,
      info: issues.filter(i => i.severity === 'info').length,
    } });
  } catch (e) {
    console.error('diagnostic error', e);
    return jsonResp({ success: false, error: (e as Error).message }, 500);
  }
});

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
