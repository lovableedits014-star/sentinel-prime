/**
 * Multi-LLM Router - Routes requests to different LLM providers based on client configuration
 */

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
  gemini: 'gemini-1.5-flash',
  groq: 'llama-3.1-8b-instant',
  mistral: 'mistral-small-latest',
  cohere: 'command-r',
};

// Provider API endpoints
const PROVIDER_ENDPOINTS: Record<LLMProvider, string> = {
  lovable: 'https://ai.gateway.lovable.dev/v1/chat/completions',
  openai: 'https://api.openai.com/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/models',
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

  // Fallback 1: Global env var defaults (for self-hosted deploys)
  const defaultProvider = Deno.env.get('DEFAULT_LLM_PROVIDER') as LLMProvider | undefined;
  const defaultKey = Deno.env.get('DEFAULT_LLM_API_KEY');
  const defaultModel = Deno.env.get('DEFAULT_LLM_MODEL');
  if (defaultProvider && defaultKey) {
    return {
      provider: defaultProvider,
      apiKey: defaultKey,
      model: defaultModel || DEFAULT_MODELS[defaultProvider],
    };
  }

  // Fallback 2: Lovable AI Gateway (only if running on Lovable Cloud)
  const lovableKey = Deno.env.get('LOVABLE_API_KEY');
  if (lovableKey) {
    return {
      provider: 'lovable',
      apiKey: lovableKey,
      model: 'google/gemini-2.5-flash',
    };
  }

  throw new Error(
    'No LLM provider configured. Configure one in Settings > Integrations or set DEFAULT_LLM_PROVIDER + DEFAULT_LLM_API_KEY env vars.'
  );
}

/**
 * Route request to the appropriate LLM provider
 */
export async function callLLM(config: LLMConfig, request: LLMRequest): Promise<LLMResponse> {
  const { provider, apiKey, model } = config;
  const { messages, maxTokens = 200, temperature = 0.7 } = request;

  console.log(`🤖 Routing to ${provider} with model ${model}`);

  switch (provider) {
    case 'lovable':
      return callLovableAI(apiKey, model, messages, maxTokens, temperature);
    case 'openai':
      return callOpenAI(apiKey, model, messages, maxTokens, temperature);
    case 'anthropic':
      return callAnthropic(apiKey, model, messages, maxTokens, temperature);
    case 'gemini':
      return callGemini(apiKey, model, messages, maxTokens, temperature);
    case 'groq':
      return callGroq(apiKey, model, messages, maxTokens, temperature);
    case 'mistral':
      return callMistral(apiKey, model, messages, maxTokens, temperature);
    case 'cohere':
      return callCohere(apiKey, model, messages, maxTokens, temperature);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
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

// Google Gemini
async function callGemini(
  apiKey: string,
  model: string,
  messages: LLMMessage[],
  maxTokens: number,
  temperature: number
): Promise<LLMResponse> {
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const response = await fetch(
    `${PROVIDER_ENDPOINTS.gemini}/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature,
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return {
    content: data.candidates[0].content.parts[0].text,
    provider: 'gemini',
    model,
    usage: data.usageMetadata?.totalTokenCount,
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
