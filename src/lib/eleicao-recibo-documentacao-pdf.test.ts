import { describe, expect, it } from "vitest";

import {
  resumirDocumentacao,
  type ReciboDocumentacaoPessoa,
} from "./eleicao-recibo-documentacao-pdf";

const pessoas: ReciboDocumentacaoPessoa[] = [
  { id: "coord", tipo: "coordenador", nome: "Coord", valor_contratacao: 200 },
  { id: "lider", tipo: "lider", nome: "Líder", parent_id: "coord", valor_contratacao: 150 },
  { id: "cabo", tipo: "cabo", nome: "Cabo", parent_id: "lider", valor_contratacao: 100 },
  { id: "direto", tipo: "cabo", nome: "Direto", parent_id: "coord", valor_contratacao: 100 },
  { id: "fora", tipo: "cabo", nome: "Fora", parent_id: "outra", valor_contratacao: 100 },
];

describe("filtros da raiz de documentação", () => {
  it("seleciona os níveis sem usar o valor como categoria", () => {
    const resumo = resumirDocumentacao(pessoas[0], pessoas, { niveis: ["coordenador", "cabo"] });

    expect(resumo.pessoas.map((pessoa) => pessoa.id)).toEqual(["coord", "cabo", "direto"]);
    expect(resumo.porNivel).toEqual({ coordenador: 1, lider: 0, cabo: 2 });
  });

  it("conta o líder apenas como referência quando somente seus cabos assinam", () => {
    const resumo = resumirDocumentacao(pessoas[0], pessoas, { niveis: ["cabo"] });

    expect(resumo.pessoas).toHaveLength(2);
    expect(resumo.linhas).toBe(3);
  });
});
