// Helpers de telefone BR — usados pelo importador de contatos e disparos.
// Formato canônico: E.164 sem "+", com DDI 55 (ex.: "5567991234567").

export function onlyDigits(s: string | null | undefined): string {
  return String(s ?? "").replace(/\D/g, "");
}

/**
 * Normaliza um telefone BR para o formato aceito pela bridge WhatsApp.
 * - Remove tudo que não é dígito.
 * - Se já vier com 55 (12 ou 13 dígitos), mantém.
 * - Se vier com 10 ou 11 dígitos (DDD + número), prefixa 55.
 * - Se sobrar algo fora desses casos, retorna "" (inválido).
 */
export function normalizeBRPhone(raw: string | null | undefined): string {
  const d = onlyDigits(raw);
  if (!d) return "";
  if (d.length === 12 || d.length === 13) {
    if (d.startsWith("55")) return d;
    return "";
  }
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return "";
}

export function isValidBRPhone(raw: string | null | undefined): boolean {
  const n = normalizeBRPhone(raw);
  return n.length === 12 || n.length === 13;
}

export function fmtPhoneBR(s: string | null | undefined): string {
  const d = onlyDigits(s);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length === 13 && d.startsWith("55")) return fmtPhoneBR(d.slice(2));
  if (d.length === 12 && d.startsWith("55")) return fmtPhoneBR(d.slice(2));
  return s ?? "";
}
