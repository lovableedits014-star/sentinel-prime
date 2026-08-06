/**
 * Build a URL to a user's social media profile.
 * Returns null if we can't construct a valid URL.
 */
export function getSocialProfileUrl(
  platform: string,
  platformUserId: string,
  platformUsername?: string | null,
  authorName?: string | null
): string | null {
  const directUrl = getDirectSocialProfileUrl(platform, platformUserId, platformUsername);
  if (directUrl) return directUrl;

  if (platform === "instagram") {
    return null;
  }

  if (platform === "facebook") {
    // IDs numéricos vindos da Graph API são PSIDs (page-scoped) e NÃO
    // resolvem em facebook.com/profile.php?id=... — sempre dá "conteúdo
    // indisponível". Como fallback, abrir uma busca pelo nome do autor.
    if (authorName && authorName.trim()) {
      const q = encodeURIComponent(authorName.trim());
      return `https://www.facebook.com/search/people/?q=${q}`;
    }
    return null;
  }

  return null;
}

/**
 * Retorna APENAS link direto de perfil quando temos um identificador público
 * real (username/vanity). Não cai em busca por nome para não confundir pessoas
 * com nomes iguais no Facebook.
 */
export function getDirectSocialProfileUrl(
  platform: string,
  platformUserId?: string | null,
  platformUsername?: string | null,
): string | null {
  const cleanUsername = platformUsername?.trim().replace(/^@/, "") || null;
  const cleanUserId = platformUserId?.trim().replace(/^@/, "") || null;

  if (platform === "instagram") {
    const handle = cleanUsername || cleanUserId;
    if (!handle || /^\d+$/.test(handle)) return null;
    return `https://www.instagram.com/${handle}`;
  }

  if (platform === "facebook") {
    // No Facebook, ID numérico recebido em comentário é normalmente PSID
    // (page-scoped id), não o id público do perfil. Só vanity/username é direto.
    const handle = cleanUsername && !/^\d+$/.test(cleanUsername)
      ? cleanUsername
      : cleanUserId && !/^\d+$/.test(cleanUserId)
      ? cleanUserId
      : null;
    return handle ? `https://www.facebook.com/${handle}` : null;
  }

  return null;
}

function buildFacebookCommentUrl(commentId: string, postPermalinkUrl?: string | null): string {
  const cleanCommentId = commentId.trim();
  const commentParam = cleanCommentId.includes("_")
    ? cleanCommentId.split("_").pop() || cleanCommentId
    : cleanCommentId;

  if (postPermalinkUrl) {
    try {
      const url = new URL(postPermalinkUrl);
      url.searchParams.set("comment_id", commentParam);
      return url.toString();
    } catch {
      // segue para fallback abaixo
    }
  }

  if (cleanCommentId.includes("_")) {
    const postId = cleanCommentId.split("_")[0];
    return `https://www.facebook.com/${postId}?comment_id=${commentParam}`;
  }

  return `https://www.facebook.com/${cleanCommentId}`;
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
    // Para facebook.com/profile.php?id=123 ou /posts/123?comment_id=456
    if (platform === "facebook") {
      if (u.pathname.includes("profile.php")) {
        const id = u.searchParams.get("id");
        return id && /^\d+$/.test(id) ? id : null;
      }
      const commentId = u.searchParams.get("comment_id");
      if (commentId) return commentId; // O ID do comentário muitas vezes contém o ID do autor
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

/**
 * Resolve o MELHOR link possível para chegar até o autor de um comentário.
 * Estratégia em cascata:
 *   1) `platform_username` (vanity já conhecido) → link direto para o perfil.
 *   2) Permalink do comentário negativo mais recente → abre o comentário no
 *      Facebook/Instagram. Daí o usuário clica no nome e cai no perfil real
 *      (Facebook PSIDs não viram URL de perfil, então isso é o mais próximo).
 *   3) Para Facebook: tenta `facebook.com/{comment_id}` como fallback.
 *   4) Último recurso: busca por nome (comportamento antigo).
 */
export function getBestProfileLink(
  platform: string,
  opts: {
    platformUserId?: string | null;
    platformUsername?: string | null;
    authorName?: string | null;
    latestPermalinkUrl?: string | null;
    latestCommentId?: string | null;
  }
): { url: string; kind: "profile" | "comment" | "search" } | null {
  // 1) Username/vanity conhecido → perfil direto
  const directProfileUrl = getDirectSocialProfileUrl(
    platform,
    opts.platformUserId,
    opts.platformUsername,
  );
  if (directProfileUrl) {
    return { url: directProfileUrl, kind: "profile" };
  }

  // 2) Facebook: abrir o comentário exato é o caminho confiável quando a Meta
  // só entrega PSID. Lá o nome/foto do autor apontam para o perfil correto.
  if (platform === "facebook" && opts.latestCommentId) {
    return {
      url: buildFacebookCommentUrl(opts.latestCommentId, opts.latestPermalinkUrl),
      kind: "comment",
    };
  }

  // 3) Permalink do post/comentário mais recente
  if (opts.latestPermalinkUrl) {
    return { url: opts.latestPermalinkUrl, kind: "comment" };
  }

  // 4) Último recurso: busca por nome
  if (opts.authorName && opts.authorName.trim()) {
    if (platform === "facebook") {
      return { url: buildSearchUrl("facebook", opts.authorName), kind: "search" };
    }
    if (platform === "instagram") {
      return { url: buildSearchUrl("instagram", opts.authorName), kind: "search" };
    }
  }

  return null;
}
