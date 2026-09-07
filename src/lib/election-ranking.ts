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
  pending: number;
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

export type ElectionRankingKind = "missions" | "votes";

const number = (value: unknown) => Number(value || 0);
export function buildElectionRanking(
  rows: ElectionRankingSource[],
  kind: ElectionRankingKind = "missions",
): ElectionRankingRow[] {
  const teams = new Map<
    string,
    Omit<
      ElectionRankingRow,
      | "position"
      | "pending"
      | "missionRate"
      | "listRate"
      | "conversionRate"
      | "validReturns"
      | "conversionInReview"
      | "score"
      | "action"
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
      const missionRate = team.missions ? (100 * team.done) / team.missions : 0;
      const listRate = team.indicationGoal ? (100 * team.indicated) / team.indicationGoal : 0;
      const validReturns = team.confirmed + team.negative;
      const conversionRate = validReturns ? (100 * team.confirmed) / validReturns : 0;
      return {
        ...team,
        pending: Math.max(team.missions - team.done, 0),
        missionRate,
        listRate,
        validReturns,
        conversionRate,
        conversionInReview: false,
        score: kind === "missions" ? team.done : team.confirmed,
        action: "acompanhar" as const,
      };
    })
    .sort((a, b) =>
      kind === "votes"
        ? b.confirmed - a.confirmed || a.name.localeCompare(b.name, "pt-BR")
        : b.done - a.done || a.name.localeCompare(b.name, "pt-BR"),
    )
    .map((row, index) => ({ ...row, position: index + 1 }));
}
