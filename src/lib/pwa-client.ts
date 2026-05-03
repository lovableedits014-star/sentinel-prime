/**
 * Persiste o clientId atual do portal em múltiplos locais para que, ao
 * instalar o PWA na tela inicial (especialmente no iOS), o app abra
 * direto no portal correto e NÃO na landing page institucional.
 *
 * - localStorage: usado pelo Safari normal.
 * - cookie (path=/, max-age 1 ano, SameSite=Lax): compartilhado entre o
 *   Safari e a sessão standalone do PWA no iOS.
 */
export function rememberPortalClientId(clientId: string | undefined | null) {
  if (!clientId || typeof window === "undefined") return;
  try {
    localStorage.setItem("pwa_client_id", clientId);
  } catch {}
  try {
    const oneYear = 60 * 60 * 24 * 365;
    document.cookie = `pwa_client_id=${encodeURIComponent(clientId)}; path=/; max-age=${oneYear}; SameSite=Lax`;
  } catch {}
}

export function readPortalClientId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const fromLs = localStorage.getItem("pwa_client_id");
    if (fromLs) return fromLs;
  } catch {}
  try {
    const m = document.cookie.match(/(?:^|;\s*)pwa_client_id=([^;]+)/);
    if (m) return decodeURIComponent(m[1]);
  } catch {}
  return null;
}