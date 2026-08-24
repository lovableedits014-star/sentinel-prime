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

/**
 * Normaliza qualquer telefone BR para o formato aceito pelo wa.me (E.164 sem "+").
 * Tolera: zeros à esquerda ("067981955247"), prefixo internacional "00",
 * DDI 55 duplicado, espaços/parênteses/traços e ramais colados.
 * Retorna "" se não for possível montar um número válido.
 */
export function toWhatsAppBR(raw: string | null | undefined): string {
  let d = onlyDigits(raw);
  if (!d) return "";

  // Prefixo internacional discado: 00 55 ...
  if (d.startsWith("00")) d = d.replace(/^0+/, "");

  // DDI 55 (possivelmente repetido) + eventuais zeros de operadora/DDD
  while (d.startsWith("55") && d.length > 11) {
    const rest = d.slice(2).replace(/^0+/, "");
    if (rest.length === 10 || rest.length === 11) return `55${rest}`;
    if (rest.length < 10) break;
    d = rest;
  }

  // Zeros à esquerda (0 + DDD)
  d = d.replace(/^0+/, "");

  if (d.length === 10 || d.length === 11) return `55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d;
  return "";
}


export function fmtPhoneBR(s: string | null | undefined): string {
  const d = onlyDigits(s);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length === 13 && d.startsWith("55")) return fmtPhoneBR(d.slice(2));
  if (d.length === 12 && d.startsWith("55")) return fmtPhoneBR(d.slice(2));
  return s ?? "";
}
