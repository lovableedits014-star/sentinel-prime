// Edge Function: ads-guard-check
// Roda os 9 checks do Guard Eleitoral isoladamente antes de publicar uma campanha.
// Recebe payload da campanha pretendida e retorna lista de checks com status.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import { z } from 'npm:zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PERIODO_LIBERADO = new Date('2026-08-16T00:00:00-03:00');

const CampaignPayloadSchema = z.object({
  clientId: z.string().uuid(),
  nome: z.string(),
  objetivo: z.string(),
  texto_principal: z.string().default(''),
  texto_descricao: z.string().default(''),
  call_to_action: z.string().optional(),
  link_destino: z.string().optional(),
  budget_total_cents: z.number().default(0),
  budget_diario_cents: z.number().default(0),
  imagem_url: z.string().optional(),
  gerado_por_ia: z.boolean().default(false),
  mencoes_adversarios: z.array(z.string()).default([]),
});

type Check = {
  code: string;
  label: string;
  status: 'ok' | 'warning' | 'blocked';
  severity: 'block' | 'warn' | 'info';
  message: string;
  fix?: string;
};

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

    const payload = CampaignPayloadSchema.parse(await req.json());
    const { data: hasAccess } = await supabase.rpc('user_has_client_access', { _client_id: payload.clientId, _user_id: user.id });
    if (!hasAccess) return resp({ success: false, error: 'Forbidden' }, 403);

    const { data: account } = await supabase
      .from('ads_accounts').select('*').eq('client_id', payload.clientId).eq('ativa', true).maybeSingle();
    const { data: tseLimits } = await supabase
      .from('ads_tse_limits').select('*').eq('ano_eleicao', 2026);

    const checks: Check[] = [];

    // 1. Período eleitoral liberado
    const now = new Date();
    if (now < PERIODO_LIBERADO) {
      const dias = Math.ceil((PERIODO_LIBERADO.getTime() - now.getTime()) / 86400000);
      checks.push({
        code: 'periodo_eleitoral', label: 'Período eleitoral liberado', status: 'blocked', severity: 'block',
        message: `Faltam ${dias} dias para o início do período permitido (16/ago/2026).`,
        fix: 'Aguarde a data de início do período eleitoral oficial.',
      });
    } else {
      checks.push({ code: 'periodo_eleitoral', label: 'Período eleitoral liberado', status: 'ok', severity: 'info', message: 'Dentro do período permitido pelo TSE.' });
    }

    // 2. Categoria especial será marcada
    checks.push({
      code: 'special_category', label: 'Categoria ISSUES_ELECTIONS_POLITICS', status: 'ok', severity: 'info',
      message: 'Será marcada automaticamente na criação.',
    });

    // 3. Disclaimer configurado
    if (!account?.disclaimer_pago_por) {
      checks.push({
        code: 'disclaimer', label: 'Disclaimer "Pago por..."', status: 'blocked', severity: 'block',
        message: 'Disclaimer não configurado na conta.',
        fix: 'Vá em Conta & Configurações e preencha o disclaimer.',
      });
    } else {
      checks.push({ code: 'disclaimer', label: 'Disclaimer "Pago por..."', status: 'ok', severity: 'info', message: `Será injetado: "${account.disclaimer_pago_por}"` });
    }

    // 4. Identidade Meta confirmada
    if (!account?.identidade_meta_confirmada) {
      checks.push({
        code: 'identidade_meta', label: 'Identidade política Meta confirmada', status: 'blocked', severity: 'block',
        message: 'A confirmação de identidade no Meta não foi marcada como ativa.',
        fix: 'Confira em facebook.com/ID e marque a confirmação em Conta & Configurações.',
      });
    } else if (account.identidade_expira_em) {
      const exp = new Date(account.identidade_expira_em);
      const dias = Math.ceil((exp.getTime() - now.getTime()) / 86400000);
      if (dias < 0) {
        checks.push({ code: 'identidade_meta', label: 'Identidade política Meta', status: 'blocked', severity: 'block',
          message: `Expirada há ${Math.abs(dias)} dias.`, fix: 'Renove a verificação em facebook.com/ID.' });
      } else if (dias <= 30) {
        checks.push({ code: 'identidade_meta', label: 'Identidade política Meta', status: 'warning', severity: 'warn',
          message: `Expira em ${dias} dias.`, fix: 'Renove em breve em facebook.com/ID.' });
      } else {
        checks.push({ code: 'identidade_meta', label: 'Identidade política Meta', status: 'ok', severity: 'info', message: `Válida por mais ${dias} dias.` });
      }
    } else {
      checks.push({ code: 'identidade_meta', label: 'Identidade política Meta', status: 'ok', severity: 'info', message: 'Confirmada (validade não informada).' });
    }

    // 5. CNPJ eleitoral
    if (!account?.cnpj_eleitoral) {
      checks.push({
        code: 'cnpj', label: 'CNPJ eleitoral cadastrado', status: 'blocked', severity: 'block',
        message: 'CNPJ eleitoral não cadastrado.',
        fix: 'Cadastre o CNPJ eleitoral em Conta & Configurações.',
      });
    } else {
      checks.push({ code: 'cnpj', label: 'CNPJ eleitoral cadastrado', status: 'ok', severity: 'info', message: `CNPJ ${account.cnpj_eleitoral}` });
    }

    // 6. Sem menção a adversários (análise simples textual + lista do usuário)
    const textoCompleto = `${payload.texto_principal} ${payload.texto_descricao}`.toLowerCase();
    const adversariosCitados = payload.mencoes_adversarios.filter(adv => textoCompleto.includes(adv.toLowerCase()));
    if (adversariosCitados.length > 0) {
      checks.push({
        code: 'adversarios', label: 'Sem menção a adversários', status: 'blocked', severity: 'block',
        message: `O criativo cita: ${adversariosCitados.join(', ')}.`,
        fix: 'Remova as menções a candidatos adversários — propaganda negativa é vedada pela Meta.',
      });
    } else {
      checks.push({ code: 'adversarios', label: 'Sem menção a adversários', status: 'ok', severity: 'info', message: 'Nenhuma menção detectada.' });
    }

    // 7. Número e cargo do candidato presentes no texto
    const temNumero = account?.candidato_numero && textoCompleto.includes(account.candidato_numero);
    const cargoLabel: Record<string, string[]> = {
      governador: ['governador', 'governadora'],
      senador: ['senador', 'senadora'],
      dep_federal: ['deputado federal', 'deputada federal'],
      dep_estadual: ['deputado estadual', 'deputada estadual'],
    };
    const cargoKeys = account?.candidato_cargo ? (cargoLabel[account.candidato_cargo] ?? []) : [];
    const temCargo = cargoKeys.some(k => textoCompleto.includes(k));
    if (!temNumero || !temCargo) {
      const faltam = [!temNumero ? 'número' : null, !temCargo ? 'cargo' : null].filter(Boolean).join(' e ');
      checks.push({
        code: 'numero_cargo', label: 'Número e cargo no criativo', status: 'warning', severity: 'warn',
        message: `Recomenda-se exibir ${faltam} no texto/imagem para clareza eleitoral.`,
        fix: 'Inclua claramente o número e cargo do candidato no texto principal.',
      });
    } else {
      checks.push({ code: 'numero_cargo', label: 'Número e cargo no criativo', status: 'ok', severity: 'info', message: 'Número e cargo presentes.' });
    }

    // 8. Teto de gasto TSE
    const limite = (tseLimits || []).find((l: any) => l.cargo === account?.candidato_cargo);
    if (limite && payload.budget_total_cents > 0) {
      // Soma gastos já feitos
      const { data: gastoAtual } = await supabase
        .from('ads_insights_daily').select('spend_cents').eq('client_id', payload.clientId).eq('level', 'account');
      const totalGasto = (gastoAtual || []).reduce((s: number, r: any) => s + (r.spend_cents || 0), 0);
      const projetado = totalGasto + payload.budget_total_cents;
      if (projetado > limite.limite_total_cents) {
        checks.push({
          code: 'teto_tse', label: 'Teto de gasto TSE', status: 'blocked', severity: 'block',
          message: `Projeção (R$ ${(projetado / 100).toLocaleString('pt-BR')}) ultrapassa o teto TSE (R$ ${(limite.limite_total_cents / 100).toLocaleString('pt-BR')}).`,
          fix: 'Reduza o orçamento ou consulte sua prestação de contas.',
        });
      } else {
        const restante = limite.limite_total_cents - projetado;
        checks.push({ code: 'teto_tse', label: 'Teto de gasto TSE', status: 'ok', severity: 'info', message: `Sobra R$ ${(restante / 100).toLocaleString('pt-BR')} dentro do teto.` });
      }
    } else {
      checks.push({ code: 'teto_tse', label: 'Teto de gasto TSE', status: 'warning', severity: 'warn', message: 'Limite TSE não cadastrado para este cargo.' });
    }

    // 9. Rótulo IA
    if (payload.gerado_por_ia) {
      checks.push({
        code: 'rotulo_ia', label: 'Rótulo "Conteúdo gerado por IA"', status: 'warning', severity: 'warn',
        message: 'Será aplicado automaticamente o aviso de uso de IA conforme exigência TSE.',
      });
    } else {
      checks.push({ code: 'rotulo_ia', label: 'Rótulo "Conteúdo gerado por IA"', status: 'ok', severity: 'info', message: 'Criativo declarado como humano.' });
    }

    const blockingCount = checks.filter(c => c.status === 'blocked').length;
    const warnCount = checks.filter(c => c.status === 'warning').length;
    const canPublish = blockingCount === 0;

    // Persistir histórico
    await supabase.from('ads_guard_checks').insert({
      client_id: payload.clientId,
      campaign_payload: payload,
      checks,
      blocking_count: blockingCount,
      warning_count: warnCount,
      can_publish: canPublish,
    });

    return resp({ success: true, checks, canPublish, blockingCount, warnCount });
  } catch (e) {
    console.error(e);
    return resp({ success: false, error: (e as Error).message }, 500);
  }
});

function resp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
