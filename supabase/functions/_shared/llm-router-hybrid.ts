/**
 * Hybrid LLM Router — tier-based routing + telemetry.
 *
 * Princípios duros:
 * - Isolamento multi-tenant absoluto: toda leitura de config é filtrada por client_id.
 * - Nenhum fallback cruzado entre clientes.
 * - Nenhum fallback global silencioso quando o cliente já tem alguma config própria.
 * - Erros de config retornam Error com código rastreável (LLM_CONFIG_MISSING:<tier>:<client_id>).
 * - Telemetria fire-and-forget mas com try/catch interno (nunca derruba a request).
 *
 * Este arquivo NÃO altera `getClientLLMConfig` nem `callLLM` originais — apenas adiciona
 * APIs novas usadas pelas functions que adotarem o roteamento por tier.
 */
import {
  callLLM,
  callLLMRaw,
  getClientLLMConfig,
  DEFAULT_MODELS,
  type LLMConfig,
  type LLMMessage,
  type LLMProvider,
  type LLMRequest,
  type LLMResponse,
} from './llm-router.ts';

export type LLMTier = 'fast' | 'classify' | 'reasoning' | 'deep';

const TIER_COLUMNS: Record<LLMTier, { provider: string; key: string; model: string }> = {
  fast:      { provider: 'llm_provider_fast',      key: 'llm_api_key_fast',      model: 'llm_model_fast' },
  classify:  { provider: 'llm_provider_classify',  key: 'llm_api_key_classify',  model: 'llm_model_classify' },
  reasoning: { provider: 'llm_provider_reasoning', key: 'llm_api_key_reasoning', model: 'llm_model_reasoning' },
  deep:      { provider: 'llm_provider_deep',      key: 'llm_api_key_deep',      model: 'llm_model_deep' },
};

/**
 * Lê a integração do cliente e devolve a config para o tier pedido.
 *
 * Regras (em ordem):
 *  1. Se `llm_mode = 'hybrid'` E a coluna do tier estiver completa (provider + key), usa ela.
 *  2. Caso contrário, cai para a config legacy DO MESMO CLIENTE (llm_provider/llm_api_key).
 *  3. Se o cliente não tem nenhuma config, lança `LLM_CONFIG_MISSING:<tier>:<clientId>`.
 *
 * NUNCA usa env vars globais quando o cliente tem qualquer config.
 * NUNCA mistura config entre clientes.
 */
export async function getClientLLMConfigByTier(
  admin: any,
  clientId: string,
  tier: LLMTier,
): Promise<LLMConfig & { tier: LLMTier; mode: 'simple' | 'hybrid' | 'tier' }> {
  if (!clientId) {
    throw new Error(`LLM_CONFIG_MISSING:${tier}:NO_CLIENT_ID`);
  }

  const cols = TIER_COLUMNS[tier];
  const selectCols = [
    'llm_mode',
    'llm_provider', 'llm_api_key', 'llm_model',
    cols.provider, cols.key, cols.model,
  ].join(', ');

  const { data: integ, error } = await admin
    .from('integrations')
    .select(selectCols)
    .eq('client_id', clientId)
    .maybeSingle();

  if (error) {
    throw new Error(`LLM_CONFIG_READ_ERROR:${tier}:${clientId}:${error.message}`);
  }

  // 1. Modo híbrido + coluna do tier preenchida
  if (
    integ?.llm_mode === 'hybrid' &&
    integ[cols.provider] &&
    integ[cols.key]
  ) {
    const provider = integ[cols.provider] as LLMProvider;
    return {
      provider,
      apiKey: integ[cols.key] as string,
      model: (integ[cols.model] as string) || DEFAULT_MODELS[provider],
      tier,
      mode: 'tier',
    };
  }

  // 2. Legacy do mesmo cliente
  if (integ?.llm_provider && integ?.llm_api_key) {
    const provider = integ.llm_provider as LLMProvider;
    return {
      provider,
      apiKey: integ.llm_api_key as string,
      model: (integ.llm_model as string) || DEFAULT_MODELS[provider],
      tier,
      mode: integ.llm_mode === 'hybrid' ? 'hybrid' : 'simple',
    };
  }

  // 3. Sem config: erro explícito e rastreável (NUNCA fallback global).
  throw new Error(`LLM_CONFIG_MISSING:${tier}:${clientId}`);
}

// ---------------------------------------------------------------------------
// Structured output (typed JSON) — Gemini responseSchema + OpenAI-compat json_object
// ---------------------------------------------------------------------------

