/**
 * Throttle simples por clientId para evitar cliques repetidos
 * no botão "Sincronizar Meta", que tem custo Cloud (egress + DB writes).
 */
const MIN_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos

function key(clientId: string) {
  return `meta-sync:last:${clientId}`;
}

/** Retorna ms restantes até poder sincronizar de novo (0 se pode agora). */
export function syncCooldownRemaining(clientId: string): number {
  if (!clientId) return 0;
  try {
    const raw = localStorage.getItem(key(clientId));
    if (!raw) return 0;
    const last = parseInt(raw, 10);
    if (!Number.isFinite(last)) return 0;
    const elapsed = Date.now() - last;
    return Math.max(0, MIN_INTERVAL_MS - elapsed);
  } catch {
    return 0;
  }
}

/** Marca uma sincronização bem-sucedida agora. */
export function markSyncDone(clientId: string) {
  if (!clientId) return;
  try {
    localStorage.setItem(key(clientId), String(Date.now()));
  } catch {
    /* ignore */
  }
}

/** Formata ms restantes em texto humano ("3 min", "45 s"). */
export function formatCooldown(ms: number): string {
  if (ms <= 0) return "agora";
  const s = Math.ceil(ms / 1000);
  if (s >= 60) return `${Math.ceil(s / 60)} min`;
  return `${s}s`;
}