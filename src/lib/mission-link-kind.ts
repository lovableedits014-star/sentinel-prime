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
