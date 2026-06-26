// Edge Function: ads-ai-suggestions
// Lê insights dos últimos 14 dias por campanha, usa Lovable AI para gerar sugestões de otimização.
// Status sempre 'pendente' (modo aprovação obrigatória).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import { z } from 'npm:zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const Schema = z.object({ clientId: z.string().uuid() });

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

    // Pega campanhas ativas + insights 14d
    const { data: camps } = await supabase
      .from('ads_campaigns').select('*').eq('client_id', p.clientId).in('status', ['ACTIVE','PAUSED']);

    const { data: insights } = await supabase
      .from('ads_insights_daily').select('*').eq('client_id', p.clientId)
      .gte('date', new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10));

    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) return resp({ success: false, error: 'LOVABLE_API_KEY ausente' }, 500);

    const prompt = `Você é um estrategista de tráfego pago eleitoral. Analise os dados abaixo e proponha 1 a 4 sugestões objetivas, em português brasileiro, para melhorar performance.

Cada sugestão DEVE ter:
- tipo: aumentar_orcamento | reduzir_orcamento | pausar | trocar_criativo | expandir_publico | duplicar_campanha
- titulo: frase curta (até 60 chars)
- descricao: 1-2 frases claras
- motivo: dados que sustentam (ex: "CPR caiu 30% nos últimos 7 dias")
- impacto_estimado: ex: "+30% leads", "-20% CPR"
- prioridade: alta | media | baixa
- ads_campaign_local_id: id local da campanha alvo (uuid) ou null se for sugestão geral

Dados:
Campanhas: ${JSON.stringify((camps || []).map(c => ({ id: c.id, nome: c.nome, status: c.status, daily_budget_cents: c.daily_budget_cents, objetivo: c.objetivo })))}
Insights diários agregados: ${JSON.stringify((insights || []).slice(0, 14))}

Responda APENAS um JSON: { "suggestions": [...] }. Sem texto extra.`;

    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Lovable-API-Key': apiKey },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      }),
    });
    if (!aiResp.ok) {
      const errText = await aiResp.text();
      if (aiResp.status === 429) return resp({ success: false, error: 'IA com limite — tente novamente em alguns minutos' }, 429);
      if (aiResp.status === 402) return resp({ success: false, error: 'Créditos da IA esgotados — adicione créditos no workspace' }, 402);
      return resp({ success: false, error: `IA falhou: ${errText}` }, 500);
    }
    const aiData = await aiResp.json();
    const content = aiData.choices?.[0]?.message?.content || '{}';
    let parsed: any;
    try { parsed = JSON.parse(content); } catch { parsed = { suggestions: [] }; }

    const sugs = (parsed.suggestions || []).slice(0, 6);
    const rows = sugs.map((s: any) => ({
      client_id: p.clientId,
      ads_campaign_id: s.ads_campaign_local_id || null,
      tipo: s.tipo || 'outra',
      titulo: String(s.titulo || 'Sugestão').slice(0, 200),
      descricao: String(s.descricao || ''),
      motivo: String(s.motivo || ''),
      impacto_estimado: String(s.impacto_estimado || ''),
      prioridade: ['alta','media','baixa'].includes(s.prioridade) ? s.prioridade : 'media',
      status: 'pendente',
      acao_proposta: s.acao_proposta || {},
    }));

    if (rows.length > 0) {
      await supabase.from('ads_ai_suggestions').insert(rows);
    }

    return resp({ success: true, generated: rows.length });
  } catch (e) {
    console.error(e);
    return resp({ success: false, error: (e as Error).message }, 500);
  }
});

function resp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
