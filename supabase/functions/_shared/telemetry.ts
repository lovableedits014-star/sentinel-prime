/**
 * Lote C1 — Telemetria e observabilidade da camada LLM
 *
 * - Captura uso por request (provider/model/tokens/latency/retries/cost)
 * - Propaga correlation_id ponta-a-ponta (header `x-correlation-id`)
 * - Log assíncrono, fire-and-forget, nunca bloqueia request principal
 * - Falhas de logging são silenciosamente engolidas (não degradam fluxo)
 */

import type { LLMProvider } from './llm-router.ts';

// ─────────────────────────────────────────────────────────────
// Correlation ID
// ─────────────────────────────────────────────────────────────
const CORR_HEADER = 'x-correlation-id';
const REQ_HEADER = 'x-request-id';

export function getCorrelationId(req: Request): string {
  return req.headers.get(CORR_HEADER) || crypto.randomUUID();
}

export function getRequestId(req: Request): string {
  return req.headers.get(REQ_HEADER) || crypto.randomUUID();
}

/** Headers a serem propagados em chamadas downstream (preservam rastreabilidade). */
export function tracingHeaders(correlationId: string, requestId?: string): Record<string, string> {
  const h: Record<string, string> = { [CORR_HEADER]: correlationId };
  if (requestId) h[REQ_HEADER] = requestId;
  return h;
}

// ─────────────────────────────────────────────────────────────
// Estimativa de custo (USD por 1k tokens, prompt/completion)
// Tabela conservadora — atualizar conforme preços oficiais mudam.
// ─────────────────────────────────────────────────────────────
type CostEntry = { prompt: number; completion: number };
const COST_TABLE: Record<string, CostEntry> = {
  // OpenAI
  'gpt-4o': { prompt: 0.0025, completion: 0.01 },
  'gpt-4o-mini': { prompt: 0.00015, completion: 0.0006 },
  'gpt-4-turbo': { prompt: 0.01, completion: 0.03 },
  // Anthropic
  'claude-3-5-sonnet-20241022': { prompt: 0.003, completion: 0.015 },
  'claude-3-haiku-20240307': { prompt: 0.00025, completion: 0.00125 },
  // Google Gemini
  'gemini-2.5-flash': { prompt: 0.000075, completion: 0.0003 },
  'gemini-2.5-pro': { prompt: 0.00125, completion: 0.005 },
  'google/gemini-2.5-flash': { prompt: 0.000075, completion: 0.0003 },
  // Groq
  'llama-3.1-8b-instant': { prompt: 0.00005, completion: 0.00008 },
  'llama-3.3-70b-versatile': { prompt: 0.00059, completion: 0.00079 },
  // Mistral
  'mistral-small-latest': { prompt: 0.0002, completion: 0.0006 },
  'mistral-large-latest': { prompt: 0.002, completion: 0.006 },
  // Cohere
  'command-r': { prompt: 0.00015, completion: 0.0006 },
};

export function estimateCostUsd(model: string, promptTokens = 0, completionTokens = 0): number | null {
  const entry = COST_TABLE[model] || COST_TABLE[model.toLowerCase()];
  if (!entry) return null;
  const cost = (promptTokens / 1000) * entry.prompt + (completionTokens / 1000) * entry.completion;
  return Number(cost.toFixed(6));
}

// ─────────────────────────────────────────────────────────────
// Contexto de telemetria (passado para callLLM/callLLMRaw)
// ─────────────────────────────────────────────────────────────
export interface TelemetryContext {
  admin: any; // supabase admin client (service role)
  clientId: string;
  userId?: string | null;
  functionName: string;
  correlationId: string;
  requestId?: string;
  tier?: string;
  parentFunction?: string;
}

export interface LLMUsageRecord {
  provider: LLMProvider | string;
  model: string;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  retries?: number;
  success: boolean;
  errorCode?: string | null;
  errorMessage?: string | null;
  errorType?: string | null;
}

/**
 * Loga uso de LLM de forma assíncrona, sem bloquear a request principal.
 * Falhas de logging são engolidas — telemetria nunca deve quebrar produção.
 */
export function logLLMUsage(ctx: TelemetryContext, rec: LLMUsageRecord): void {
  // Fire-and-forget: não aguardamos, não propagamos erros
  queueMicrotask(async () => {
    try {
      const estimated = estimateCostUsd(rec.model, rec.promptTokens, rec.completionTokens);
      const row = {
        client_id: ctx.clientId,
        user_id: ctx.userId ?? null,
        function_name: ctx.functionName,
        parent_function: ctx.parentFunction ?? null,
        tier: ctx.tier ?? 'standard',
        provider: rec.provider,
        model: rec.model,
        latency_ms: rec.latencyMs,
        prompt_tokens: rec.promptTokens ?? null,
        completion_tokens: rec.completionTokens ?? null,
        total_tokens: rec.totalTokens ?? null,
        request_id: ctx.requestId ?? ctx.correlationId,
        correlation_id: ctx.correlationId,
        retries: rec.retries ?? 0,
        estimated_cost_usd: estimated,
        success: rec.success,
        error_code: rec.errorCode ?? null,
        error_message: rec.errorMessage ? String(rec.errorMessage).slice(0, 2000) : null,
        error_type: rec.errorType ?? null,
      };
      const { error } = await ctx.admin.from('llm_usage_log').insert(row);
      if (error) console.warn('[telemetry] insert failed:', error.message);
    } catch (e) {
      console.warn('[telemetry] logLLMUsage swallowed:', (e as Error)?.message);
    }
  });
}

export function classifyError(status: number | undefined, message: string): string {
  if (!status) return message?.includes('LLM_CONFIG_MISSING') ? 'config_missing' : 'unknown';
  if (status === 401 || status === 403) return 'auth';
  if (status === 402) return 'payment_required';
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'provider_unstable';
  if (status >= 400) return 'bad_request';
  return 'unknown';
}
