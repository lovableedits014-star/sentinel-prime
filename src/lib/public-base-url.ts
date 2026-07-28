// Resolve a URL pública que deve ser usada em links compartilhados
// com destinatários externos (WhatsApp, e-mail, etc.).
//
// Ordem de prioridade:
// 1. `client.public_base_url` — override manual configurado nas Configurações do cliente
// 2. `window.location.origin` — fallback (com aviso quando é preview do Lovable)
//
// Rotas de preview do Lovable são bloqueadas por auth-bridge, então links
// gerados a partir delas caem em tela de login para o destinatário externo.

export interface PublicBaseUrl {
  url: string;
  isPreview: boolean;
  source: "client" | "origin";
}

const PREVIEW_HOST_RE = /(lovableproject\.com|(^|\.)id-preview--.*\.lovable\.app)$/i;

function normalize(raw: string): string | null {
  const trimmed = (raw || "").trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const u = new URL(withProto);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

function isPreviewHost(url: string): boolean {
  try {
    const host = new URL(url).host;
    return PREVIEW_HOST_RE.test(host);
  } catch {
    return false;
  }
}

export function resolvePublicBaseUrl(client: any | null | undefined): PublicBaseUrl {
  const configured = client?.public_base_url ? normalize(client.public_base_url) : null;
  if (configured) {
    return { url: configured, isPreview: isPreviewHost(configured), source: "client" };
  }
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return { url: origin, isPreview: isPreviewHost(origin), source: "origin" };
}

export function isLovablePreviewHost(url: string): boolean {
  return isPreviewHost(url);
}
