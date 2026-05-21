import { createClient } from 'npm:@supabase/supabase-js@2.76.1';
import { z } from 'npm:zod@3.23.8';
import { getClientLLMConfig, callLLM, type LLMMessage } from '../_shared/llm-router.ts';
import { getCorrelationId, getRequestId, type TelemetryContext } from '../_shared/telemetry.ts';
import { applyHeuristicGuard } from '../_shared/sentiment-heuristics.ts';
import {
  buildMessages,
  parseAnalysisResponse,
  softenNegativeOnDenunciation,
  isDenunciationPost,
  type Sentiment,
  type CandidateCtx,
  type SentimentAnalysisResult,
} from '../_shared/sentiment-prompts.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-correlation-id, x-request-id',
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
      return new Response(JSON.stringify({ success: false, error: 'No authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = RequestSchema.parse(await req.json());
    const { commentId, clientId } = body;

    const { data: hasAccess } = await supabaseClient.rpc('user_has_client_access', {
      _client_id: clientId, _user_id: user.id,
    });
    if (!hasAccess) {
      return new Response(JSON.stringify({ success: false, error: 'Acesso não autorizado a este cliente' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: comment, error: commentError } = await supabaseClient
      .from('comments')
      .select('text, post_message')
      .eq('id', commentId)
      .eq('client_id', clientId)
      .single();

    if (commentError || !comment) {
      return new Response(JSON.stringify({ success: false, error: 'Comentário não encontrado' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const llmConfig = await getClientLLMConfig(supabaseClient, clientId);
    const telemetryCtx: TelemetryContext = {
      admin: supabaseClient,
      clientId,
      userId: user?.id ?? null,
      functionName: 'analyze-sentiment',
      correlationId: getCorrelationId(req),
      requestId: getRequestId(req),
    };
    console.log(`📡 Using LLM provider: ${llmConfig.provider} for sentiment analysis`);

    const { data: clientCtx } = await supabaseClient
      .from('clients')
      .select('name, cargo')
      .eq('id', clientId)
      .single();
    const ctx: CandidateCtx = {
      candidato: clientCtx?.name || 'o político',
      cargo: clientCtx?.cargo || 'político',
    };

    // Few-shot: prioriza correções onde IA errou negative -> positive/neutral
    const { data: corrections } = await supabaseClient
      .from('sentiment_corrections')
      .select('text, post_message, ai_sentiment, human_sentiment')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(30);

    let analysis = await analyzeWithReasoning(
      llmConfig, comment.text, comment.post_message, ctx, corrections ?? [], telemetryCtx,
    );

    // Guarda heurística clássica (palavras explícitas de ataque)
    analysis.sentiment = applyHeuristicGuard(analysis.sentiment, comment.text, comment.post_message);

    // Guarda nova: se post é denúncia, suaviza falso negativo
    analysis.sentiment = softenNegativeOnDenunciation(
      analysis.sentiment, comment.text, comment.post_message, analysis.target, analysis.alignment,
    );

    // Verificador duplo só roda se ainda for negative E não houver alta confiança
    if (analysis.sentiment === 'negative' && analysis.confidence < 0.85) {
      const verdict = await verifyNegative(llmConfig, comment.text, comment.post_message, ctx, telemetryCtx);
      if (verdict.sentiment !== 'negative') {
        console.log(`✅ Reclassified: negative → ${verdict.sentiment} (${verdict.reason})`);
        analysis.sentiment = verdict.sentiment;
        analysis.reason = verdict.reason || analysis.reason;
        analysis.confidence = Math.min(analysis.confidence, 0.6);
      }
    }

    const needsReview = analysis.confidence < 0.7;

    await supabaseClient
      .from('comments')
      .update({
        sentiment: analysis.sentiment,
        sentiment_source: 'ai',
        sentiment_confidence: analysis.confidence,
        sentiment_reason: analysis.reason || null,
        needs_review: needsReview,
      })
      .eq('id', commentId);

    return new Response(JSON.stringify({
      success: true,
      sentiment: analysis.sentiment,
      confidence: analysis.confidence,
      reason: analysis.reason,
      post_stance: analysis.postStance,
      target: analysis.target,
      alignment: analysis.alignment,
      needs_review: needsReview,
      provider: llmConfig.provider,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error analyzing sentiment:', error);
    const errorMessage = error instanceof z.ZodError
      ? 'Dados inválidos: ' + error.errors.map(e => e.message).join(', ')
      : error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function analyzeWithReasoning(
  llmConfig: { provider: string; apiKey: string; model: string },
  text: string,
  postMessage: string | null,
  ctx: CandidateCtx,
  corrections: Array<{ text: string; post_message: string | null; ai_sentiment: string; human_sentiment: string }>,
  telemetryCtx: TelemetryContext,
): Promise<SentimentAnalysisResult> {
  const messages = buildMessages(text, postMessage, ctx, corrections);
  try {
    const response = await callLLM(llmConfig as any, {
      messages, maxTokens: 200, temperature: 0,
    }, telemetryCtx);
    return parseAnalysisResponse(response.content);
  } catch (error) {
    console.error('Sentiment analysis failed:', error);
    return { sentiment: 'neutral', confidence: 0.3, reason: 'erro na IA', postStance: '', target: '', alignment: '' };
  }
}

async function verifyNegative(
  llmConfig: { provider: string; apiKey: string; model: string },
  text: string,
  postMessage: string | null,
  ctx: CandidateCtx,
  telemetryCtx: TelemetryContext,
): Promise<{ sentiment: Sentiment; reason: string }> {
  const postCtx = postMessage
    ? postMessage.substring(0, 500).replace(/\s+/g, ' ').trim()
    : '(sem contexto do post)';
  const denuncia = isDenunciationPost(postMessage);

  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: `Você é um VERIFICADOR. Uma IA classificou o comentário abaixo como NEGATIVO contra "${ctx.candidato}" (${ctx.cargo}).
Sua tarefa: descobrir se o ALVO da crítica é "${ctx.candidato}" ou se é o PROBLEMA/FATO/TERCEIRO mencionado no post.

${denuncia ? `⚠️ ATENÇÃO: o POST é uma DENÚNCIA/DEFESA do próprio "${ctx.candidato}" contra algo. Palavras fortes no comentário ("absurdo", "vergonha", "revoltante") provavelmente APOIAM a denúncia, NÃO atacam o candidato.\n\n` : ''}Responda JSON em uma linha (sem markdown):
{"alvo":"candidato|fato_do_post|terceiro","s":"positive|negative|neutral","reason":"frase curta"}

Regras:
• Se alvo="fato_do_post" e comentário concorda com a posição do candidato → positive
• Se alvo="fato_do_post" e tom neutro/pergunta → neutral
• Só responda negative se o ATAQUE é claramente contra "${ctx.candidato}"`,
    },
    { role: 'user', content: `POST: "${postCtx}"\nCOMENTÁRIO: "${text}"` },
  ];

  try {
    const response = await callLLM(llmConfig as any, { messages, maxTokens: 120, temperature: 0 }, telemetryCtx);
    const raw = response.content.trim();
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { sentiment: 'negative', reason: '' };
    const parsed = JSON.parse(match[0]);
    const s = String(parsed.s || '').toLowerCase();
    const sentiment: Sentiment = (s === 'positive' || s === 'negative' || s === 'neutral') ? s : 'negative';
    return { sentiment, reason: String(parsed.reason || '').slice(0, 240) };
  } catch {
    return { sentiment: 'negative', reason: '' };
  }
}
