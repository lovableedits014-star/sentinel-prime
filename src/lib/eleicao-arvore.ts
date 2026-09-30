export type EleicaoTipoArvore = "coordenador" | "lider" | "cabo";

export interface PessoaArvore {
  id: string;
  tipo: EleicaoTipoArvore;
  parent_id?: string | null;
  valor_contratacao?: number | null;
}

export interface ParticaoArvore<T extends PessoaArvore> {
  coordenadores: T[];
  lideresRaiz: T[];
  cabosRaiz: T[];
  idsRenderizados: Set<string>;
  idsOmitidos: string[];
  valorTotal: number;
  valorRenderizado: number;
}

/**
 * Separa todos os registros de uma area em raizes renderizaveis.
 * Vinculos inconsistentes viram raizes visiveis em vez de desaparecerem.
 */
export function particionarPessoasDaArvore<T extends PessoaArvore>(
  pessoas: T[],
): ParticaoArvore<T> {
  const porId = new Map(pessoas.map((pessoa) => [pessoa.id, pessoa]));
  const coordenadores = pessoas.filter((pessoa) => pessoa.tipo === "coordenador");
  const lideres = pessoas.filter((pessoa) => pessoa.tipo === "lider");
  const cabos = pessoas.filter((pessoa) => pessoa.tipo === "cabo");

  const lideresRaiz = lideres.filter((lider) => {
    const pai = lider.parent_id ? porId.get(lider.parent_id) : undefined;
    return pai?.tipo !== "coordenador";
  });

  const cabosRaiz = cabos.filter((cabo) => {
    const pai = cabo.parent_id ? porId.get(cabo.parent_id) : undefined;
    return pai?.tipo !== "coordenador" && pai?.tipo !== "lider";
  });

  const idsRenderizados = new Set<string>();
  coordenadores.forEach((pessoa) => idsRenderizados.add(pessoa.id));
  lideresRaiz.forEach((pessoa) => idsRenderizados.add(pessoa.id));
  cabosRaiz.forEach((pessoa) => idsRenderizados.add(pessoa.id));

  lideres.forEach((lider) => {
    const pai = lider.parent_id ? porId.get(lider.parent_id) : undefined;
    if (pai?.tipo === "coordenador") idsRenderizados.add(lider.id);
  });
  cabos.forEach((cabo) => {
    const pai = cabo.parent_id ? porId.get(cabo.parent_id) : undefined;
    if (pai?.tipo === "coordenador" || pai?.tipo === "lider") idsRenderizados.add(cabo.id);
  });

  const idsOmitidos = pessoas
    .filter((pessoa) => !idsRenderizados.has(pessoa.id))
    .map((pessoa) => pessoa.id);
  const valorTotal = pessoas.reduce(
    (total, pessoa) => total + Number(pessoa.valor_contratacao || 0),
    0,
  );
  const valorRenderizado = pessoas.reduce(
    (total, pessoa) =>
      total + (idsRenderizados.has(pessoa.id) ? Number(pessoa.valor_contratacao || 0) : 0),
    0,
  );

  return {
    coordenadores,
    lideresRaiz,
    cabosRaiz,
    idsRenderizados,
    idsOmitidos,
    valorTotal,
    valorRenderizado,
  };
}
