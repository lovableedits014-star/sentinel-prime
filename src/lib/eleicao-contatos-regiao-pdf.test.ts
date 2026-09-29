import { describe, expect, it } from "vitest";
import {
  agruparContatosRegiao,
  filtrarContatosRegiao,
  formatarEnderecoContato,
} from "./eleicao-contatos-regiao-pdf";

const pessoas = [
  { id: "c1", tipo: "coordenador" as const, nome: "Coord" },
  { id: "l1", tipo: "lider" as const, nome: "Lider", parent_id: "c1" },
  { id: "b1", tipo: "cabo" as const, nome: "Cabo", parent_id: "l1" },
  { id: "l2", tipo: "lider" as const, nome: "Avulso" },
  { id: "b2", tipo: "cabo" as const, nome: "Sem vinculo" },
];

describe("lista de contatos por regiao", () => {
  it("preserva a hierarquia e separa contatos avulsos", () => {
    const grupos = agruparContatosRegiao(pessoas);
    expect(grupos[0].coordenador?.id).toBe("c1");
    expect(grupos[0].lideres[0].cabos[0].id).toBe("b1");
    expect(grupos[1].lideres[0].lider.id).toBe("l2");
    expect(grupos[1].cabosDiretos[0].id).toBe("b2");
  });

  it("filtra os niveis selecionados", () => {
    expect(
      filtrarContatosRegiao(pessoas, {
        niveis: ["lider"],
        exibirTelefone: true,
        exibirEndereco: true,
        incluirArquivados: false,
      }),
    ).toHaveLength(2);
  });

  it("monta endereco a partir dos campos separados", () => {
    expect(
      formatarEnderecoContato({
        ...pessoas[0],
        rua: "Rua A",
        numero: "10",
        bairro: "Centro",
        cidade: "Campo Grande",
      }),
    ).toBe("Rua A, 10 - Centro - Campo Grande");
  });
});
