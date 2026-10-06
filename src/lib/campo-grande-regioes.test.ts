import { describe, expect, it } from "vitest";
import { classificarBairroCampoGrande, normalizarLocalidade } from "./campo-grande-regioes";

describe("classificarBairroCampoGrande", () => {
  it("normaliza acentos, caixa e preposicoes", () => {
    expect(normalizarLocalidade("  Jardim dos Estados ")).toBe("JARDIM ESTADOS");
  });

  it.each([
    ["Coronel Antonino", "segredo"],
    ["Chácara Cachoeira", "prosa"],
    ["Jardim Aero Rancho", "anhanduizinho"],
    ["Vila Santa Dorothéia", "centro"],
    ["Portal Caiobá II", "lagoa"],
    ["Nova Campo Grande", "imbirussu"],
    ["Parque Residencial Rita Vieira", "bandeira"],
  ])("classifica %s pela divisao territorial da PLANURB", (bairro, expected) => {
    expect(classificarBairroCampoGrande(bairro).regiao).toBe(expected);
  });

  it("usa Moreninha como regiao operacional quando cadastrada pela campanha", () => {
    expect(
      classificarBairroCampoGrande("Moreninha III", new Map(), new Set(["moreninha"])).regiao,
    ).toBe("moreninha");
    expect(classificarBairroCampoGrande("Moreninha III").regiao).toBe("bandeira");
  });

  it("prioriza o ajuste manual e nao adivinha localidades rurais", () => {
    const overrides = new Map([[normalizarLocalidade("Distrito de Anhanduí"), "anhanduizinho"]]);
    expect(classificarBairroCampoGrande("Distrito de Anhanduí", overrides).regiao).toBe(
      "anhanduizinho",
    );
    expect(classificarBairroCampoGrande("Distrito de Rochedinho").regiao).toBeNull();
  });
});
