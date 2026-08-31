import { describe, expect, it } from "vitest";
import { getEleicaoSituacao } from "./eleicao-situacao";

describe("getEleicaoSituacao", () => {
  it("classifica valor positivo como contratado", () => {
    expect(getEleicaoSituacao({ valor_contratacao: 1000 })).toBe("contratado");
  });

  it("classifica zero e nulo como sem contrato", () => {
    expect(getEleicaoSituacao({ valor_contratacao: 0 })).toBe("sem_contrato");
    expect(getEleicaoSituacao({ valor_contratacao: null })).toBe("sem_contrato");
  });

  it("voluntário prevalece sobre valor legado", () => {
    expect(getEleicaoSituacao({ valor_contratacao: 1000, is_voluntario: true })).toBe("voluntario");
  });

  it("arquivado prevalece sobre todas as situações", () => {
    expect(getEleicaoSituacao({ valor_contratacao: 1000, arquivado_em: "2026-08-31T12:00:00Z" })).toBe("arquivado");
  });
});
