import { describe, expect, it } from "vitest";
import { enriquecerHierarquia } from "./eleicao-export-configuravel";
import type { ExportPessoa } from "./eleicao-export-pdf";

const pessoa = (id: string, tipo: ExportPessoa["tipo"], parent_id: string | null = null): ExportPessoa => ({
  id,
  parent_id,
  nome: id,
  tipo,
  telefone: "",
});

describe("enriquecerHierarquia", () => {
  it("relaciona líderes e cabos e calcula os totais da árvore", () => {
    const resultado = enriquecerHierarquia([
      pessoa("Diego", "coordenador"),
      pessoa("Líder 1", "lider", "Diego"),
      pessoa("Cabo 1", "cabo", "Líder 1"),
      pessoa("Cabo direto", "cabo", "Diego"),
    ]);

    expect(resultado.find(p => p.id === "Diego")).toMatchObject({ qtd_lideres: 1, qtd_cabos: 2 });
    expect(resultado.find(p => p.id === "Cabo 1")).toMatchObject({ coordenador_nome: "Diego", lider_nome: "Líder 1" });
    expect(resultado.find(p => p.id === "Cabo direto")).toMatchObject({ coordenador_nome: "Diego" });
  });

  it("não trava quando existe ciclo na hierarquia", () => {
    const resultado = enriquecerHierarquia([
      pessoa("A", "coordenador", "B"),
      pessoa("B", "lider", "A"),
    ]);
    expect(resultado).toHaveLength(2);
  });
});
