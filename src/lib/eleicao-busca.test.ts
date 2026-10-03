import { describe, expect, it } from "vitest";
import { correspondeBuscaEleicao } from "./eleicao-busca";

const pessoa = {
  nome: "João da Conceição",
  telefone: "+55 (67) 99259-0148",
  endereco: "Rua Ceará, 10",
};

describe("correspondeBuscaEleicao", () => {
  it("filtra por qualquer trecho numérico do telefone", () => {
    expect(correspondeBuscaEleicao(pessoa, "9259")).toBe(true);
    expect(correspondeBuscaEleicao(pessoa, "(67) 99259")).toBe(true);
  });

  it("ignora o zero inicial usado na discagem", () => {
    expect(correspondeBuscaEleicao(pessoa, "06799259")).toBe(true);
  });

  it("ignora acentos e diferenças entre maiúsculas e minúsculas", () => {
    expect(correspondeBuscaEleicao(pessoa, "JOAO CONCEICAO")).toBe(true);
    expect(correspondeBuscaEleicao(pessoa, "ceara")).toBe(true);
  });

  it("rejeita pessoas que não correspondem ao termo", () => {
    expect(correspondeBuscaEleicao(pessoa, "99887766")).toBe(false);
  });
});
