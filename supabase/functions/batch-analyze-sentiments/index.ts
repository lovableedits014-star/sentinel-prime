import { createClient } from 'npm:@supabase/supabase-js@2.76.1';
import { z } from 'npm:zod@3.23.8';
import { getClientLLMConfig, callLLM, type LLMMessage } from '../_shared/llm-router.ts';
import { applyHeuristicGuard } from '../_shared/sentiment-heuristics.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const RequestSchema = z.object({
  clientId: z.string().uuid(),
  reanalyzeAll: z.boolean().optional().default(false),
});

const MAX_RUNTIME_MS = 50000; // 50s safety margin

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
    const { clientId, reanalyzeAll } = body;

    // Verify user owns the client
    const { data: client, error: clientError } = await supabaseClient
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .eq('user_id', user.id)
      .single();

    if (clientError || !client) {
      return new Response(
        JSON.stringify({ success: false, error: 'Acesso não autorizado' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get LLM config
    const llmConfig = await getClientLLMConfig(supabaseClient, clientId);
    console.log(`📡 Using LLM provider: ${llmConfig.provider} for batch sentiment analysis`);

    // Get political context (candidate name + role) for smarter analysis
    const { data: clientCtx } = await supabaseClient
      .from('clients')
      .select('name, cargo')
      .eq('id', clientId)
      .single();
    const politicalContext = {
      candidato: clientCtx?.name || 'o político',
      cargo: clientCtx?.cargo || 'político',
    };
    console.log(`🎯 Political context: ${politicalContext.candidato} (${politicalContext.cargo})`);

    // Fetch comments needing analysis (paginated, no 1000 limit)
    const PAGE_SIZE = 500;
    let allComments: { id: string; text: string; author_name: string | null; post_message: string | null }[] = [];
    let page = 0;
    let hasMore = true;

    while (hasMore) {
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

      if (!reanalyzeAll) {
        query = query.is('sentiment', null);
      }

      const { data, error } = await query;
      if (error) throw error;

      allComments = [...allComments, ...(data || [])];
      hasMore = (data?.length || 0) === PAGE_SIZE;
      page++;
    }

    console.log(`📊 Found ${allComments.length} comments to analyze`);

    if (allComments.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          analyzed: 0, 
          message: 'Todos os comentários já foram analisados' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process in batches of 10 comments at a time using batch prompt
    const BATCH_SIZE = 10;
    const startTime = Date.now();
    let analyzed = 0;
    let results = { positive: 0, negative: 0, neutral: 0 };

    for (let i = 0; i < allComments.length; i += BATCH_SIZE) {
      // Check runtime
      if (Date.now() - startTime > MAX_RUNTIME_MS) {
        console.log(`⏱️ Runtime limit reached, analyzed ${analyzed}/${allComments.length}`);
        break;
      }

      const batch = allComments.slice(i, i + BATCH_SIZE);
      
      try {
        const sentiments = await analyzeBatch(llmConfig, batch, politicalContext);
        
        // Update each comment
        for (const { id, sentiment } of sentiments) {
          await supabaseClient
            .from('comments')
            .update({ sentiment })
            .eq('id', id);
          
          if (sentiment === 'positive') results.positive++;
          else if (sentiment === 'negative') results.negative++;
          else results.neutral++;
          analyzed++;
        }
      } catch (error) {
        console.error(`Batch ${i} failed:`, error);
        // Continue with next batch
      }
    }

    const remaining = allComments.length - analyzed;
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        analyzed, 
        remaining,
        results,
        provider: llmConfig.provider,
        message: remaining > 0 
          ? `Analisados ${analyzed} comentários. Restam ${remaining} — execute novamente para continuar.`
          : `Todos os ${analyzed} comentários foram analisados!`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in batch sentiment analysis:', error);
    const errorMessage = error instanceof z.ZodError 
      ? 'Dados inválidos: ' + error.errors.map(e => e.message).join(', ')
      : error instanceof Error ? error.message : 'Erro desconhecido';
    
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function analyzeBatch(
  llmConfig: { provider: string; apiKey: string; model: string },
  comments: { id: string; text: string; author_name: string | null; post_message: string | null }[],
  ctx: { candidato: string; cargo: string }
): Promise<{ id: string; sentiment: string }[]> {
  // Build batch prompt with POST CONTEXT for each comment
  const commentList = comments.map((c, idx) => {
    const postCtx = c.post_message
      ? c.post_message.substring(0, 200).replace(/\s+/g, ' ').trim()
      : '(sem contexto do post)';
    return `[${idx + 1}]\n  POST: "${postCtx}"\n  COMENTÁRIO: "${c.text}"`;
  }).join('\n\n');

  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: `Você é um analista de sentimentos RIGOROSO especializado em comentários de redes sociais de políticos brasileiros.

CONTEXTO POLÍTICO (CRÍTICO!):
Você está analisando comentários no perfil de "${ctx.candidato}" (${ctx.cargo}).
SEMPRE interprete o sentimento DO PONTO DE VISTA do dono do perfil (${ctx.candidato}).

⚠️ REGRA SUPREMA — CONTEXTO DO POST:
Cada item traz POST (a publicação) + COMENTÁRIO (o que o usuário escreveu).
Você DEVE ler o POST primeiro para entender sobre o que o comentário fala.
• Se o POST é um CONVITE/EVENTO/INSCRIÇÃO e o COMENTÁRIO é uma PERGUNTA sobre como participar (ex: "Como fazer?", "Como faz para se inscrever?", "Onde é?", "Que horas?", "Tem link?") → NEUTRAL (interesse genuíno, não crítica!)
• Se o POST é um anúncio e o COMENTÁRIO pede informação prática → NEUTRAL
• Perguntas factuais SEM tom de cobrança/ironia → NEUTRAL, NUNCA negative

REGRA DE OURO sobre OUTROS CANDIDATOS:
• Se o comentário ELOGIA, PROJETA FUTURO ou APOIA "${ctx.candidato}" ou ALIADOS dele → POSITIVE
• Se o comentário menciona OUTRO candidato/político em tom de APOIO ou PROJEÇÃO POSITIVA (ex: "tem futuro com nosso pré-candidato", "vai dar certo com fulano", "nosso deputado é o melhor") → POSITIVE
   (Isso é apoio à mesma corrente política — NÃO confunda com crítica!)
• Se o comentário menciona OUTRO candidato em tom de COMPARAÇÃO DEPRECIATIVA contra "${ctx.candidato}" (ex: "fulano é melhor que você", "voto no outro") → NEGATIVE

REGRA PRINCIPAL: "neutral" é uma classificação LEGÍTIMA quando o comentário expressa pedido cívico, expectativa, demanda coletiva ou informação prática SEM atacar ${ctx.candidato}.

CLASSIFICAÇÃO:

"positive" — QUALQUER forma de apoio, elogio, incentivo, gratidão, concordância, defesa, admiração, carinho, esperança, torcida. Inclui:
  • Elogios diretos: "parabéns", "muito bom", "excelente trabalho", "orgulho"
  • Apoio implícito: "tamo junto", "conte comigo", "vai dar certo", "força"
  • Emojis positivos: 👏❤️🙏💪🔥👍😍🥰✅💙💚
  • Agradecimentos: "obrigado", "gratidão", "Deus abençoe"
  • Defesa: "deixa ele trabalhar", "melhor prefeito", "tá certo"
  • Pedidos com tom positivo: "continua assim", "não desista"
  • Marcações com tom de apoio: "@amigo olha que legal"

"negative" — SOMENTE quando houver ataque, ironia destrutiva, ofensa, deboche, acusação ou cobrança claramente hostil contra ${ctx.candidato}. Inclui:
  • Críticas: "não faz nada", "só promessa", "cadê?", "vergonha"
  • Ironia/sarcasmo: "ah claro, vai resolver sim 🤡", "tá de parabéns hein"
  • Cobranças hostis: "e o asfalto?", "minha rua tá abandonada"
  • Emojis negativos: 🤡🗑️🤮😡💩👎🤦‍♂️
  • Xingamentos e ofensas de qualquer tipo
  • Deboche: "kkkk", "😂" quando zombando

"neutral" — quando não há hostilidade contra ${ctx.candidato}, mesmo que exista pedido, expectativa ou cobrança cívica. Inclui:
  • Marcação pura sem opinião: "@fulano"
  • Pergunta factual sem tom: "que horas é o evento?"
  • Comentário puramente informativo: "o endereço é rua X"
  • Pedido coletivo de melhoria sem ataque: "queremos melhorias", "precisamos disso no bairro"
  • Expectativa por entrega sem insulto: "esperamos resultados", "seguimos aguardando"
  • Reivindicação territorial/comunitária sem deboche: "nós precisamos no bairro universitário"

REGRAS OBRIGATÓRIAS:
1. Se há QUALQUER palavra de apoio, elogio ou carinho → positive
2. Se há QUALQUER crítica, reclamação ou ironia → negative  
3. "neutral" SÓ quando é impossível detectar sentimento
4. Emojis sozinhos (❤️👏🙏💪) → positive
5. Risadas em contexto de deboche → negative
6. Na dúvida entre positive e neutral → neutral se for apenas demanda, pedido ou expectativa sem elogio explícito
7. Na dúvida entre negative e neutral → neutral se não houver insulto, sarcasmo, deboche ou ataque direto
8. Comentários religiosos de apoio ("Deus abençoe") → positive
9. Projeções otimistas sobre QUALQUER candidato aliado ("tem futuro", "vai vencer", "é o cara") → positive
10. Palavras como "nosso", "nossa" antes de político/candidato indicam APOIO → positive
11. Comentários como "queremos melhorias", "esperamos resultados" e "precisamos no bairro X" sem ofensa ou deboche → neutral`
    },
    {
      role: 'user',
      content: `EXEMPLOS DE REFERÊNCIA:
POST sobre obras / COMENTÁRIO "Parabéns pelo trabalho" → positive
"Deus abençoe sua gestão" → positive  
"👏👏👏" → positive
"Tamo junto prefeito!" → positive
"Continua assim, tá no caminho certo" → positive
"Meu voto é seu" → positive
"❤️🙏" → positive
"Obrigado por tudo" → positive
"Que Deus te proteja" → positive
"Esse tem futuro com o nosso pré-candidato a deputado Junior" → positive (projeção otimista para aliado)
"Vamos a luta vereador" → positive (incentivo, "vamos juntos")
"Nosso próximo prefeito 💪" → positive
"Tmj meu líder" → positive
"Conta comigo nessa caminhada" → positive
"Só promessa e nada de ação" → negative
"Cadê o asfalto da minha rua?" → negative
"Vergonha 🤡" → negative
"kkkk tá de brincadeira né" → negative
"Pior prefeito da história" → negative
"@maria" → neutral
"Que horas começa?" → neutral
POST sobre audiência pública / COMENTÁRIO "É isso mesmo, queremos melhorias" → neutral
POST sobre reunião de demandas do bairro / COMENTÁRIO "Esperamos resultados dessa reunião" → neutral
POST sobre visita institucional / COMENTÁRIO "Nós precisamos no bairro universitário" → neutral
POST "Inscrições abertas para o Seminário" / COMENTÁRIO "Como fazer" → neutral (pergunta sobre o evento, não crítica)
POST "Inscrições abertas" / COMENTÁRIO "Como faz para se inscrever" → neutral (pergunta prática)
POST sobre evento / COMENTÁRIO "Tem link?" → neutral
POST sobre evento / COMENTÁRIO "Onde é?" → neutral
POST sobre evento / COMENTÁRIO "Posso levar meu filho?" → neutral

Agora classifique cada comentário abaixo. Responda APENAS no formato: número|sentimento (um por linha)

${commentList}

Resposta:`
    }
  ];

  const response = await callLLM(llmConfig as any, {
    messages,
    maxTokens: comments.length * 15,
    temperature: 0,
  });

  // Parse response - try multiple formats the LLM might use
  const responseText = response.content.trim();
  console.log(`🔍 Raw LLM response (first 500 chars): ${responseText.substring(0, 500)}`);
  
  const lines = responseText.split('\n').filter(l => l.trim());
  const results: { id: string; sentiment: string }[] = [];
  const matchedIndices = new Set<number>();

  for (const line of lines) {
    // Try multiple regex patterns for different LLM output formats
    const patterns = [
      /\[?(\d+)\]?\s*[|:\-–—]\s*(positive|negative|neutral)/i,
      /(\d+)\.\s*(positive|negative|neutral)/i,
      /(\d+)\s*[)]\s*(positive|negative|neutral)/i,
      /(\d+)\s+(positive|negative|neutral)/i,
      /^(\d+)\s*[|:\-–—.)\s]\s*["']?.*?["']?\s*[|:\-–—]\s*(positive|negative|neutral)/i,
    ];
    
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        const idx = parseInt(match[1]) - 1;
        const sentiment = match[2].toLowerCase();
        if (idx >= 0 && idx < comments.length && ['positive', 'negative', 'neutral'].includes(sentiment)) {
          if (!matchedIndices.has(idx)) {
            results.push({ id: comments[idx].id, sentiment });
            matchedIndices.add(idx);
          }
        }
        break;
      }
    }
  }

  console.log(`📊 Parsed ${results.length}/${comments.length} from batch response`);

  // For unmatched comments, analyze individually instead of defaulting to neutral
  const unmatchedComments = comments.filter((_, i) => !matchedIndices.has(i));
  if (unmatchedComments.length > 0) {
    console.log(`🔄 Analyzing ${unmatchedComments.length} unmatched comments individually`);
    for (const comment of unmatchedComments) {
      try {
        const sentiment = await analyzeSingle(llmConfig, comment.text, comment.post_message, ctx);
        results.push({ id: comment.id, sentiment });
      } catch (e) {
        console.error(`Failed individual analysis for ${comment.id}:`, e);
        results.push({ id: comment.id, sentiment: 'neutral' });
      }
    }
  }

  for (const result of results) {
    const original = comments.find((comment) => comment.id === result.id);
    if (!original) continue;
    result.sentiment = applyHeuristicGuard(result.sentiment as 'positive' | 'negative' | 'neutral', original.text, original.post_message);
  }

  // 🔒 DOUBLE-CHECK: Re-validate every "negative" with a different prompt to catch false negatives
  console.log(`🔒 Double-checking ${results.filter(r => r.sentiment === 'negative').length} negatives...`);
  for (const r of results) {
    if (r.sentiment !== 'negative') continue;
    const original = comments.find(c => c.id === r.id);
    if (!original) continue;
    try {
      const verdict = await verifyNegative(llmConfig, original.text, original.post_message, ctx);
      if (verdict !== 'negative') {
        console.log(`✅ Reclassified ${r.id}: negative → ${verdict} ("${original.text.substring(0, 60)}")`);
        r.sentiment = verdict;
      }
    } catch (e) {
      console.error(`Double-check failed for ${r.id}:`, e);
    }
  }

  return results;
}

