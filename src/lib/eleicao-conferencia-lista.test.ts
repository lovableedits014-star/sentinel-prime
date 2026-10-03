import { describe, expect, it } from "vitest";
import {
  formatarTelefoneConferencia,
  normalizarLinhasConferencia,
} from "./eleicao-conferencia-lista";

describe("normalizarLinhasConferencia", () => {
  it("reconhece cabecalhos comuns e remove formatacao do telefone", () => {
    expect(
      normalizarLinhasConferencia([
        { "Nome completo": "  Maria Silva ", "Celular / WhatsApp": "(67) 99999-0000" },
      ]),
    ).toEqual([{ nome: "Maria Silva", telefone: "67999990000" }]);
  });

  it("ignora linhas vazias", () => {
    expect(normalizarLinhasConferencia([{ Nome: "", Telefone: "" }])).toEqual([]);
  });
});

describe("formatarTelefoneConferencia", () => {
  it("formata celular brasileiro", () => {
    expect(formatarTelefoneConferencia("5567999990000")).toBe("(67) 99999-0000");
  });
});
