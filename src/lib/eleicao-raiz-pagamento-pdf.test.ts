import { describe, expect, it } from "vitest";

import {
  listarValoresRaizPagamento,
  resumirPagamentoGeral,
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

describe("resumo do pagamento geral", () => {
  it("agrupa coordenador, lideres e cabos por faixa de valor", () => {
    const equipe: PessoaRaizPagamento[] = [
      { id: "c", tipo: "coordenador", nome: "Fulano", regiao: "sul", valor_contratacao: 500 },
      {
        id: "l1",
        tipo: "lider",
        nome: "Lider 1",
        parent_id: "c",
        regiao: "sul",
        valor_contratacao: 200,
      },
      {
        id: "l2",
        tipo: "lider",
        nome: "Lider 2",
        parent_id: "c",
        regiao: "sul",
        valor_contratacao: 200,
      },
      {
        id: "cb1",
        tipo: "cabo",
        nome: "Cabo 1",
        parent_id: "l1",
        regiao: "sul",
        valor_contratacao: 150,
      },
      {
        id: "cb2",
        tipo: "cabo",
        nome: "Cabo 2",
        parent_id: "l2",
        regiao: "sul",
        valor_contratacao: 100,
      },
      {
        id: "cb3",
        tipo: "cabo",
        nome: "Cabo 3",
        parent_id: "c",
        regiao: "sul",
        valor_contratacao: 100,
      },
    ];

    const [regiao] = resumirPagamentoGeral(equipe, equipe);
    const [grupo] = regiao.grupos;

    expect(grupo.responsavel?.nome).toBe("Fulano");
    expect(grupo.lideres).toHaveLength(2);
    expect(grupo.faixasCabos).toEqual([
      { quantidade: 1, valorUnitario: 150, subtotal: 150 },
      { quantidade: 2, valorUnitario: 100, subtotal: 200 },
    ]);
    expect(grupo.total).toBe(1250);
    expect(regiao.total).toBe(1250);
  });

  it("separa lider avulso e inclui os cabos dele", () => {
    const equipe: PessoaRaizPagamento[] = [
      { id: "l", tipo: "lider", nome: "Avulso", regiao: "norte", valor_contratacao: 250 },
      {
        id: "cb",
        tipo: "cabo",
        nome: "Cabo",
        parent_id: "l",
        regiao: "norte",
        valor_contratacao: 100,
      },
    ];

    const [regiao] = resumirPagamentoGeral(equipe, equipe);

    expect(regiao.grupos[0].tipo).toBe("lider_avulso");
    expect(regiao.grupos[0].cabos).toHaveLength(1);
    expect(regiao.grupos[0].total).toBe(350);
  });

  it("separa Campo Grande por regiao urbana em ordem alfabetica", () => {
    const equipe: PessoaRaizPagamento[] = [
      {
        id: "prosa",
        tipo: "coordenador",
        nome: "Coord Prosa",
        escopo: "campo_grande",
        cidade: "Campo Grande",
        regiao: "prosa",
        valor_contratacao: 100,
      },
      {
        id: "anhanduizinho",
        tipo: "coordenador",
        nome: "Coord Anhanduizinho",
        escopo: "campo_grande",
        cidade: "Campo Grande",
        regiao: "anhanduizinho",
        valor_contratacao: 100,
      },
      {
        id: "centro",
        tipo: "coordenador",
        nome: "Coord Centro",
        escopo: "campo_grande",
        cidade: "Campo Grande",
        regiao: "centro",
        valor_contratacao: 100,
      },
    ];

    expect(resumirPagamentoGeral(equipe, equipe).map((item) => item.local)).toEqual([
      "Anhanduizinho",
      "Centro",
      "Prosa",
    ]);
  });

  it("continua agrupando o Interior pela cidade", () => {
    const equipe: PessoaRaizPagamento[] = [
      {
        id: "interior",
        tipo: "coordenador",
        nome: "Coord Interior",
        escopo: "interior",
        cidade: "Dourados",
        regiao: "centro",
        valor_contratacao: 100,
      },
    ];

    expect(resumirPagamentoGeral(equipe, equipe)[0].local).toBe("Dourados");
  });
});
