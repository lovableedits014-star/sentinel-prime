import { createClient } from 'npm:@supabase/supabase-js@2.76.1';
import { z } from 'npm:zod@3.23.8';
import { getClientLLMConfig, callLLM, type LLMMessage } from '../_shared/llm-router.ts';
import { getCorrelationId, getRequestId, type TelemetryContext } from '../_shared/telemetry.ts';
import { applyHeuristicGuard } from '../_shared/sentiment-heuristics.ts';
import {
  buildMessages as buildCotMessages,
  parseAnalysisResponse,
  softenNegativeOnDenunciation,
  isDenunciationPost,
  type Sentiment,
  type CandidateCtx,
} from '../_shared/sentiment-prompts.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-correlation-id, x-request-id',
};

const RequestSchema = z.object({
  clientId: z.string().uuid(),
  reanalyzeAll: z.boolean().optional().default(false),
  onlyNegatives: z.boolean().optional().default(false),
  limit: z.number().int().min(1).max(2000).optional(),
});

const MAX_RUNTIME_MS = 50000;

type CommentRow = {
  id: string;
  text: string;
  author_name: string | null;
  post_message: string | null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

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
    const { clientId, reanalyzeAll, onlyNegatives, limit } = body;

    const { data: hasAccess } = await supabaseClient.rpc('user_has_client_access', {
      _client_id: clientId, _user_id: user.id,
    });
    if (!hasAccess) {
      return new Response(JSON.stringify({ success: false, error: 'Acesso não autorizado' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const llmConfig = await getClientLLMConfig(supabaseClient, clientId);
    const telemetryCtx: TelemetryContext = {
      admin: supabaseClient,
      clientId,
      userId: user?.id ?? null,
      functionName: 'batch-analyze-sentiments',
      correlationId: getCorrelationId(req),
      requestId: getRequestId(req),
    };
    console.log(`📡 LLM: ${llmConfig.provider} | mode=${onlyNegatives ? 'only-negatives' : reanalyzeAll ? 'all' : 'pending'}`);

    const { data: clientCtx } = await supabaseClient
      .from('clients')
      .select('name, cargo')
      .eq('id', clientId)
      .single();
    const ctx: CandidateCtx = {
      candidato: clientCtx?.name || 'o político',
      cargo: clientCtx?.cargo || 'político',
    };

    // Few-shot corrections para os fallbacks individuais (CoT)
    const { data: corrections } = await supabaseClient
      .from('sentiment_corrections')
      .select('text, post_message, ai_sentiment, human_sentiment')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(30);

    const PAGE_SIZE = 500;
    let allComments: CommentRow[] = [];
    let page = 0;
    let hasMore = true;
    const hardLimit = limit ?? Infinity;

    while (hasMore && allComments.length < hardLimit) {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabaseClient
        .from('comments')
        .select('id, text, author_name, post_message')
        .eq('client_id', clientId)
        .not('text', 'eq', '__post_stub__')
        .eq('is_page_owner', false)
        .order('comment_created_time', { ascending: false })
        .range(from, to);

      if (onlyNegatives) {
        query = query.eq('sentiment', 'negative').eq('sentiment_source', 'ai');
      } else if (!reanalyzeAll) {
        query = query.is('sentiment', null);
      }

      const { data, error } = await query;
      if (error) throw error;

      allComments = [...allComments, ...(data || [])];
      hasMore = (data?.length || 0) === PAGE_SIZE;
      page++;
    }

    if (limit) allComments = allComments.slice(0, limit);

    console.log(`📊 ${allComments.length} comentários para analisar`);

    if (allComments.length === 0) {
      return new Response(JSON.stringify({
        success: true, analyzed: 0,
        message: onlyNegatives ? 'Nenhum negativo da IA para reanalisar' : 'Todos já foram analisados',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const BATCH_SIZE = 10;
    const startTime = Date.now();
    let analyzed = 0;
    const results = { positive: 0, negative: 0, neutral: 0 };

    for (let i = 0; i < allComments.length; i += BATCH_SIZE) {
      if (Date.now() - startTime > MAX_RUNTIME_MS) {
        console.log(`⏱️ Runtime limit, ${analyzed}/${allComments.length}`);
        break;
      }
      const batch = allComments.slice(i, i + BATCH_SIZE);

      try {
        const sentiments = await analyzeBatch(llmConfig, batch, ctx, corrections ?? [], telemetryCtx);

        for (const { id, sentiment, reason, confidence } of sentiments) {
          const needsReview = confidence < 0.7;
          await supabaseClient
            .from('comments')
            .update({
              sentiment,
              sentiment_source: 'ai',
              sentiment_confidence: confidence,
              sentiment_reason: reason || null,
              needs_review: needsReview,
            })
            .eq('id', id);

          if (sentiment === 'positive') results.positive++;
          else if (sentiment === 'negative') results.negative++;
          else results.neutral++;
          analyzed++;
        }
      } catch (error) {
        console.error(`Batch ${i} failed:`, error);
      }
    }

    const remaining = allComments.length - analyzed;
    return new Response(JSON.stringify({
      success: true, analyzed, remaining, results, provider: llmConfig.provider,
      message: remaining > 0
        ? `Analisados ${analyzed}. Restam ${remaining} — execute novamente para continuar.`
        : `Todos os ${analyzed} comentários foram analisados!`,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('batch-analyze-sentiments error:', error);
    const errorMessage = error instanceof z.ZodError
      ? 'Dados inválidos: ' + error.errors.map(e => e.message).join(', ')
      : error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// --- Batch usando CoT por item (mais lento, porém muito mais preciso) ----

async function analyzeBatch(
  llmConfig: { provider: string; apiKey: string; model: string },
  comments: CommentRow[],
  ctx: CandidateCtx,
  corrections: Array<{ text: string; post_message: string | null; ai_sentiment: string; human_sentiment: string }>,
  telemetryCtx: TelemetryContext,
): Promise<{ id: string; sentiment: Sentiment; reason: string; confidence: number }[]> {
  // Roda cada comentário com chain-of-thought em paralelo limitado (4 por vez)
  const concurrency = 4;
  const out: { id: string; sentiment: Sentiment; reason: string; confidence: number }[] = [];
  for (let i = 0; i < comments.length; i += concurrency) {
    const slice = comments.slice(i, i + concurrency);
    const chunk = await Promise.all(slice.map(async (c) => {
      const messages = buildCotMessages(c.text, c.post_message, ctx, corrections);
      try {
        const response = await callLLM(llmConfig as any, { messages, maxTokens: 200, temperature: 0 }, telemetryCtx);
        const analysis = parseAnalysisResponse(response.content);
        let sentiment = applyHeuristicGuard(analysis.sentiment, c.text, c.post_message);
        sentiment = softenNegativeOnDenunciation(sentiment, c.text, c.post_message, analysis.target, analysis.alignment);

        // Double-check para negativos com confiança baixa
        if (sentiment === 'negative' && analysis.confidence < 0.85) {
          const verdict = await verifyNegative(llmConfig, c.text, c.post_message, ctx, telemetryCtx);
          if (verdict.sentiment !== 'negative') {
            return { id: c.id, sentiment: verdict.sentiment, reason: verdict.reason || analysis.reason, confidence: Math.min(analysis.confidence, 0.6) };
          }
        }
        return { id: c.id, sentiment, reason: analysis.reason, confidence: analysis.confidence };
      } catch (e) {
        console.error(`Item ${c.id} failed:`, e);
        return { id: c.id, sentiment: 'neutral' as Sentiment, reason: '', confidence: 0.3 };
      }
    }));
    out.push(...chunk);
  }
  return out;
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
      content: `Você é um VERIFICADOR. Uma IA marcou este comentário como NEGATIVO contra "${ctx.candidato}" (${ctx.cargo}). Descubra se o alvo da crítica é "${ctx.candidato}" ou é o FATO/PROBLEMA mencionado no post.

${denuncia ? `⚠️ O POST é DENÚNCIA/DEFESA do próprio "${ctx.candidato}". Palavras fortes ("absurdo", "vergonha") provavelmente APOIAM a denúncia.\n\n` : ''}Responda JSON em uma linha:
{"alvo":"candidato|fato_do_post|terceiro","s":"positive|negative|neutral","reason":"frase curta"}

• alvo="fato_do_post" + concorda com candidato → positive
• alvo="fato_do_post" + tom neutro → neutral
• Só "negative" se ataque é contra "${ctx.candidato}".`,
    },
    { role: 'user', content: `POST: "${postCtx}"\nCOMENTÁRIO: "${text}"` },
  ];

  try {
    const response = await callLLM(llmConfig as any, { messages, maxTokens: 120, temperature: 0 }, telemetryCtx);
    const match = response.content.match(/\{[\s\S]*\}/);
    if (!match) return { sentiment: 'negative', reason: '' };
    const parsed = JSON.parse(match[0]);
    const s = String(parsed.s || '').toLowerCase();
    const sentiment: Sentiment = (s === 'positive' || s === 'negative' || s === 'neutral') ? s : 'negative';
    return { sentiment, reason: String(parsed.reason || '').slice(0, 240) };
  } catch {
    return { sentiment: 'negative', reason: '' };
  }
}
