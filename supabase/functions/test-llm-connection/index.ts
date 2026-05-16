import { z } from 'npm:zod@3.23.8';
import { callLLM, type LLMConfig, type LLMMessage } from '../_shared/llm-router.ts';
import { requireClientAccess } from '../_shared/auth-guard.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const RequestSchema = z.object({
  // clientId é OBRIGATÓRIO: garante que o usuário só testa keys dentro de um
  // tenant ao qual ele tem acesso (owner ou team_member). Sem isso, qualquer
  // usuário autenticado poderia "pingar" providers e disparar custo arbitrário.
  clientId: z.string().uuid(),
  provider: z.enum(['groq', 'openai', 'anthropic', 'gemini', 'mistral', 'cohere', 'lovable']),
  apiKey: z.string().min(1),
  model: z.string().optional(),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = RequestSchema.parse(await req.json());
    const { clientId, provider, apiKey, model } = body;

    // Tenant guard: valida JWT do usuário + acesso ao clientId informado.
    // Bloqueia qualquer tentativa cross-tenant de testar credenciais.
    const guard = await requireClientAccess(req, clientId);
    if (!guard.ok) return guard.response;

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

    console.log(`🔄 [test-llm-connection] client=${clientId} provider=${provider}`);

    const response = await callLLM(llmConfig, {
      messages,
      maxTokens: 20,
      temperature: 0,
    });

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
    const errorMessage =
      error instanceof z.ZodError
        ? 'Dados inválidos (clientId/provider/apiKey obrigatórios)'
        : error instanceof Error
        ? error.message
        : 'Erro desconhecido';

    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
