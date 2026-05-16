/**
 * Lote C2 — Safeguards operacionais (SCAFFOLD — não ativado por padrão)
 *
 * Estrutura preparada para receber, sem refactor maior:
 *   - circuit breaker (curto-circuita provider instável)
 *   - provider failover (cai para próximo provider configurado)
 *   - quota enforcement (bloqueia client que estoura cota mensal)
 *   - rate limiting inteligente (per-tenant / per-function)
 *
 * Todas as funções abaixo são no-ops conservadores que sempre permitem a
 * requisição. Quando ativadas, deverão consultar `llm_usage_log`,
 * `llm_alerts` e tabelas de quota/cota dedicadas.
 */

export interface SafeguardDecision {
  allowed: boolean;
  reason?: string;
  retryAfterMs?: number;
}

const ALLOW: SafeguardDecision = { allowed: true };

// ─────────────────────────────────────────────────────────────
// Circuit Breaker (stub)
// ─────────────────────────────────────────────────────────────
export async function checkCircuitBreaker(
  _admin: any,
  _provider: string,
  _clientId: string,
): Promise<SafeguardDecision> {
  // TODO: consultar contagem de erros 5xx do provider nos últimos N minutos
  // e abrir circuito se passar do limite.
  return ALLOW;
}

// ─────────────────────────────────────────────────────────────
// Provider Failover (stub)
// ─────────────────────────────────────────────────────────────
export async function pickFailoverProvider(
  _admin: any,
  _primary: string,
  _clientId: string,
): Promise<string | null> {
  // TODO: ler integrations do client e devolver próximo provider configurado.
  return null;
}

// ─────────────────────────────────────────────────────────────
// Quota Enforcement (stub)
// ─────────────────────────────────────────────────────────────
export interface QuotaContext {
  clientId: string;
  windowDays?: number;
  maxTokens?: number;
  maxCostUsd?: number;
}

export async function checkQuota(_admin: any, _ctx: QuotaContext): Promise<SafeguardDecision> {
  // TODO: SELECT sum(total_tokens), sum(estimated_cost_usd)
  // FROM llm_usage_log WHERE client_id = ctx.clientId AND created_at > now() - interval ...
  return ALLOW;
}

// ─────────────────────────────────────────────────────────────
// Rate Limiting (stub, com placeholder in-memory por isolate)
// ─────────────────────────────────────────────────────────────
const _rlBuckets = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, limit: number, windowMs: number): SafeguardDecision {
  const now = Date.now();
  const b = _rlBuckets.get(key);
  if (!b || b.resetAt < now) {
    _rlBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return ALLOW;
  }
  if (b.count >= limit) {
    return { allowed: false, reason: 'rate_limit', retryAfterMs: b.resetAt - now };
  }
  b.count++;
  return ALLOW;
}

/**
 * Orquestra todas as verificações para uma chamada LLM.
 * Atualmente devolve sempre allowed=true; quando ativarmos será o single entry point
 * que callLLM consultará antes de cada request.
 */
export async function checkAllSafeguards(
  _admin: any,
  _opts: { provider: string; clientId: string; functionName: string },
): Promise<SafeguardDecision> {
  return ALLOW;
}