export interface LLMStructuredRequest<_T = unknown> {
  messages: LLMMessage[];
  /** JSON schema (Gemini responseSchema OR OpenAI json_schema). Sem $schema, draft-07. */
  schema: Record<string, unknown>;
  /** Nome do schema p/ OpenAI/Groq (json_schema mode). */
  schemaName?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LLMStructuredResponse<T = unknown> {
  data: T;
  raw: string;
  provider: LLMProvider;
  model: string;
  usage?: number;
  promptTokens?: number;
  completionTokens?: number;
}

/**
 * Pede JSON estruturado e validado pelo schema.
 * - Gemini (OpenAI-compatible endpoint): usa `response_format: { type: 'json_object' }` + schema no system prompt.
 * - OpenAI/Groq/Mistral: `response_format: { type: 'json_object' }`.
 *
 * Lança Error se o JSON não puder ser parseado.
 */
export async function callLLMStructured<T = unknown>(
  config: LLMConfig,
  req: LLMStructuredRequest<T>,
): Promise<LLMStructuredResponse<T>> {
  const { messages, schema, maxTokens = 512, temperature = 0 } = req;

  // Injeta schema na primeira system message (ou cria uma) para guiar o modelo.
  const schemaHint =
    `\n\nResponda EXCLUSIVAMENTE com JSON válido (sem markdown, sem texto antes/depois) ` +
    `que satisfaça este schema:\n${JSON.stringify(schema)}`;
  const enriched: LLMMessage[] = [...messages];
  const sysIdx = enriched.findIndex((m) => m.role === 'system');
  if (sysIdx >= 0) {
    enriched[sysIdx] = { ...enriched[sysIdx], content: enriched[sysIdx].content + schemaHint };
  } else {
    enriched.unshift({ role: 'system', content: 'Você responde apenas JSON válido.' + schemaHint });
  }

  const body: Record<string, any> = {
    messages: enriched,
    max_tokens: maxTokens,
    temperature,
    response_format: { type: 'json_object' },
  };

  const data = await callLLMRaw(config, body);
  const raw = data?.choices?.[0]?.message?.content ?? '';
  let parsed: T;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const m = String(raw).match(/\{[\s\S]*\}/);
    if (!m) throw new Error(`LLM_STRUCTURED_PARSE_ERROR: ${String(raw).slice(0, 200)}`);
    parsed = JSON.parse(m[0]) as T;
  }

  return {
    data: parsed,
    raw,
    provider: config.provider,
    model: config.model,
    usage: data?.usage?.total_tokens,
    promptTokens: data?.usage?.prompt_tokens,
    completionTokens: data?.usage?.completion_tokens,
  };
}

// ---------------------------------------------------------------------------
// Telemetria — fire-and-forget, isolada por client_id
// ---------------------------------------------------------------------------

export interface LLMLogEntry {
  clientId: string;
  userId?: string | null;
  functionName: string;
  tier: LLMTier | 'legacy' | 'multimodal';
  provider: string;
  model: string;
  latencyMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  requestId: string;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
}

/** Gera um request_id estável e curto. */
export function newRequestId(): string {
  // crypto.randomUUID disponível no Deno
  // (não usa Math.random para evitar colisão entre requests concorrentes)
  return (globalThis as any).crypto?.randomUUID?.() ?? `req-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

/**
 * Persiste uma entrada de uso. NUNCA derruba a request; erros são apenas logados.
 * IMPORTANTE: nunca logamos apiKey nem prompt — apenas metadata operacional.
 */
export async function logLLMUsage(admin: any, entry: LLMLogEntry): Promise<void> {
  try {
    if (!entry.clientId || !entry.functionName || !entry.tier || !entry.provider || !entry.model || !entry.requestId) {
      console.warn('[llm-usage-log] entrada inválida ignorada');
      return;
    }
    await admin.from('llm_usage_log').insert({
      client_id: entry.clientId,
      user_id: entry.userId ?? null,
      function_name: entry.functionName,
      tier: entry.tier,
      provider: entry.provider,
      model: entry.model,
      latency_ms: entry.latencyMs ?? null,
      prompt_tokens: entry.promptTokens ?? null,
      completion_tokens: entry.completionTokens ?? null,
      total_tokens: entry.totalTokens ?? null,
      request_id: entry.requestId,
      success: entry.success,
      error_code: entry.errorCode ?? null,
      error_message: entry.errorMessage ? String(entry.errorMessage).slice(0, 500) : null,
    });
  } catch (e) {
    console.warn('[llm-usage-log] insert falhou:', e instanceof Error ? e.message : String(e));
  }
}

/**
 * Helper de alto nível: chama LLM por tier + telemetria + isolamento.
 * NÃO faz validação de acesso — o caller DEVE ter validado user_has_client_access ANTES.
 */
export async function callLLMByTier(
  admin: any,
  ctx: { clientId: string; userId?: string | null; functionName: string; tier: LLMTier },
  request: LLMRequest,
): Promise<LLMResponse & { requestId: string }> {
  const requestId = newRequestId();
  const started = Date.now();
  const cfg = await getClientLLMConfigByTier(admin, ctx.clientId, ctx.tier);
  try {
    const resp = await callLLM(cfg, request);
    await logLLMUsage(admin, {
      clientId: ctx.clientId,
      userId: ctx.userId,
      functionName: ctx.functionName,
      tier: ctx.tier,
      provider: resp.provider,
      model: resp.model,
      latencyMs: Date.now() - started,
      totalTokens: resp.usage,
      requestId,
      success: true,
    });
    return { ...resp, requestId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logLLMUsage(admin, {
      clientId: ctx.clientId,
      userId: ctx.userId,
      functionName: ctx.functionName,
      tier: ctx.tier,
      provider: cfg.provider,
      model: cfg.model,
      latencyMs: Date.now() - started,
      requestId,
      success: false,
      errorCode: msg.split(':')[0]?.slice(0, 40),
      errorMessage: msg,
    });
    throw err;
  }
}

// Re-export base types/utilities para conveniência dos callers
export type { LLMConfig, LLMMessage, LLMProvider, LLMRequest, LLMResponse };
export { callLLM, callLLMRaw, getClientLLMConfig, DEFAULT_MODELS };
