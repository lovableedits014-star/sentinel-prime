import { z } from 'npm:zod@3.23.8';
import { callLLM, type LLMConfig, type LLMMessage } from '../_shared/llm-router.ts';
import { getCorrelationId, getRequestId, type TelemetryContext } from '../_shared/telemetry.ts';
import { requireClientAccess } from '../_shared/auth-guard.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-correlation-id, x-request-id',
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

const TEST_TIMEOUT_MS = 18000;

function classifyLLMTestError(error: unknown): { message: string; type: string; status: number } {
  const raw = error instanceof Error ? error.message : String(error || 'Erro desconhecido');
  const msg = raw.toLowerCase();
  if (msg.includes('timeout') || msg.includes('aborted')) {
    return { message: 'Timeout — o provider demorou a responder.', type: 'timeout', status: 408 };
  }
  if (msg.includes('401') || msg.includes('unauthorized') || msg.includes('invalid api key') || msg.includes('api key')) {
    return { message: 'API key inválida ou sem permissão.', type: 'invalid_api_key', status: 400 };
  }
  if (msg.includes('model') && (msg.includes('not found') || msg.includes('does not exist') || msg.includes('invalid'))) {
    return { message: 'Modelo inexistente ou indisponível para esta conta.', type: 'invalid_model', status: 400 };
  }
  if (msg.includes('429') || msg.includes('rate limit') || msg.includes('quota')) {
    return { message: 'Limite de requisições excedido no provider.', type: 'rate_limit', status: 429 };
  }
  if (msg.includes('fetch failed') || msg.includes('network') || msg.includes('503') || msg.includes('502')) {
    return { message: 'Provider indisponível no momento.', type: 'provider_unavailable', status: 503 };
  }
  return { message: raw, type: 'unknown', status: 400 };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: number | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('timeout')), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

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

    console.log('[test-llm-connection] request', {
      clientId,
      provider,
      model: llmConfig.model,
      hasApiKey: !!apiKey,
    });

    const response = await withTimeout(callLLM(llmConfig, {
      messages,
      maxTokens: 20,
      temperature: 0,
    }), TEST_TIMEOUT_MS);

    console.log('[test-llm-connection] success', {
      clientId,
      provider: response.provider,
      model: response.model,
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
    const classified = error instanceof z.ZodError
      ? { message: 'Dados inválidos (clientId/provider/apiKey obrigatórios)', type: 'invalid_payload', status: 400 }
      : classifyLLMTestError(error);

    console.error('[test-llm-connection] failure', {
      type: classified.type,
      message: classified.message,
    });

    return new Response(JSON.stringify({ success: false, error: classified.message, errorType: classified.type }), {
      status: classified.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
