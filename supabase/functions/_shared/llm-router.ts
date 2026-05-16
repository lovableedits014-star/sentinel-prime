/**
 * Multi-LLM Router - Routes requests to different LLM providers based on client configuration
 */
import { logLLMUsage, classifyError, type TelemetryContext } from './telemetry.ts';

export type LLMProvider = 'groq' | 'openai' | 'anthropic' | 'gemini' | 'mistral' | 'cohere' | 'lovable';

export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  model: string;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMRequest {
  messages: LLMMessage[];
  maxTokens?: number;
  temperature?: number;
}

export interface LLMResponse {
  content: string;
  provider: LLMProvider;
  model: string;
  usage?: number;
}

// Default models for each provider
export const DEFAULT_MODELS: Record<LLMProvider, string> = {
  lovable: 'google/gemini-2.5-flash',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-haiku-20240307',
  gemini: 'gemini-2.5-flash',
  groq: 'llama-3.1-8b-instant',
  mistral: 'mistral-small-latest',
  cohere: 'command-r',
};

// Provider API endpoints (Gemini usa o endpoint OpenAI-compatible para suportar tool calling)
const PROVIDER_ENDPOINTS: Record<LLMProvider, string> = {
  lovable: 'https://ai.gateway.lovable.dev/v1/chat/completions',
  openai: 'https://api.openai.com/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  mistral: 'https://api.mistral.ai/v1/chat/completions',
  cohere: 'https://api.cohere.ai/v1/chat',
};

/**
 * Get LLM configuration from client integrations
 */
export async function getClientLLMConfig(
  supabaseClient: any,
  clientId: string
): Promise<LLMConfig> {
  const { data: integration } = await supabaseClient
    .from('integrations')
    .select('llm_provider, llm_api_key, llm_model')
    .eq('client_id', clientId)
    .single();

  // If client has custom config, use it
  if (integration && integration.llm_provider && integration.llm_api_key) {
    return {
      provider: integration.llm_provider as LLMProvider,
      apiKey: integration.llm_api_key,
      model:
        integration.llm_model ||
        DEFAULT_MODELS[integration.llm_provider as LLMProvider],
    };
  }

  // SECURITY/ISOLATION: NÃO existe mais fallback global de credencial.
  // Cada tenant DEVE possuir seu próprio provedor + api_key em integrations.
  // Fallbacks anteriores (DEFAULT_LLM_API_KEY, LOVABLE_API_KEY) foram removidos
  // para impedir consumo cruzado, billing compartilhado e bypass de isolamento.
  throw new Error(
    `LLM_CONFIG_MISSING: tenant ${clientId} não possui llm_provider/llm_api_key configurados em integrations. Configure em Configurações > Integrações.`,
  );
}

/**
 * Low-level call for OpenAI-compatible providers — supports tool calling and any extra body fields.
 * Use this when you need tool_calls/tool_choice/response_format.
 * Throws an Error with `.status` set on non-2xx so callers can map 429/402.
 */
const OPENAI_COMPATIBLE: LLMProvider[] = ['lovable', 'openai', 'groq', 'mistral', 'gemini'];

export function isOpenAICompatible(provider: LLMProvider): boolean {
  return OPENAI_COMPATIBLE.includes(provider);
}

// Models that don't reliably support OpenAI-style tool calling.
// When these are selected and tools are requested, we auto-upgrade to a tools-capable sibling.
const TOOLS_UPGRADE_MAP: Record<string, string> = {
  // Groq: 8b is fraco para tools — sobe para 70b versatile
  'llama-3.1-8b-instant': 'llama-3.3-70b-versatile',
  'llama3-8b-8192': 'llama-3.3-70b-versatile',
  'mixtral-8x7b-32768': 'llama-3.3-70b-versatile',
};

/** Returns a tools-capable model for the given provider/model pair. */
export function pickToolsCapableModel(provider: LLMProvider, model: string): string {
  if (provider === 'groq' && TOOLS_UPGRADE_MAP[model]) return TOOLS_UPGRADE_MAP[model];
  return model;
}

