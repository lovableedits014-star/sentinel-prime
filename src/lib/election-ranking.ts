export type ElectionRankingSource = {
  pessoa_id: string;
  coordenador_id: string | null;
  coordenador_nome: string | null;
  regiao: string | null;
  cidade: string | null;
  escopo: string;
  missoes: number;
  cumpridas: number;
  total_indicados: number;
  meta_indicados: number;
  votos_confirmados: number;
  devolutivas_negativas: number;
};

export type ElectionRankingRow = {
  id: string;
  position: number;
  name: string;
  area: string;
  people: number;
  missions: number;
  done: number;
  missionRate: number;
  indicated: number;
  indicationGoal: number;
  listRate: number;
  confirmed: number;
  negative: number;
  conversionRate: number;
  validReturns: number;
  conversionInReview: boolean;
  score: number;
  action: "elogiar" | "acompanhar" | "cobrar" | "urgente";
};

const number = (value: unknown) => Number(value || 0);
const percentage = (part: number, total: number) => (total > 0 ? (100 * part) / total : 0);
const cap = (value: number) => Math.max(0, Math.min(100, value));

export function buildElectionRanking(rows: ElectionRankingSource[]): ElectionRankingRow[] {
  const teams = new Map<
    string,
    Omit<
      ElectionRankingRow,
      | "position"
      | "score"
      | "action"
      | "missionRate"
      | "listRate"
      | "conversionRate"
      | "validReturns"
      | "conversionInReview"
    >
  >();

  for (const row of rows) {
    if (!row.coordenador_id) continue;
    const area =
      row.escopo === "interior" ? row.cidade || "Sem cidade" : row.regiao || "Sem região";
    const team = teams.get(row.coordenador_id) || {
      id: row.coordenador_id,
      name: row.coordenador_nome || "Coordenador sem nome",
      area,
      people: 0,
      missions: 0,
      done: 0,
      indicated: 0,
      indicationGoal: 0,
      confirmed: 0,
      negative: 0,
    };
    team.people += 1;
    team.missions += number(row.missoes);
    team.done += number(row.cumpridas);
    team.indicated += number(row.total_indicados);
    team.indicationGoal += number(row.meta_indicados);
    team.confirmed += number(row.votos_confirmados);
    team.negative += number(row.devolutivas_negativas);
    teams.set(row.coordenador_id, team);
  }

  return Array.from(teams.values())
    .map((team) => {
      const missionRate = cap(percentage(team.done, team.missions));
      const listRate = cap(percentage(team.indicated, team.indicationGoal));
      const validReturns = team.confirmed + team.negative;
      const conversionRate = cap(percentage(team.confirmed, validReturns));
      const conversionInReview = validReturns < 10;
      const score = Math.round(
        conversionInReview
          ? missionRate * 0.5 + listRate * 0.5
          : missionRate * 0.45 + listRate * 0.45 + conversionRate * 0.1,
      );
      const action =
        score >= 80 ? "elogiar" : score >= 60 ? "acompanhar" : score >= 40 ? "cobrar" : "urgente";
      return {
        ...team,
        missionRate,
        listRate,
        conversionRate,
        validReturns,
        conversionInReview,
        score,
        action,
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.confirmed - a.confirmed ||
        b.missionRate - a.missionRate ||
        a.name.localeCompare(b.name, "pt-BR"),
    )
    .map((row, index) => ({ ...row, position: index + 1 }));
}
