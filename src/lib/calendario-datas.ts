/**
 * Utilitários de data do Calendário Político.
 *
 * Regra: o "hoje" é sempre calculado no fuso oficial da campanha (America/Sao_Paulo),
 * independentemente do fuso do navegador do usuário. Isso garante que o rótulo
 * "Hoje / Amanhã / Em N dias" para feriados nacionais brasileiros seja consistente
 * para qualquer usuário, em qualquer parte do mundo.
 *
 * As datas dos feriados vêm como YYYY-MM-DD (data civil, sem fuso) — comparamos
 * apenas as componentes Y/M/D normalizadas em UTC, o que é seguro contra DST.
 */

const CAMPAIGN_TZ = "America/Sao_Paulo";

/** Retorna {year, month, day} (mês 1-12) do "hoje" no fuso da campanha. */
function todayInCampaignTz(): { y: number; m: number; d: number } {
  // pt-BR com timeZone fixo → "DD/MM/YYYY"
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: CAMPAIGN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // en-CA produz "YYYY-MM-DD" estável
  const parts = fmt.format(new Date()).split("-");
  return {
    y: parseInt(parts[0], 10),
    m: parseInt(parts[1], 10),
    d: parseInt(parts[2], 10),
  };
}

/** Hoje no fuso da campanha, formatado como YYYY-MM-DD. */
export function todayCampaignYMD(): string {
  const { y, m, d } = todayInCampaignTz();
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Diferença em dias civis entre `dateStr` (YYYY-MM-DD) e o "hoje" no fuso da campanha.
 * Positivo = futuro, 0 = hoje, negativo = passado. Imune a DST e fuso do navegador.
 */
export function diasAteCampanha(dateStr: string): number {
  const t = todayInCampaignTz();
  const todayUTC = Date.UTC(t.y, t.m - 1, t.d);
  const [y, m, d] = dateStr.split("-").map(Number);
  const targetUTC = Date.UTC(y, m - 1, d);
  return Math.round((targetUTC - todayUTC) / 86400000);
}

/** Rótulo amigável de proximidade. */
export function diasLabelCampanha(dias: number): {
  label: string;
  tone: "soon" | "near" | "future" | "past";
} {
  if (dias < 0) return { label: `Há ${Math.abs(dias)} dia${Math.abs(dias) === 1 ? "" : "s"}`, tone: "past" };
  if (dias === 0) return { label: "Hoje", tone: "soon" };
  if (dias === 1) return { label: "Amanhã", tone: "soon" };
  if (dias <= 7) return { label: `Em ${dias} dias`, tone: "soon" };
  if (dias <= 30) return { label: `Em ${dias} dias`, tone: "near" };
  return { label: `Em ${dias} dias`, tone: "future" };
}