export async function callLLMRaw(
  config: LLMConfig,
  body: Record<string, any>,
  ctx?: TelemetryContext,
): Promise<any> {
  if (!OPENAI_COMPATIBLE.includes(config.provider)) {
    const err: any = new Error(
      `Provedor "${config.provider}" não suporta tool calling. Use OpenAI, Groq, Gemini, Mistral ou Lovable AI nas Configurações.`,
    );
    err.status = 400;
    throw err;
  }
  // Auto-upgrade weak models when caller is using tools
  const usesTools = Array.isArray((body as any).tools) && (body as any).tools.length > 0;
  const effectiveModel = usesTools ? pickToolsCapableModel(config.provider, config.model) : config.model;
  const endpoint = PROVIDER_ENDPOINTS[config.provider];

  const startedAt = Date.now();
  let retries = 0;
  const maxAttempts = 4;
  let lastErrText = '';
  let lastStatus = 0;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: effectiveModel, ...body }),
    });
    if (resp.ok) {
      const data = await resp.json();
      if (ctx) {
        logLLMUsage(ctx, {
          provider: config.provider,
          model: effectiveModel,
          latencyMs: Date.now() - startedAt,
          promptTokens: data?.usage?.prompt_tokens,
          completionTokens: data?.usage?.completion_tokens,
          totalTokens: data?.usage?.total_tokens,
          retries,
          success: true,
        });
      }
      return data;
    }

    lastStatus = resp.status;
    lastErrText = await resp.text();
    if ([429, 500, 502, 503, 504].includes(resp.status) && attempt < maxAttempts) {
      retries++;
      let waitMs = 0;
      const retryAfter = resp.headers.get('retry-after');
      if (retryAfter) waitMs = Math.ceil(parseFloat(retryAfter) * 1000);
      if (!waitMs) {
        const m = lastErrText.match(/try again in ([\d.]+)s/i);
        if (m) waitMs = Math.ceil(parseFloat(m[1]) * 1000);
      }
      if (!waitMs) waitMs = 1500 * attempt;
      waitMs = Math.min(waitMs + 300, 15000);
      console.log(`[${config.provider}] ${resp.status} retry ${attempt}/${maxAttempts - 1} em ${waitMs}ms`);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }
    break;
  }
  if (ctx) {
    logLLMUsage(ctx, {
      provider: config.provider,
      model: effectiveModel,
      latencyMs: Date.now() - startedAt,
      retries,
      success: false,
      errorCode: String(lastStatus),
      errorMessage: lastErrText,
      errorType: classifyError(lastStatus, lastErrText),
    });
  }
  const err: any = new Error(`${config.provider} error: ${lastStatus} - ${lastErrText}`);
  err.status = lastStatus;
  err.providerBody = lastErrText;
  throw err;
}

/**
 * Route request to the appropriate LLM provider
 */
