import { describe, expect, it } from "vitest";
import { buildElectionRanking, type ElectionRankingSource } from "./election-ranking";

const row = (values: Partial<ElectionRankingSource>): ElectionRankingSource => ({
  pessoa_id: crypto.randomUUID(),
  coordenador_id: "coord-1",
  coordenador_nome: "Ana",
  regiao: "Norte",
  cidade: null,
  escopo: "campo_grande",
  missoes: 10,
  cumpridas: 8,
  total_indicados: 8,
  meta_indicados: 10,
  votos_confirmados: 8,
  devolutivas_negativas: 2,
  ...values,
});

describe("buildElectionRanking", () => {
  it("consolida a equipe e calcula a nota ponderada", () => {
    const result = buildElectionRanking([row({}), row({ pessoa_id: "lider-1" })]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ score: 80, action: "elogiar", people: 2, position: 1 });
  });

  it("ordena pela nota e ignora pessoas sem coordenador", () => {
    const result = buildElectionRanking([
      row({
        coordenador_id: "baixo",
        coordenador_nome: "Baixo",
        cumpridas: 2,
        total_indicados: 2,
        votos_confirmados: 1,
        devolutivas_negativas: 9,
      }),
      row({ coordenador_id: "alto", coordenador_nome: "Alto" }),
      row({ coordenador_id: null, coordenador_nome: null }),
    ]);
    expect(result.map((item) => item.name)).toEqual(["Alto", "Baixo"]);
    expect(result[1].action).toBe("urgente");
  });

  it("limita percentuais acima da meta a 100", () => {
    const [result] = buildElectionRanking([row({ cumpridas: 15, total_indicados: 30 })]);
    expect(result.missionRate).toBe(100);
    expect(result.listRate).toBe(100);
    expect(result.score).toBe(96);
  });
});
