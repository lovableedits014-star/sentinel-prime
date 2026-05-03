/**
 * Utilitários para CPF e telefone.
 * - Normalização: apenas dígitos.
 * - Validação de CPF (algoritmo oficial).
 * - Formatação visual (máscaras).
 * - Tradução de erros do banco para mensagens amigáveis (duplicidade).
 */

export function onlyDigits(value: string | null | undefined): string {
  if (!value) return "";
  return String(value).replace(/\D/g, "");
}

export function formatCPF(value: string | null | undefined): string {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function formatPhone(value: string | null | undefined): string {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function isValidCPF(value: string | null | undefined): boolean {
  const d = onlyDigits(value);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(d[i], 10) * (10 - i);
  let dig1 = (sum * 10) % 11;
  if (dig1 === 10) dig1 = 0;
  if (dig1 !== parseInt(d[9], 10)) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(d[i], 10) * (11 - i);
  let dig2 = (sum * 10) % 11;
  if (dig2 === 10) dig2 = 0;
  return dig2 === parseInt(d[10], 10);
}

/**
 * Traduz erros de cadastro vindos do Postgres para mensagens amigáveis.
 * Detecta duplicidade (23505) nas constraints únicas de cpf/telefone/phone
 * e CPF inválido (23514, lançado pelo trigger normalize_*_dedup).
 * Retorna null se não conseguir interpretar.
 */
export function translateRegistrationError(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const e = error as { code?: string; message?: string; details?: string };
  const code = e.code || "";
  const text = `${e.message || ""} ${e.details || ""}`.toLowerCase();

  if (code === "23505" || text.includes("duplicate key") || text.includes("unique")) {
    if (text.includes("cpf")) {
      return "Este CPF já está cadastrado.";
    }
    if (text.includes("telefone") || text.includes("phone")) {
      return "Este telefone já está cadastrado.";
    }
    return "Este cadastro já existe (duplicado).";
  }

  if (code === "23514" || text.includes("cpf inválido") || text.includes("cpf invalido")) {
    return "CPF inválido. Verifique os dígitos informados.";
  }

  return null;
}