export async function callLLM(
  config: LLMConfig,
  request: LLMRequest,
  ctx?: TelemetryContext,
): Promise<LLMResponse> {
  const { provider, apiKey, model } = config;
  const { messages, maxTokens = 200, temperature = 0.7 } = request;

  console.log(`🤖 Routing to ${provider} with model ${model}`);
  const startedAt = Date.now();

  try {
    let result: LLMResponse;
    switch (provider) {
      case 'lovable':
        result = await callLovableAI(apiKey, model, messages, maxTokens, temperature); break;
      case 'openai':
        result = await callOpenAI(apiKey, model, messages, maxTokens, temperature); break;
      case 'anthropic':
        result = await callAnthropic(apiKey, model, messages, maxTokens, temperature); break;
      case 'gemini':
        // callGemini delega para callLLMRaw — passamos ctx para evitar log duplicado aqui
        result = await callGemini(apiKey, model, messages, maxTokens, temperature, ctx); break;
      case 'groq':
        result = await callGroq(apiKey, model, messages, maxTokens, temperature); break;
      case 'mistral':
        result = await callMistral(apiKey, model, messages, maxTokens, temperature); break;
      case 'cohere':
        result = await callCohere(apiKey, model, messages, maxTokens, temperature); break;
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
    // Gemini já loga via callLLMRaw
    if (ctx && provider !== 'gemini') {
      logLLMUsage(ctx, {
        provider, model,
        latencyMs: Date.now() - startedAt,
        totalTokens: result.usage,
        success: true,
      });
    }
    return result;
  } catch (e: any) {
    if (ctx && provider !== 'gemini') {
      logLLMUsage(ctx, {
        provider, model,
        latencyMs: Date.now() - startedAt,
        success: false,
        errorCode: String(e?.status ?? ''),
        errorMessage: e?.message,
        errorType: classifyError(e?.status, e?.message ?? ''),
      });
    }
    throw e;
  }
}

// Lovable AI (default)
async function callLovableAI(
  apiKey: string,
  model: string,
  messages: LLMMessage[],
  maxTokens: number,
  temperature: number
): Promise<LLMResponse> {
  const response = await fetch(PROVIDER_ENDPOINTS.lovable, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Lovable AI error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return {
    content: data.choices[0].message.content,
    provider: 'lovable',
    model,
    usage: data.usage?.total_tokens,
  };
}

// OpenAI
async function callOpenAI(
  apiKey: string,
  model: string,
  messages: LLMMessage[],
  maxTokens: number,
  temperature: number
): Promise<LLMResponse> {
  const response = await fetch(PROVIDER_ENDPOINTS.openai, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return {
    content: data.choices[0].message.content,
    provider: 'openai',
    model,
    usage: data.usage?.total_tokens,
  };
}

// Anthropic
async function callAnthropic(
  apiKey: string,
  model: string,
  messages: LLMMessage[],
  maxTokens: number,
  temperature: number
): Promise<LLMResponse> {
  // Extract system message for Anthropic format
  const systemMessage = messages.find(m => m.role === 'system')?.content || '';
  const userMessages = messages.filter(m => m.role !== 'system').map(m => ({
    role: m.role,
    content: m.content,
  }));

  const response = await fetch(PROVIDER_ENDPOINTS.anthropic, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      system: systemMessage,
      messages: userMessages,
      max_tokens: maxTokens,
      temperature,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return {
    content: data.content[0].text,
    provider: 'anthropic',
    model,
    usage:
      (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0) ||
      undefined,
  };
}

// Google Gemini — usa o endpoint OpenAI-compatible (suporta tools e mesma forma de body)
async function callGemini(
  apiKey: string,
  model: string,
  messages: LLMMessage[],
  maxTokens: number,
  temperature: number
): Promise<LLMResponse> {
  const data = await callLLMRaw(
    { provider: 'gemini', apiKey, model },
    { messages, max_tokens: maxTokens, temperature },
  );
  return {
    content: data.choices?.[0]?.message?.content ?? '',
    provider: 'gemini',
    model,
    usage: data.usage?.total_tokens,
  };
}

// Groq
async function callGroq(
  apiKey: string,
  model: string,
  messages: LLMMessage[],
  maxTokens: number,
  temperature: number
): Promise<LLMResponse> {
  const maxAttempts = 4;
  let lastError = '';
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetch(PROVIDER_ENDPOINTS.groq, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
    });

    if (response.ok) {
      const data = await response.json();
      return {
        content: data.choices[0].message.content,
        provider: 'groq',
        model,
        usage: data.usage?.total_tokens,
      };
    }

    lastError = await response.text();
    if (response.status === 429 && attempt < maxAttempts) {
      // Respeita retry-after do header ou parseia da mensagem ("try again in 2.34s")
      let waitMs = 0;
      const retryAfter = response.headers.get('retry-after');
      if (retryAfter) waitMs = Math.ceil(parseFloat(retryAfter) * 1000);
      if (!waitMs) {
        const m = lastError.match(/try again in ([\d.]+)s/i);
        if (m) waitMs = Math.ceil(parseFloat(m[1]) * 1000);
      }
      if (!waitMs) waitMs = 1500 * attempt;
      waitMs = Math.min(waitMs + 300, 15000); // buffer + cap 15s
      console.log(`[groq] 429 rate limit, retry ${attempt}/${maxAttempts - 1} em ${waitMs}ms`);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }
    throw new Error(`Groq error: ${response.status} - ${lastError}`);
  }
  throw new Error(`Groq error: 429 após ${maxAttempts} tentativas - ${lastError}`);
}

// Mistral
async function callMistral(
  apiKey: string,
  model: string,
  messages: LLMMessage[],
  maxTokens: number,
  temperature: number
): Promise<LLMResponse> {
  const response = await fetch(PROVIDER_ENDPOINTS.mistral, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Mistral error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return {
    content: data.choices[0].message.content,
    provider: 'mistral',
    model,
    usage: data.usage?.total_tokens,
  };
}

// Cohere
async function callCohere(
  apiKey: string,
  model: string,
  messages: LLMMessage[],
  maxTokens: number,
  temperature: number
): Promise<LLMResponse> {
  // Convert messages to Cohere format
  const systemMessage = messages.find(m => m.role === 'system')?.content;
  const chatHistory = messages
    .filter(m => m.role !== 'system')
    .slice(0, -1)
    .map(m => ({
      role: m.role === 'user' ? 'USER' : 'CHATBOT',
      message: m.content,
    }));
  const lastMessage = messages.filter(m => m.role !== 'system').slice(-1)[0];

  const response = await fetch(PROVIDER_ENDPOINTS.cohere, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      message: lastMessage?.content || '',
      chat_history: chatHistory,
      preamble: systemMessage,
      max_tokens: maxTokens,
      temperature,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Cohere error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return {
    content: data.text,
    provider: 'cohere',
    model,
    usage:
      (data.meta?.tokens?.input_tokens ?? 0) +
        (data.meta?.tokens?.output_tokens ?? 0) || undefined,
  };
}
