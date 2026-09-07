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
  it("consolida a equipe no ranking de missoes", () => {
    const result = buildElectionRanking([row({}), row({ pessoa_id: "lider-1" })], "missions");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ done: 16, missions: 20, pending: 4, people: 2, position: 1 });
  });

  it("ordena missoes apenas pela quantidade concluida e ignora pessoas sem coordenador", () => {
    const result = buildElectionRanking([
      row({
        coordenador_id: "baixo",
        coordenador_nome: "Baixo",
        cumpridas: 2,
        total_indicados: 999,
        votos_confirmados: 999,
      }),
      row({ coordenador_id: "alto", coordenador_nome: "Alto" }),
      row({ coordenador_id: null, coordenador_nome: null }),
    ], "missions");
    expect(result.map((item) => item.name)).toEqual(["Alto", "Baixo"]);
  });

  it("ordena votos somente pela quantidade confirmada", () => {
    const result = buildElectionRanking([
      row({ coordenador_id: "mais-indicados", coordenador_nome: "Mais indicados", total_indicados: 500, votos_confirmados: 4 }),
      row({ coordenador_id: "mais-votos", coordenador_nome: "Mais votos", total_indicados: 10, votos_confirmados: 5 }),
    ], "votes");
    expect(result.map((item) => item.name)).toEqual(["Mais votos", "Mais indicados"]);
  });

  it("nao usa indicados para desempatar votos", () => {
    const result = buildElectionRanking([
      row({ coordenador_id: "z", coordenador_nome: "Zeca", total_indicados: 500, votos_confirmados: 5 }),
      row({ coordenador_id: "a", coordenador_nome: "Ana", total_indicados: 1, votos_confirmados: 5 }),
    ], "votes");
    expect(result.map((item) => item.name)).toEqual(["Ana", "Zeca"]);
  });

  it("calcula a conversao como votos confirmados divididos por indicados", () => {
    const [result] = buildElectionRanking([
      row({ total_indicados: 20, votos_confirmados: 5, devolutivas_negativas: 100 }),
    ], "votes");
    expect(result.conversionRate).toBe(25);
  });
});