async function analyzeSingle(
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
      content: `Classifique o sentimento de um comentário no perfil de "${ctx.candidato}" (${ctx.cargo}).
Sempre interprete do ponto de vista do dono do perfil. Menções a aliados/candidatos da mesma corrente em tom otimista = positive.
IMPORTANTE: Considere o CONTEXTO DO POST. Perguntas factuais sobre o post (ex: "Como fazer?", "Onde é?", "Tem link?") em posts de evento/inscrição = NEUTRAL, NUNCA negative.
Pedidos comunitários, reivindicações territoriais e expectativas por melhoria sem ataque direto (ex: "queremos melhorias", "esperamos resultados", "precisamos disso no bairro") = NEUTRAL.
- positive: apoio, elogio, incentivo, gratidão, emojis positivos (❤️👏🙏💪🔥)
- negative: crítica hostil, ironia destrutiva, deboche, xingamento, ataque pessoal, emojis negativos (🤡🤮😡)
- neutral: marcações puras, perguntas factuais sobre o post, pedidos de informação prática, cobrança cívica sem hostilidade
Na dúvida entre neutral e negative, escolha neutral se não houver ataque explícito.
Responda APENAS com uma palavra: positive, negative ou neutral.`,
    },
    {
      role: 'user',
      content: `POST: "${postCtx}"\nCOMENTÁRIO: "${text}"`,
    },
  ];

  const response = await callLLM(llmConfig as any, {
    messages,
    maxTokens: 10,
    temperature: 0,
  });

  const result = response.content.toLowerCase().trim().replace(/[^a-z]/g, '');
  if (['positive', 'negative', 'neutral'].includes(result)) {
    return applyHeuristicGuard(result as 'positive' | 'negative' | 'neutral', text, postMessage);
  }
  // Try to extract from longer response
  if (result.includes('positive')) return applyHeuristicGuard('positive', text, postMessage);
  if (result.includes('negative')) return applyHeuristicGuard('negative', text, postMessage);
  return applyHeuristicGuard('neutral', text, postMessage);
}

