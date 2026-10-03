import { describe, expect, it } from "vitest";
import {
  incluirDescendentesDaArvore,
  particionarPessoasDaArvore,
  type PessoaArvore,
} from "./eleicao-arvore";

const pessoa = (
  id: string,
  tipo: PessoaArvore["tipo"],
  parent_id: string | null = null,
): PessoaArvore => ({ id, tipo, parent_id });

describe("particionarPessoasDaArvore", () => {
  it("mantem a hierarquia valida", () => {
    const pessoas = [
      pessoa("coord", "coordenador"),
      pessoa("lider", "lider", "coord"),
      { ...pessoa("cabo", "cabo", "lider"), valor_contratacao: 100 },
      { ...pessoa("cabo-direto", "cabo", "coord"), valor_contratacao: 50 },
    ];
    const resultado = particionarPessoasDaArvore(pessoas);
    expect(resultado.coordenadores.map((p) => p.id)).toEqual(["coord"]);
    expect(resultado.lideresRaiz).toEqual([]);
    expect(resultado.cabosRaiz).toEqual([]);
    expect(resultado.idsRenderizados.size).toBe(pessoas.length);
    expect(resultado.idsOmitidos).toEqual([]);
    expect(resultado.valorRenderizado).toBe(resultado.valorTotal);
  });

  it("exibe lider e cabo quando o pai nao esta na mesma area", () => {
    const pessoas = [
      pessoa("lider-fora", "lider", "coord-de-outra-area"),
      pessoa("cabo-fora", "cabo", "lider-de-outra-area"),
    ];
    const resultado = particionarPessoasDaArvore(pessoas);
    expect(resultado.lideresRaiz.map((p) => p.id)).toEqual(["lider-fora"]);
    expect(resultado.cabosRaiz.map((p) => p.id)).toEqual(["cabo-fora"]);
    expect(resultado.idsRenderizados.size).toBe(pessoas.length);
    expect(resultado.idsOmitidos).toEqual([]);
  });

  it("exibe tipos incompatíveis e ciclos como raizes", () => {
    const pessoas = [
      pessoa("lider-a", "lider", "lider-b"),
      pessoa("lider-b", "lider", "lider-a"),
      pessoa("cabo", "cabo", "cabo"),
    ];
    const resultado = particionarPessoasDaArvore(pessoas);
    expect(resultado.lideresRaiz).toHaveLength(2);
    expect(resultado.cabosRaiz).toHaveLength(1);
    expect(resultado.idsRenderizados.size).toBe(pessoas.length);
    expect(resultado.idsOmitidos).toEqual([]);
  });
});

describe("incluirDescendentesDaArvore", () => {
  it("preserva toda a equipe quando o filtro seleciona somente o lider avulso", () => {
    const pessoas = [
      pessoa("lider", "lider"),
      pessoa("cabo-1", "cabo", "lider"),
      pessoa("cabo-2", "cabo", "lider"),
    ];

    expect([...incluirDescendentesDaArvore(pessoas, ["lider"])]).toEqual([
      "lider",
      "cabo-1",
      "cabo-2",
    ]);
  });

  it("percorre coordenador, lider e cabo sem entrar em ciclo", () => {
    const pessoas = [
      pessoa("coord", "coordenador"),
      pessoa("lider", "lider", "coord"),
      pessoa("cabo", "cabo", "lider"),
      pessoa("ciclo", "cabo", "ciclo"),
    ];

    expect([...incluirDescendentesDaArvore(pessoas, ["coord"])]).toEqual([
      "coord",
      "lider",
      "cabo",
    ]);
  });

  it("respeita a regra de inclusao de registros arquivados", () => {
    const pessoas = [
      pessoa("lider", "lider"),
      { ...pessoa("cabo-ativo", "cabo", "lider"), arquivado: false },
      { ...pessoa("cabo-arquivado", "cabo", "lider"), arquivado: true },
    ];

    const ids = incluirDescendentesDaArvore(
      pessoas,
      ["lider"],
      (registro) => !(registro as PessoaArvore & { arquivado?: boolean }).arquivado,
    );
    expect([...ids]).toEqual(["lider", "cabo-ativo"]);
  });
});
