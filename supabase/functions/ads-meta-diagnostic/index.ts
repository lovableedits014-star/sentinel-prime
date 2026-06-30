// Edge Function: ads-meta-diagnostic
// Diagnóstico ENXUTO: só checa o essencial para o sistema funcionar
// (token vivo + acesso à conta + conta ativa). Permissões são verificadas
// FUNCIONALMENTE — se a chamada à API retorna dado, a permissão existe.
// Não checa CNPJ eleitoral, disclaimer, identidade política — isso é responsabilidade
// do anunciante dentro do Gerenciador da Meta.

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

    const { data: integration } = await supabase
      .from('integrations')
      .select('meta_access_token')
      .eq('client_id', clientId)
      .maybeSingle();

    const { data: adsAccount } = await supabase
      .from('ads_accounts')
      .select('*')
      .eq('client_id', clientId)
      .eq('ativa', true)
      .maybeSingle();

    const rawId = (adAccountIdOverride || adsAccount?.meta_ad_account_id || '').trim();
    const adAccountId = rawId ? (rawId.startsWith('act_') ? rawId : `act_${rawId.replace(/^act_?/, '')}`) : '';
    const token = integration?.meta_access_token;
    const issues: Issue[] = [];

    // Mantemos o mesmo shape persistido na tabela ads_identity_status,
    // mas os campos eleitorais ficam neutros (não geram bloqueio).
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
      political_identity_confirmed: true,   // não checamos
      political_identity_expires_at: null as string | null,
      authorized_advertiser_linked: true,    // não checamos
      disclaimer_configured: true,           // não checamos
      cnpj_eleitoral_set: true,              // não checamos
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
    } else {
      // 1) Token vivo?
      let tokenAlive = false;
      try {
        const meResp = await fetch(`https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${token}`);
        if (meResp.ok) {
          tokenAlive = true;
          status.raw_response.me = await meResp.json();
        } else {
          const err = await meResp.json().catch(() => ({}));
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

      if (tokenAlive) {
        // 2) Permissões: tenta /me/permissions; se vier vazio (system user token),
        //    cai para verificação FUNCIONAL com chamadas reais.
        try {
          const permResp = await fetch(`https://graph.facebook.com/v21.0/me/permissions?access_token=${token}`);
          if (permResp.ok) {
            const permData = await permResp.json();
            const granted = new Set(
              (permData.data || [])
                .filter((p: any) => p.status === 'granted')
                .map((p: any) => p.permission)
            );
            status.has_ads_management = granted.has('ads_management');
            status.has_ads_read = granted.has('ads_read');
            status.has_business_management = granted.has('business_management');
            status.has_leads_retrieval = granted.has('leads_retrieval');
            status.has_pages_manage_ads = granted.has('pages_manage_ads');
            status.raw_response.permissions = Array.from(granted);
          }
        } catch (e) {
          console.error('permissions check failed', e);
        }

        // 3) Verificação funcional — vale mais que /me/permissions
        try {
          const bizResp = await fetch(`https://graph.facebook.com/v21.0/me/businesses?fields=id,name&limit=1&access_token=${token}`);
          if (bizResp.ok) {
            const bizData = await bizResp.json();
            if (Array.isArray(bizData.data)) {
              status.has_business_management = true;
              status.business_manager_linked = bizData.data.length > 0;
            }
          }
        } catch (e) { console.error('businesses check failed', e); }

        if (adAccountId) {
          // Acesso à conta
          try {
            const acctResp = await fetch(
              `https://graph.facebook.com/v21.0/${adAccountId}?fields=name,account_status,business,currency&access_token=${token}`
            );
            if (acctResp.ok) {
              const acctData = await acctResp.json();
              status.has_ads_read = true; // se leu a conta, tem leitura
              status.business_manager_linked = status.business_manager_linked || !!acctData.business;
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
                title: 'Conta de anúncio não acessível pelo token',
                why: err?.error?.message || `Não foi possível acessar ${adAccountId}.`,
                howToFix: 'Confirme o ID da conta (formato act_XXXXXXXX) e se o token tem acesso a ela no Business Manager.',
              });
            }
          } catch (e) { console.error('account check failed', e); }

          // Leitura de campanhas → confirma ads_read na prática
          try {
            const campResp = await fetch(
              `https://graph.facebook.com/v21.0/${adAccountId}/campaigns?limit=1&access_token=${token}`
            );
            if (campResp.ok) {
              status.has_ads_read = true;
              // Se já tem ads_read funcional, podemos inferir ads_management p/ contas próprias.
              // Não forçamos; deixamos como veio de /me/permissions.
            }
          } catch (e) { console.error('campaigns check failed', e); }

          // Pixel (informativo)
          try {
            const pixResp = await fetch(
              `https://graph.facebook.com/v21.0/${adAccountId}/adspixels?fields=id,name&limit=1&access_token=${token}`
            );
            if (pixResp.ok) {
              const pixData = await pixResp.json();
              status.pixel_configured = (pixData.data || []).length > 0;
              status.raw_response.pixels = pixData.data;
              if (!status.pixel_configured) {
                issues.push({
                  code: 'no_pixel',
                  severity: 'info',
                  title: 'Nenhum Pixel Meta configurado (opcional)',
                  why: 'O Pixel é útil para mensurar conversões e otimizar campanhas de leads, mas não é obrigatório.',
                  howToFix: 'No Gerenciador de Eventos da Meta, crie um Pixel se for usar campanhas de conversão.',
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
            why: 'Você precisa vincular uma conta de anúncio (ID act_XXXXX) ao cliente.',
            howToFix: 'Use o formulário "Conta & Configurações" abaixo e informe o ID da conta.',
          });
        }

        // 4) Permissões mínimas para o sistema funcionar
        if (!status.has_ads_read) {
          issues.push({
            code: 'missing_perm_ads_read',
            severity: 'block',
            title: 'Falta permissão de leitura de anúncios (ads_read)',
            why: 'Sem ads_read não conseguimos sincronizar campanhas nem trazer métricas.',
            howToFix: 'No Business Manager → System User (ou no App), conceda ads_read ao token e refaça a autorização.',
            link: 'https://business.facebook.com/settings/system-users',
          });
        }
        if (!status.has_business_management) {
          issues.push({
            code: 'missing_perm_business_management',
            severity: 'warn',
            title: 'Falta permissão business_management',
            why: 'Sem ela não listamos contas via Business Manager. Se a conta foi acessada diretamente, pode ignorar.',
            howToFix: 'Adicione business_management ao token no Business Manager.',
            link: 'https://business.facebook.com/settings/system-users',
          });
        }
      }
    }

    status.issues = issues;
    const hasBlock = issues.some(i => i.severity === 'block');
    const hasWarn = issues.some(i => i.severity === 'warn');
    status.overall_status = hasBlock ? 'blocked' : hasWarn ? 'warning' : 'ok';

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
