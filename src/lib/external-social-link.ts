const TRACKING_PARAMS = new Set([
  "igsh",
  "igshid",
  "utm_campaign",
  "utm_content",
  "utm_medium",
  "utm_source",
  "utm_term",
]);

export type SocialPlatform = "facebook" | "instagram" | null;

function unwrapMetaRedirect(url: URL): URL {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "l.instagram.com" || host === "l.facebook.com" || host === "lm.facebook.com") {
    const nested = url.searchParams.get("u");
    if (nested) return new URL(nested);
  }
  return url;
}

/** Normaliza links externos sem inventar um destino ou encaminhar para lojas. */
export function normalizeExternalUrl(raw: string): URL {
  const initial = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
  if (initial.protocol !== "http:" && initial.protocol !== "https:") throw new Error("unsupported protocol");
  const url = unwrapMetaRedirect(initial);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("unsupported protocol");

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "instagram.com") url.hostname = "www.instagram.com";
  if (host === "facebook.com" || host === "m.facebook.com") url.hostname = "www.facebook.com";
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) url.searchParams.delete(key);
  }
  url.hash = "";
  return url;
}

export function detectSocialPlatform(raw: string): SocialPlatform {
  try {
    const host = normalizeExternalUrl(raw).hostname.toLowerCase().replace(/^www\./, "");
    if (host === "instagram.com") return "instagram";
    if (host === "facebook.com" || host === "fb.com" || host === "fb.watch") return "facebook";
  } catch {
    // URL inválida
  }
  return null;
}

export function openExternalUrl(raw: string): void {
  const destination = normalizeExternalUrl(raw).toString();
  // Mantém a navegação no gesto original. WebViews bloqueiam novas abas com
  // frequência e `window.open(..., noopener)` não permite detectar isso.
  window.location.assign(destination);
}
