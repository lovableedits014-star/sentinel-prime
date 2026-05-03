/**
 * Build a URL to a user's social media profile.
 * Returns null if we can't construct a valid URL.
 */
export function getSocialProfileUrl(
  platform: string,
  platformUserId: string,
  platformUsername?: string | null
): string | null {
  if (platform === "instagram") {
    // Instagram: prefer username, fall back to user ID
    const handle = platformUsername || platformUserId;
    if (!handle) return null;
    const clean = handle.replace(/^@/, "");
    return `https://www.instagram.com/${clean}`;
  }

  if (platform === "facebook") {
    // Facebook: numeric ID → profile.php, otherwise slug
    if (/^\d+$/.test(platformUserId)) {
      return `https://www.facebook.com/profile.php?id=${platformUserId}`;
    }
    const slug = platformUsername || platformUserId;
    if (!slug) return null;
    return `https://www.facebook.com/${slug.replace(/^@/, "")}`;
  }

  return null;
}

/**
 * Gera link wa.me a partir de um telefone brasileiro.
 * Remove caracteres especiais, adiciona 55 se necessário.
 * Retorna null se o telefone for inválido.
 */
export function getWhatsAppLink(telefone: string | null | undefined): string | null {
  if (!telefone) return null;
  const digits = telefone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  const number = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${number}`;
}

/**
 * Extrai o handle/username de uma URL de perfil social.
 * Ex: "https://www.facebook.com/mayer.baclan?locale=pt_BR" → "mayer.baclan"
 *     "https://instagram.com/usuario/" → "usuario"
 * Retorna null para URLs irreconhecíveis ou genéricas (share, profile, etc).
 */
export function extractHandleFromUrl(platform: string, url: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    // Para facebook.com/profile.php?id=123
    if (platform === "facebook" && u.pathname.includes("profile.php")) {
      const id = u.searchParams.get("id");
      return id && /^\d+$/.test(id) ? id : null;
    }
    // Pega o primeiro segmento do path
    const segments = u.pathname.split("/").filter(Boolean);
    if (!segments.length) return null;
    const first = segments[0];
    // Facebook share links: /share/<id>/, /share/p/<id>/ — não dá pra extrair sem
    // resolver o redirect. Devolvemos null para que o chamador acione a Edge Function
    // `resolve-social-link`, que segue o redirect e descobre o handle real.
    if (platform === "facebook" && first.toLowerCase() === "share") {
      return null;
    }
    // Rejeita rotas genéricas que não são handles
    const blocklist = new Set([
      "share", "sharer", "share.php", "dialog", "events", "groups",
      "pages", "permalink.php", "story.php", "watch", "reel", "reels",
      "p", "stories", "explore", "tv", "accounts", "login", "signup",
    ]);
    if (blocklist.has(first.toLowerCase())) return null;
    return first.replace(/^@/, "");
  } catch {
    return null;
  }
}

/**
 * Monta a URL de busca de pessoas pré-preenchida no Facebook/Instagram
 * para abrir num popup já com o nome do apoiador digitado.
 */
export function buildSearchUrl(platform: "facebook" | "instagram", name: string): string {
  const q = encodeURIComponent(name.trim());
  if (platform === "facebook") {
    return `https://www.facebook.com/search/people/?q=${q}`;
  }
  return `https://www.instagram.com/explore/search/keyword/?q=${q}`;
}
