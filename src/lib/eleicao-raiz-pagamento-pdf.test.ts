import { describe, expect, it } from "vitest";

import {
  listarValoresRaizPagamento,
  resumirRaizPagamento,
  type PessoaRaizPagamento,
} from "./eleicao-raiz-pagamento-pdf";

const pessoas: PessoaRaizPagamento[] = [
  { id: "coord", tipo: "coordenador", nome: "Coord", valor_contratacao: 150 },
  { id: "lider-1", tipo: "lider", nome: "Líder 1", parent_id: "coord", valor_contratacao: 150 },
  { id: "lider-2", tipo: "lider", nome: "Líder 2", parent_id: "coord", valor_contratacao: 100 },
  { id: "cabo-1", tipo: "cabo", nome: "Cabo 1", parent_id: "lider-1", valor_contratacao: 100 },
  { id: "cabo-2", tipo: "cabo", nome: "Cabo 2", parent_id: "coord", valor_contratacao: 150 },
  {
    id: "fora",
    tipo: "cabo",
    nome: "Fora",
    parent_id: "outra-raiz",
    valor_contratacao: 100,
    escopo: "interior",
  },
  {
    id: "voluntario",
    tipo: "cabo",
    nome: "Voluntário",
    parent_id: "lider-1",
    valor_contratacao: 100,
    is_voluntario: true,
  },
];

describe("filtros da raiz de pagamento", () => {
  it("combina níveis e valores e calcula a métrica", () => {
    const resumo = resumirRaizPagamento(pessoas[0], pessoas, {
      niveis: ["coordenador", "lider"],
      valores: [150],
    });

    expect(resumo.pessoas.map((pessoa) => pessoa.id)).toEqual(["coord", "lider-1"]);
    expect(resumo.porNivel).toEqual({ coordenador: 1, lider: 1, cabo: 0 });
    expect(resumo.total).toBe(300);
  });

  it("limita cabos à raiz e ignora voluntários", () => {
    const resumo = resumirRaizPagamento(pessoas[0], pessoas, {
      niveis: ["cabo"],
      valores: [100],
    });

    expect(resumo.pessoas.map((pessoa) => pessoa.id)).toEqual(["cabo-1"]);
    expect(listarValoresRaizPagamento(pessoas[0], pessoas)).toEqual([100, 150]);
  });

  it("reune contratados de todas as regioes quando a opcao esta ativa", () => {
    const resumo = resumirRaizPagamento(pessoas[0], pessoas, {
      niveis: ["cabo"],
      valores: [100],
      todasRegioes: true,
    });

    expect(resumo.pessoas.map((pessoa) => pessoa.id)).toEqual(["cabo-1", "fora"]);
  });

  it("permite gerar somente Campo Grande sem os contratados do Interior", () => {
    const resumo = resumirRaizPagamento(pessoas[0], pessoas, {
      niveis: ["cabo"],
      valores: [100],
      todasRegioes: true,
      incluirInterior: false,
    });

    expect(resumo.pessoas.map((pessoa) => pessoa.id)).toEqual(["cabo-1"]);
  });
});
