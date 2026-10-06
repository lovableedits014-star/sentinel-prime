import { describe, expect, it } from "vitest";
import {
  classificarBairroCampoGrande,
  classificarLocalCampoGrande,
  normalizarLocalidade,
} from "./campo-grande-regioes";

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

  it("mantem o distrito de Anhandui separado da regiao urbana do Anhanduizinho", () => {
    expect(classificarBairroCampoGrande("Distrito de Anhanduí").regiao).toBe("anhandui");
    expect(classificarBairroCampoGrande("Piratininga").regiao).toBe("anhanduizinho");
  });

  it("prioriza a identidade oficial da escola sobre um bairro legado incorreto", () => {
    expect(
      classificarLocalCampoGrande({
        nomeLocal: "Escola Municipal Isauro Bento Nogueira",
        bairro: "Piratininga",
        zona: 8,
        nrLocal: 1546,
      }),
    ).toEqual({ regiao: "anhandui", fonte: "local_oficial" });
  });
});
