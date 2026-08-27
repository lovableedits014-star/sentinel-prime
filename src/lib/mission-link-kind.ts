// Detecta a "origem" de um link colado, só para escolher o ícone na tela pública.
export function detectLinkKind(url: string): string {
  const u = (url || "").toLowerCase();
  if (!u) return "generico";
  if (u.includes("facebook.com") || u.includes("fb.com") || u.includes("fb.watch")) return "facebook";
  if (u.includes("instagram.com")) return "instagram";
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube";
  if (u.includes("tiktok.com")) return "tiktok";
  if (u.includes("wa.me") || u.includes("whatsapp.com")) return "whatsapp";
  if (u.includes("docs.google.com") || u.includes("forms.gle")) return "formulario";
  return "generico";
}

export function isValidHttpUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// Remove surrogates soltos e caracteres de controle que quebram o JSON enviado à API.
export function sanitizeText(input: string | null | undefined): string {
  if (!input) return "";
  return input
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "")
    .replace(/(?:^|[^\uD800-\uDBFF])([\uDC00-\uDFFF])/g, (m, low) => m.replace(low, ""))
    .trim();
}

// Corta o texto sem separar pares de emoji (surrogate pairs).
export function safeTruncate(input: string | null | undefined, max: number): string {
  const clean = sanitizeText(input);
  const chars = Array.from(clean);
  if (chars.length <= max) return clean;
  return chars.slice(0, max).join("").trim();
}
