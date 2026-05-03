import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import { z } from 'npm:zod@3.23.8';
import { callLLM, type LLMConfig, type LLMMessage } from '../_shared/llm-router.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const RequestSchema = z.object({
  provider: z.enum(['groq', 'openai', 'anthropic', 'gemini', 'mistral', 'cohere', 'lovable']),
  apiKey: z.string().min(1),
  model: z.string().optional(),
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
    const { provider, apiKey, model } = body;

    const defaultModels: Record<string, string> = {
      lovable: 'google/gemini-2.5-flash',
      openai: 'gpt-4o-mini',
      anthropic: 'claude-3-haiku-20240307',
      gemini: 'gemini-1.5-flash',
      groq: 'llama-3.1-8b-instant',
      mistral: 'mistral-small-latest',
      cohere: 'command-r',
    };

    const llmConfig: LLMConfig = {
      provider: provider as any,
      apiKey,
      model: model || defaultModels[provider],
    };

    const messages: LLMMessage[] = [
      { role: 'user', content: 'Responda apenas com a palavra "conectado" para confirmar a conexão.' },
    ];

    console.log(`🔄 Testing connection to ${provider}...`);

    const response = await callLLM(llmConfig, {
      messages,
      maxTokens: 20,
      temperature: 0,
    });

    console.log(`✅ Connection to ${provider} successful`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Conexão com ${provider} estabelecida com sucesso!`,
        provider: response.provider,
        model: response.model,
        response: response.content,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error testing LLM connection:', error);
    const errorMessage = error instanceof z.ZodError 
      ? 'Dados inválidos'
      : error instanceof Error 
      ? error.message
      : 'Erro desconhecido';
    
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
