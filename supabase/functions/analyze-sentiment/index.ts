import { createClient } from 'npm:@supabase/supabase-js@2.76.1';
import { z } from 'npm:zod@3.23.8';
import { getClientLLMConfig, callLLM, type LLMMessage } from '../_shared/llm-router.ts';
import { applyHeuristicGuard } from '../_shared/sentiment-heuristics.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const RequestSchema = z.object({
  commentId: z.string().uuid(),
  clientId: z.string().uuid(),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = RequestSchema.parse(await req.json());
    const { commentId, clientId } = body;

    // Verify user owns the client
    const { data: client, error: clientError } = await supabaseClient
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .eq('user_id', user.id)
      .single();

    if (clientError || !client) {
      return new Response(
        JSON.stringify({ success: false, error: 'Acesso não autorizado a este cliente' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get comment (verify it belongs to this client)
    const { data: comment, error: commentError } = await supabaseClient
      .from('comments')
      .select('text, post_message')
      .eq('id', commentId)
      .eq('client_id', clientId)
      .single();

    if (commentError || !comment) {
      return new Response(
        JSON.stringify({ success: false, error: 'Comentário não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get LLM config for this client
    const llmConfig = await getClientLLMConfig(supabaseClient, clientId);
    console.log(`📡 Using LLM provider: ${llmConfig.provider} for sentiment analysis`);

    // Get political context
    const { data: clientCtx } = await supabaseClient
      .from('clients')
      .select('name, cargo')
      .eq('id', clientId)
      .single();
    const ctx = {
      candidato: clientCtx?.name || 'o político',
      cargo: clientCtx?.cargo || 'político',
    };

    // Few-shot learning: load last 20 manual corrections for this client to calibrate the model
    const { data: corrections } = await supabaseClient
      .from('sentiment_corrections')
      .select('text, post_message, ai_sentiment, human_sentiment')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(20);

    let { sentiment, confidence } = await analyzeSentiment(
      llmConfig, comment.text, comment.post_message, ctx, corrections ?? []
    );
    sentiment = applyHeuristicGuard(sentiment as 'positive' | 'negative' | 'neutral', comment.text, comment.post_message);

    // Double-check negatives
    if (sentiment === 'negative') {
      const verdict = await verifyNegative(llmConfig, comment.text, comment.post_message, ctx);
      if (verdict !== 'negative') {
        console.log(`✅ Reclassified: negative → ${verdict}`);
        sentiment = verdict;
        // Lower confidence if the verifier disagreed
        confidence = Math.min(confidence, 0.5);
      }
    }

    const needsReview = confidence < 0.7;

    // Update comment (only if not already human-classified — protected by trigger anyway)
    await supabaseClient
      .from('comments')
      .update({
        sentiment,
        sentiment_source: 'ai',
        sentiment_confidence: confidence,
        needs_review: needsReview,
      })
      .eq('id', commentId);

    return new Response(
      JSON.stringify({ success: true, sentiment, confidence, needs_review: needsReview, provider: llmConfig.provider }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error analyzing sentiment:', error);
    const errorMessage = error instanceof z.ZodError 
      ? 'Dados inválidos: ' + error.errors.map(e => e.message).join(', ')
      : error instanceof Error
      ? error.message
      : 'Erro desconhecido';
    
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function analyzeSentiment(
  llmConfig: { provider: string; apiKey: string; model: string },
  text: string,
  postMessage: string | null,
  ctx: { candidato: string; cargo: string }
  ,
  corrections: Array<{ text: string; post_message: string | null; ai_sentiment: string; human_sentiment: string }> = [],
): Promise<{ sentiment: string; confidence: number }> {
  const postCtx = postMessage
    ? postMessage.substring(0, 200).replace(/\s+/g, ' ').trim()
    : '(sem contexto do post)';

  // Build few-shot examples block from past human corrections
  let fewShot = '';
  if (corrections.length > 0) {
    const examples = corrections.slice(0, 12).map((c, i) => {
      const post = c.post_message ? c.post_message.substring(0, 120).replace(/\s+/g, ' ').trim() : '(sem post)';
      const txt = c.text.substring(0, 200).replace(/\s+/g, ' ').trim();
      return `Exemplo ${i + 1}:
POST: "${post}"
COMENTÁRIO: "${txt}"
❌ IA tinha dito: ${c.ai_sentiment}
✅ Resposta correta: ${c.human_sentiment}`;
    }).join('\n\n');
    fewShot = `\n\n📚 APRENDIZADOS COM CORREÇÕES MANUAIS DO USUÁRIO (siga este padrão):\n${examples}\n\nUse esses exemplos para calibrar sua próxima classificação.`;
  }

  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: `Você classifica sentimentos de comentários no perfil de "${ctx.candidato}" (${ctx.cargo}). Sempre interprete do ponto de vista do dono do perfil.

⚠️ USE O CONTEXTO DO POST: você recebe POST + COMENTÁRIO. Perguntas factuais sobre o post (ex: "Como fazer?", "Onde é?", "Tem link?", "Que horas?") em posts de evento/inscrição/anúncio = NEUTRAL, NUNCA negative.

⚠️ COBRANÇA CÍVICA NÃO É ATAQUE: pedidos coletivos, reivindicações territoriais e expectativa por melhoria sem ofensa direta (ex: "queremos melhorias", "esperamos resultados", "precisamos disso no bairro") = NEUTRAL.

Menções a aliados/candidatos da mesma corrente em tom otimista = POSITIVE.
- positive: elogio, apoio, incentivo, gratidão, emojis positivos (❤️👏🙏💪)
- negative: crítica hostil, ironia destrutiva, deboche, xingamento, emojis negativos (🤡🤮)
- neutral: marcações puras, perguntas factuais sobre o post, pedidos de informação prática, demandas cívicas sem hostilidade
Na dúvida entre neutral e negative, escolha neutral se não houver ataque direto.${fewShot}

FORMATO DE RESPOSTA OBRIGATÓRIO (JSON em uma linha):
{"s":"positive|negative|neutral","c":0.0-1.0}
Onde "c" é sua confiança (1.0 = certeza absoluta, 0.5 = incerto, 0.3 = chute). Se você está em dúvida, use c<0.7.`,
    },
    {
      role: 'user',
      content: `Classifique o sentimento e responda APENAS o JSON {"s":"...","c":0.x}:

POST: "${postCtx}"
COMENTÁRIO: "${text}"`,
    },
  ];

  try {
    const response = await callLLM(llmConfig as any, {
      messages,
      maxTokens: 40,
      temperature: 0,
    });

    const raw = response.content.trim();
    // Try parsing JSON first
    let sentiment: string = 'neutral';
    let confidence = 0.6;
    try {
      const match = raw.match(/\{[^}]+\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (typeof parsed.s === 'string') sentiment = parsed.s.toLowerCase().trim();
        if (typeof parsed.c === 'number') confidence = Math.max(0, Math.min(1, parsed.c));
      }
    } catch { /* fallthrough to text parsing */ }

    if (!['positive', 'negative', 'neutral'].includes(sentiment)) {
      const lower = raw.toLowerCase();
      if (lower.includes('positive')) sentiment = 'positive';
      else if (lower.includes('negative')) sentiment = 'negative';
      else sentiment = 'neutral';
      confidence = Math.min(confidence, 0.5);
    }

    return {
      sentiment: applyHeuristicGuard(sentiment as 'positive' | 'negative' | 'neutral', text, postMessage),
      confidence,
    };
  } catch (error) {
    console.error('Sentiment analysis failed:', error);
    return { sentiment: applyHeuristicGuard('neutral', text, postMessage), confidence: 0.3 };
  }
}

async function verifyNegative(
  llmConfig: { provider: string; apiKey: string; model: string },
  text: string,
  postMessage: string | null,
  ctx: { candidato: string; cargo: string }
): Promise<string> {
  const postCtx = postMessage
    ? postMessage.substring(0, 200).replace(/\s+/g, ' ').trim()
    : '(sem contexto do post)';
  const messages: LLMMessage[] = [
    {
      role: 'system',
        content: `Você é um VERIFICADOR. Um analista classificou este comentário como NEGATIVO contra "${ctx.candidato}" (${ctx.cargo}). Confirme ou corrija.

⚠️ ATENÇÃO AO POST: Se o POST é anúncio/evento/inscrição e o COMENTÁRIO é só pergunta prática (Como fazer? Onde? Tem link?) → NEUTRAL, não negativo!

⚠️ DEMANDA CÍVICA TAMBÉM NÃO É NEGATIVA: "queremos melhorias", "esperamos resultados", "precisamos disso no bairro" = NEUTRAL se não houver ataque direto.

REALMENTE negativo só se: critica/ataca/debocha/ofende "${ctx.candidato}" especificamente, ou faz comparação desfavorável.

NÃO é negativo (responda positive ou neutral) se: elogia/projeta futuro para "${ctx.candidato}" OU ALIADOS, menciona outro candidato da mesma corrente em tom de apoio (ex: "tem futuro com nosso pré-candidato X" = POSITIVE), é pergunta prática sobre o post, ou é neutro/factual.

Responda APENAS: positive, negative ou neutral.`,
    },
    { role: 'user', content: `POST: "${postCtx}"\nCOMENTÁRIO: "${text}"\n\nÉ realmente negativo contra ${ctx.candidato}?` },
  ];

  try {
    const response = await callLLM(llmConfig as any, { messages, maxTokens: 10, temperature: 0 });
    const result = response.content.toLowerCase().trim().replace(/[^a-z]/g, '');
    if (['positive', 'negative', 'neutral'].includes(result)) return applyHeuristicGuard(result as 'positive' | 'negative' | 'neutral', text, postMessage);
    if (result.includes('positive')) return applyHeuristicGuard('positive', text, postMessage);
    if (result.includes('neutral')) return applyHeuristicGuard('neutral', text, postMessage);
    return applyHeuristicGuard('negative', text, postMessage);
  } catch {
    return applyHeuristicGuard('negative', text, postMessage);
  }
}
