/** Normaliza nome para comparação: sem acento, minúsculo, tokens >= 3 letras. */
export const norm = (s: string | null | undefined) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3)
    .join(" ");

/** Similaridade simples por sobreposição de tokens (0..1). */
export function similarity(a: string, b: string): number {
  const ta = norm(a).split(" ").filter(Boolean);
  const tb = norm(b).split(" ").filter(Boolean);
  if (ta.length === 0 || tb.length === 0) return 0;
  const overlap = ta.filter((t) => tb.includes(t)).length;
  return overlap / Math.max(ta.length, tb.length);
}

/** Busca "enquanto digita": aceita prefixos curtos (>=2 chars) em qualquer token. */
export function matchesQuery(target: string | null | undefined, query: string): boolean {
  const q = (query || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (q.length === 0) return true;
  const hay = (target || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ");
  const tokens = hay.split(/\s+/).filter(Boolean);
  return q.every((needle) => tokens.some((t) => t.startsWith(needle)) || hay.includes(needle));
}
