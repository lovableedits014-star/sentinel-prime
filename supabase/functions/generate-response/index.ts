import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import { z } from 'npm:zod@3.23.8';
import { getClientLLMConfig, callLLM, type LLMMessage } from '../_shared/llm-router.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const RequestSchema = z.object({
  commentId: z.string().uuid(),
  clientId: z.string().uuid(),
  userGuidance: z.string().max(500).optional(),
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
    const { commentId, clientId, userGuidance } = body;

    // Verify user owns this client
    const { data: client, error: clientError } = await supabaseClient
      .from('clients')
      .select('id, name, cargo')
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
      .select('text, sentiment, post_message, post_full_picture, post_media_type, author_name')
      .eq('id', commentId)
      .eq('client_id', clientId)
      .single();

    // Get custom prompt from integrations
    const { data: integration } = await supabaseClient
      .from('integrations')
      .select('ai_custom_prompt')
      .eq('client_id', clientId)
      .single();
    
    const customPrompt = integration?.ai_custom_prompt || null;

    if (commentError || !comment) {
      return new Response(
        JSON.stringify({ success: false, error: 'Comentário não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get LLM config for this client
    const llmConfig = await getClientLLMConfig(supabaseClient, clientId);
    console.log(`📡 Using LLM provider: ${llmConfig.provider}, model: ${llmConfig.model}`);

    const aiResponse = await generateResponse(
      llmConfig,
      comment.text,
      comment.sentiment,
      client.name || '',
      client.cargo || '',
      comment.post_message,
      comment.post_full_picture,
      comment.post_media_type,
      comment.author_name,
      customPrompt,
      userGuidance
    );

    // Auto-classify sentiment if not yet classified
    let sentiment = comment.sentiment;
    if (!sentiment) {
      try {
        sentiment = await analyzeSentimentQuick(llmConfig, comment.text);
        console.log(`🎯 Auto-classified sentiment: ${sentiment}`);
      } catch (e) {
        console.warn('⚠️ Auto-sentiment failed (non-critical):', e);
      }
    }

    // Update comment with AI response + sentiment
    const updateData: Record<string, any> = { ai_response: aiResponse };
    if (sentiment && !comment.sentiment) {
      updateData.sentiment = sentiment;
    }
    await supabaseClient
      .from('comments')
      .update(updateData)
      .eq('id', commentId);

    // Log action
    await supabaseClient.from('action_logs').insert({
      client_id: clientId,
      user_id: user.id,
      action: 'generate_response',
      status: 'success',
      details: { comment_id: commentId, provider: llmConfig.provider, model: llmConfig.model }
    });

    return new Response(
      JSON.stringify({ success: true, response: aiResponse, provider: llmConfig.provider }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error generating response:', error);
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

async function generateResponse(
  llmConfig: { provider: string; apiKey: string; model: string },
  commentText: string,
  sentiment: string,
  clientName: string,
  cargo: string,
  postMessage?: string,
  postFullPicture?: string,
  postMediaType?: string,
  authorName?: string,
  customPrompt?: string | null,
  userGuidance?: string
): Promise<string> {
  const sentimentContext = sentiment === 'positive' 
    ? 'O comentário é POSITIVO. Agradeça de forma institucional e empática.'
    : sentiment === 'negative'
    ? 'O comentário é NEGATIVO. Responda com empatia, profissionalismo e ofereça ajuda para resolver a situação.'
    : 'O comentário é NEUTRO. Responda de forma profissional e cordial.';

  const postContext = postMessage 
    ? `\n\n📄 CONTEXTO DA POSTAGEM ORIGINAL:\nTítulo/Texto: "${postMessage}"${postMediaType ? `\nTipo de mídia: ${postMediaType === 'video' ? 'Vídeo' : postMediaType === 'photo' ? 'Imagem/Foto' : 'Texto'}` : ''}\n\n⚠️ IMPORTANTE: Use este contexto para gerar uma resposta relevante e específica à postagem.`
    : '\n\n⚠️ Postagem sem contexto textual disponível. Gere uma resposta genérica mas cordial.';

  const authorContext = authorName && authorName !== 'Desconhecido' && authorName !== 'Unknown'
    ? `\n👤 Nome do usuário que comentou: ${authorName}`
    : '';

  const customInstructions = customPrompt 
    ? `\n\n📋 INSTRUÇÕES PERSONALIZADAS DO CLIENTE:\n${customPrompt}`
    : '';

  const guidanceInstructions = userGuidance
    ? `\n\n🎯 ORIENTAÇÃO DO OPERADOR PARA ESTA RESPOSTA:\n${userGuidance}\n⚠️ PRIORIZE esta orientação ao gerar a resposta.`
    : '';

  const systemPrompt = `Você é o assistente digital de ${clientName}${cargo ? `, que é ${cargo}` : ''}.

${sentimentContext}${postContext}${authorContext}${customInstructions}${guidanceInstructions}

✅ REGRAS OBRIGATÓRIAS:
- Máximo 2-3 frases (não seja prolixo)
- Tom profissional e empático
- Agradeça se positivo, ofereça ajuda se negativo
- CONTEXTUALIZE sua resposta com base no conteúdo da postagem original
- Sem promessas políticas ou compromissos irrealistas
- Sem agressividade ou sarcasmo
- Se o comentário for sobre o conteúdo da postagem, mencione isso na resposta`;

  const userPrompt = `💬 COMENTÁRIO DO USUÁRIO:
"${commentText}"

🎯 Gere uma resposta CONTEXTUALIZADA e EMPÁTICA para este comentário público:`;

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  try {
    console.log('📡 Calling LLM via router...');
    const response = await callLLM(llmConfig as any, {
      messages,
      maxTokens: 200,
      temperature: 0.8,
    });

    console.log(`✅ Response generated via ${response.provider}`);
    return response.content.trim();
    
  } catch (error) {
    console.error('❌ LLM call failed:', error);
    return `Obrigado pelo seu comentário! Estamos analisando sua mensagem e retornaremos em breve.`;
  }
}

async function analyzeSentimentQuick(
  llmConfig: { provider: string; apiKey: string; model: string },
  text: string
): Promise<string> {
  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: `Classifique o sentimento de comentários em redes sociais de políticos brasileiros.
- positive: apoio, elogio, incentivo, gratidão, emojis positivos (❤️👏🙏💪🔥)
- negative: crítica, reclamação, ironia, deboche, xingamento, emojis negativos (🤡🤮😡)
- neutral: SOMENTE marcações puras ou perguntas factuais sem emoção
Na dúvida, escolha positive ou negative. Neutral é RARO.
Responda APENAS com uma palavra: positive, negative ou neutral.`,
    },
    { role: 'user', content: `"${text}"` },
  ];

  const response = await callLLM(llmConfig as any, {
    messages,
    maxTokens: 10,
    temperature: 0,
  });

  const result = response.content.toLowerCase().trim().replace(/[^a-z]/g, '');
  if (['positive', 'negative', 'neutral'].includes(result)) return result;
  if (result.includes('positive')) return 'positive';
  if (result.includes('negative')) return 'negative';
  return 'neutral';
}