/**
 * Second-pass validator: re-checks comments classified as "negative"
 * with a stricter prompt focused on detecting actual hostility.
 * Returns the corrected sentiment.
 */
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
      content: `Você é um VERIFICADOR rigoroso. Um analista anterior classificou este comentário como NEGATIVO contra "${ctx.candidato}" (${ctx.cargo}). Sua tarefa é CONFIRMAR ou CORRIGIR.

⚠️ ATENÇÃO AO CONTEXTO DO POST:
Se o POST é um anúncio/convite/evento/inscrição e o COMENTÁRIO é só uma PERGUNTA prática (Como fazer? Onde? Quando? Tem link?) → NÃO é negativo, é NEUTRAL!
Pergunta factual ≠ crítica.

Pedidos comunitários e cobranças cívicas genéricas também NÃO são negativos por si só.
Exemplos: "queremos melhorias", "esperamos resultados", "precisamos disso no bairro" → NEUTRAL se não houver ofensa, deboche ou ataque direto.

Um comentário só é REALMENTE negativo se:
• Critica, ataca, ofende ou debocha de "${ctx.candidato}" especificamente
• Compara desfavoravelmente "${ctx.candidato}" com outros
• Faz cobrança hostil, sarcasmo destrutivo ou xingamento

Um comentário NÃO é negativo (responda positive ou neutral) se:
• Elogia ou projeta futuro otimista para "${ctx.candidato}" ou ALIADOS
• Menciona OUTRO candidato/político da mesma corrente em tom de apoio (ex: "tem futuro com nosso candidato fulano")
• Apenas usa risadas/ironia leve sem alvo claro
• É marcação, pergunta factual sobre o post, ou neutro

ATENÇÃO: "Esse tem futuro com nosso pré-candidato X" é POSITIVE (apoio à corrente, NÃO crítica).
ATENÇÃO: "Como fazer" ou "Como faz para se inscrever" em post de evento = NEUTRAL.

Responda APENAS uma palavra: positive, negative ou neutral.`,
    },
    {
      role: 'user',
      content: `POST: "${postCtx}"\nCOMENTÁRIO a verificar: "${text}"\n\nÉ realmente negativo contra ${ctx.candidato}?`,
    },
  ];

  const response = await callLLM(llmConfig as any, {
    messages,
    maxTokens: 10,
    temperature: 0,
  });

  const result = response.content.toLowerCase().trim().replace(/[^a-z]/g, '');
  if (['positive', 'negative', 'neutral'].includes(result)) return applyHeuristicGuard(result as 'positive' | 'negative' | 'neutral', text, postMessage);
  if (result.includes('positive')) return applyHeuristicGuard('positive', text, postMessage);
  if (result.includes('negative')) return applyHeuristicGuard('negative', text, postMessage);
  if (result.includes('neutral')) return applyHeuristicGuard('neutral', text, postMessage);
  return applyHeuristicGuard('negative', text, postMessage); // se ambíguo, aplica guarda antes de manter
}
