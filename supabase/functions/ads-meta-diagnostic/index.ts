// Edge Function: ads-meta-diagnostic
// AUTOCONNECT: usa o meta_access_token JÁ configurado em integrations,
// descobre automaticamente as contas de anúncio disponíveis (/me/adaccounts),
// grava/atualiza ads_accounts e valida funcionalmente as permissões.
// O usuário NÃO precisa digitar act_XXX nem token.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import { z } from 'npm:zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const RequestSchema = z.object({
  clientId: z.string().uuid(),
});

type Issue = {
  code: string;
  severity: 'block' | 'warn' | 'info';
  title: string;
  why: string;
  howToFix: string;
  link?: string;
};

type DiscoveredAccount = {
  id: string;                // act_XXX
  name: string;
  account_status: number;    // 1 = active
  currency?: string;
  business?: { id: string; name: string } | null;
  disable_reason?: number;
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

    const { clientId } = RequestSchema.parse(await req.json());

    const { data: hasAccess } = await supabase.rpc('user_has_client_access', {
      _client_id: clientId, _user_id: user.id,
    });
    if (!hasAccess) return jsonResp({ success: false, error: 'Acesso negado' }, 403);

    const { data: integration } = await supabase
      .from('integrations')
      .select('meta_access_token')
      .eq('client_id', clientId)
      .maybeSingle();

    const token = integration?.meta_access_token;
    const issues: Issue[] = [];
    let discovered: DiscoveredAccount[] = [];
    let activeAccountRowId: string | null = null;

    const status = {
      client_id: clientId,
      ads_account_id: null as string | null,
      has_ads_management: false,
      has_ads_read: false,
      has_business_management: false,
      has_leads_retrieval: false,
      has_pages_manage_ads: false,
      business_manager_linked: false,
      ad_account_active: false,
      pixel_configured: false,
      political_identity_confirmed: true,
      political_identity_expires_at: null as string | null,
      authorized_advertiser_linked: true,
      disclaimer_configured: true,
      cnpj_eleitoral_set: true,
      raw_response: {} as Record<string, unknown>,
      issues: [] as Issue[],
      overall_status: 'unknown' as 'ok' | 'warning' | 'blocked' | 'unknown',
    };

    if (!token) {
      issues.push({
        code: 'no_meta_integration',
        severity: 'block',
        title: 'Meta ainda não conectado neste cliente',
        why: 'Tráfego Pago reaproveita o mesmo token Meta usado pelo módulo de Comentários/Instagram. Sem ele não há como conectar nas contas de anúncio.',
        howToFix: 'Vá em Configurações → Integrações Meta e conecte a conta. O Tráfego Pago vai se autoconfigurar em seguida.',
        link: '/settings',
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
            howToFix: 'Reconecte a Meta em Configurações → Integrações (gere de preferência um System User Token, que não expira).',
            link: '/settings',
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
        // 2) Permissões via /me/permissions (pode vir vazio para System User Token)
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
        } catch (e) { console.error('permissions check failed', e); }

        // 3) Businesses
        try {
          const bizResp = await fetch(`https://graph.facebook.com/v21.0/me/businesses?fields=id,name&limit=25&access_token=${token}`);
          if (bizResp.ok) {
            const bizData = await bizResp.json();
            if (Array.isArray(bizData.data)) {
              status.has_business_management = true;
              status.business_manager_linked = bizData.data.length > 0;
              status.raw_response.businesses = bizData.data;
            }
          }
        } catch (e) { console.error('businesses check failed', e); }

        // 4) DESCOBERTA das contas de anúncio (o coração do autoconnect)
        try {
          const acctsResp = await fetch(
            `https://graph.facebook.com/v21.0/me/adaccounts?fields=id,name,account_status,currency,business,disable_reason&limit=200&access_token=${token}`
          );
          if (acctsResp.ok) {
            const acctsData = await acctsResp.json();
            discovered = (acctsData.data || []) as DiscoveredAccount[];
            status.has_ads_read = status.has_ads_read || discovered.length >= 0; // se a chamada respondeu, leitura básica existe
            status.raw_response.available_accounts = discovered;
          } else {
            const err = await acctsResp.json().catch(() => ({}));
            issues.push({
              code: 'adaccounts_list_failed',
              severity: 'block',
              title: 'Não foi possível listar contas de anúncio',
              why: err?.error?.message || 'A Meta recusou a chamada /me/adaccounts.',
              howToFix: 'O token precisa ter pelo menos ads_read. Reconecte a Meta com as permissões corretas em Configurações.',
              link: '/settings',
            });
          }
        } catch (e) { console.error('adaccounts discovery failed', e); }

        // 5) Sincroniza tabela ads_accounts com o que foi descoberto
        if (discovered.length > 0) {
          const { data: existing } = await supabase
            .from('ads_accounts')
            .select('id, meta_ad_account_id, ativa')
            .eq('client_id', clientId);

          const existingMap = new Map((existing || []).map(r => [r.meta_ad_account_id, r]));
          const discoveredIds = new Set(discovered.map(d => d.id));

          // Upsert das descobertas
          for (const acct of discovered) {
            const row = existingMap.get(acct.id);
            const base = {
              client_id: clientId,
              meta_ad_account_id: acct.id,
              nome: acct.name,
              moeda: acct.currency || null,
              business_id: acct.business?.id || null,
              business_name: acct.business?.name || null,
              account_status: acct.account_status,
            };
            if (row) {
              await supabase.from('ads_accounts').update(base).eq('id', row.id);
            } else {
              await supabase.from('ads_accounts').insert({ ...base, ativa: false });
            }
          }

          // Marca como inativa qualquer conta que sumiu da Meta
          for (const r of existing || []) {
            if (!discoveredIds.has(r.meta_ad_account_id) && r.ativa) {
              await supabase.from('ads_accounts').update({ ativa: false }).eq('id', r.id);
            }
          }

          // Garante UMA conta ativa: se nenhuma está ativa, escolhe a primeira active (status=1).
          const { data: refreshed } = await supabase
            .from('ads_accounts')
            .select('id, meta_ad_account_id, ativa, account_status')
            .eq('client_id', clientId);
          const anyActive = (refreshed || []).find(r => r.ativa);
          if (!anyActive) {
            const preferred = (refreshed || []).find(r => r.account_status === 1) || (refreshed || [])[0];
            if (preferred) {
              await supabase.from('ads_accounts').update({ ativa: true }).eq('id', preferred.id);
              activeAccountRowId = preferred.id;
            }
          } else {
            activeAccountRowId = anyActive.id;
          }
        }

        // 6) Valida a conta ativa (acesso + pixel)
        const { data: activeAccount } = await supabase
          .from('ads_accounts')
          .select('id, meta_ad_account_id')
          .eq('client_id', clientId)
          .eq('ativa', true)
          .maybeSingle();

        if (activeAccount) {
          status.ads_account_id = activeAccount.id;
          const adAccountId = activeAccount.meta_ad_account_id.startsWith('act_')
            ? activeAccount.meta_ad_account_id
            : `act_${activeAccount.meta_ad_account_id}`;

          try {
            const acctResp = await fetch(
              `https://graph.facebook.com/v21.0/${adAccountId}?fields=name,account_status,business,currency&access_token=${token}`
            );
            if (acctResp.ok) {
              const acctData = await acctResp.json();
              status.has_ads_read = true;
              status.business_manager_linked = status.business_manager_linked || !!acctData.business;
              status.ad_account_active = acctData.account_status === 1;
              status.raw_response.account = acctData;
              if (!status.ad_account_active) {
                issues.push({
                  code: 'ad_account_inactive',
                  severity: 'block',
                  title: `Conta de anúncios inativa (status ${acctData.account_status})`,
                  why: 'Contas inativas, bloqueadas ou em revisão não podem publicar anúncios.',
                  howToFix: 'Abra o Gerenciador de Anúncios da Meta e verifique pendências (pagamento, identidade, etc.).',
                  link: 'https://business.facebook.com/billing_hub/accounts',
                });
              }
            }
          } catch (e) { console.error('active account check failed', e); }

          // Pixel
          try {
            const pixResp = await fetch(
              `https://graph.facebook.com/v21.0/${adAccountId}/adspixels?fields=id,name&limit=1&access_token=${token}`
            );
            if (pixResp.ok) {
              const pixData = await pixResp.json();
              status.pixel_configured = (pixData.data || []).length > 0;
              status.raw_response.pixels = pixData.data;
            }
          } catch (e) { console.error('pixel check failed', e); }
        } else if (discovered.length === 0 && tokenAlive) {
          issues.push({
            code: 'no_adaccounts_visible',
            severity: 'block',
            title: 'O token Meta não enxerga nenhuma conta de anúncio',
            why: 'A conta de usuário/System User conectada não tem acesso a contas de anúncio no Business Manager.',
            howToFix: 'No Business Manager, conceda a este usuário acesso a pelo menos uma conta de anúncio e reconecte.',
            link: 'https://business.facebook.com/settings/ad-accounts',
          });
        }
      }
    }

    status.issues = issues;
    const hasBlock = issues.some(i => i.severity === 'block');
    const hasWarn = issues.some(i => i.severity === 'warn');
    status.overall_status = hasBlock ? 'blocked' : hasWarn ? 'warning' : 'ok';

    await supabase.from('ads_identity_status').insert(status);

    return jsonResp({
      success: true,
      status,
      discovered_accounts: discovered,
      active_account_row_id: activeAccountRowId,
      summary: {
        total: issues.length,
        blocking: issues.filter(i => i.severity === 'block').length,
        warnings: issues.filter(i => i.severity === 'warn').length,
        info: issues.filter(i => i.severity === 'info').length,
      },
    });
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
