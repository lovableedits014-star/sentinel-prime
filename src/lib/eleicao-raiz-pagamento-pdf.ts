export type PessoaRaizPagamento = {
  id: string;
  tipo: "coordenador" | "lider" | "cabo";
  nome: string;
  telefone?: string | null;
  endereco?: string | null;
  rua?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  regiao?: string | null;
  escopo?: "campo_grande" | "interior" | string | null;
  parent_id?: string | null;
  valor_contratacao?: number | null;
  is_voluntario?: boolean | null;
  arquivado_em?: string | null;
};

export type NivelRaizPagamento = "coordenador" | "lider" | "cabo";

export type FiltrosRaizPagamento = {
  niveis: NivelRaizPagamento[];
  valores: number[];
  todasRegioes?: boolean;
  incluirInterior?: boolean;
  exibirValor?: boolean;
  incluirAssinatura?: boolean;
};

export type ResumoRaizPagamento = {
  pessoas: PessoaRaizPagamento[];
  total: number;
  porNivel: Record<NivelRaizPagamento, number>;
};

export type FiltrosListaContatos = {
  niveis: NivelRaizPagamento[];
  incluirInterior?: boolean;
  locais?: string[];
};

export type GrupoListaContatos = {
  local: string;
  pessoas: PessoaRaizPagamento[];
};

export type FaixaPagamento = { quantidade: number; valorUnitario: number; subtotal: number };
export type GrupoPagamentoGeral = {
  tipo: "coordenador" | "lider_avulso" | "cabos_sem_responsavel";
  responsavel: PessoaRaizPagamento | null;
  lideres: PessoaRaizPagamento[];
  cabos: PessoaRaizPagamento[];
  faixasCabos: FaixaPagamento[];
  total: number;
};
export type RegiaoPagamentoGeral = { local: string; grupos: GrupoPagamentoGeral[]; total: number };

const slug = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const dinheiro = (value: number) =>
  value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const REGIAO_CAMPO_GRANDE_LABELS: Record<string, string> = {
  anhanduizinho: "Anhanduizinho",
  bandeira: "Bandeira",
  centro: "Centro",
  imbirussu: "Imbirussu",
  lagoa: "Lagoa",
  moreninha: "Moreninha",
  prosa: "Prosa",
  segredo: "Segredo",
};

const localPagamento = (pessoa: PessoaRaizPagamento) => {
  const local =
    pessoa.escopo === "interior" ? pessoa.cidade || pessoa.regiao : pessoa.regiao || pessoa.cidade;
  if (!local) return "Nao informado";
  return REGIAO_CAMPO_GRANDE_LABELS[local.toLocaleLowerCase("pt-BR")] || local;
};

const localDaHierarquia = (
  pessoa: PessoaRaizPagamento,
  porId: Map<string, PessoaRaizPagamento>,
) => {
  let atual: PessoaRaizPagamento | undefined = pessoa;
  let local = localPagamento(pessoa);
  const visitados = new Set<string>();
  while (atual?.parent_id && !visitados.has(atual.parent_id)) {
    visitados.add(atual.parent_id);
    atual = porId.get(atual.parent_id);
    if (atual) local = localPagamento(atual);
  }
  return local;
};

export function resumirListaContatos(
  pessoas: PessoaRaizPagamento[],
  filtros: FiltrosListaContatos,
): GrupoListaContatos[] {
  const ativos = pessoas.filter(
    (pessoa) => !pessoa.arquivado_em && (filtros.incluirInterior || pessoa.escopo !== "interior"),
  );
  const porId = new Map(ativos.map((pessoa) => [pessoa.id, pessoa]));
  const niveis = new Set(filtros.niveis);
  const locais = filtros.locais ? new Set(filtros.locais) : null;
  const grupos = new Map<string, PessoaRaizPagamento[]>();
  const ordemNivel: Record<NivelRaizPagamento, number> = { coordenador: 0, lider: 1, cabo: 2 };

  ativos
    .filter((pessoa) => niveis.has(pessoa.tipo))
    .forEach((pessoa) => {
      const local = localDaHierarquia(pessoa, porId);
      if (locais && !locais.has(local)) return;
      grupos.set(local, [...(grupos.get(local) || []), pessoa]);
    });

  return Array.from(grupos, ([local, pessoasDoLocal]) => ({
    local,
    pessoas: pessoasDoLocal.sort(
      (a, b) => ordemNivel[a.tipo] - ordemNivel[b.tipo] || a.nome.localeCompare(b.nome, "pt-BR"),
    ),
  })).sort((a, b) => a.local.localeCompare(b.local, "pt-BR"));
}

export function listarLocaisContatos(pessoas: PessoaRaizPagamento[], incluirInterior = false) {
  return resumirListaContatos(pessoas, {
    niveis: ["coordenador", "lider", "cabo"],
    incluirInterior,
  }).map((grupo) => grupo.local);
}

const contratado = (pessoa: PessoaRaizPagamento) =>
  !pessoa.arquivado_em && !pessoa.is_voluntario && Number(pessoa.valor_contratacao || 0) > 0;

const pessoasNoEscopo = (raiz: PessoaRaizPagamento, pessoas: PessoaRaizPagamento[]) => {
  const ativos = pessoas.filter((pessoa) => !pessoa.arquivado_em);
  if (raiz.tipo === "lider") {
    return [
      raiz,
      ...ativos.filter((pessoa) => pessoa.tipo === "cabo" && pessoa.parent_id === raiz.id),
    ];
  }

  const lideres = ativos.filter(
    (pessoa) => pessoa.tipo === "lider" && pessoa.parent_id === raiz.id,
  );
  const idsLideres = new Set(lideres.map((lider) => lider.id));
  const cabos = ativos.filter(
    (pessoa) =>
      pessoa.tipo === "cabo" &&
      (pessoa.parent_id === raiz.id || (pessoa.parent_id && idsLideres.has(pessoa.parent_id))),
  );
  return [raiz, ...lideres, ...cabos];
};

const pessoasDoRelatorio = (
  raiz: PessoaRaizPagamento,
  pessoas: PessoaRaizPagamento[],
  todasRegioes = false,
  incluirInterior = true,
) =>
  todasRegioes
    ? pessoas.filter(
        (pessoa) => !pessoa.arquivado_em && (incluirInterior || pessoa.escopo !== "interior"),
      )
    : pessoasNoEscopo(raiz, pessoas);

export function listarValoresRaizPagamento(
  raiz: PessoaRaizPagamento,
  pessoas: PessoaRaizPagamento[],
  todasRegioes = false,
  incluirInterior = true,
) {
  return Array.from(
    new Set(
      pessoasDoRelatorio(raiz, pessoas, todasRegioes, incluirInterior)
        .filter(contratado)
        .map((pessoa) => Number(pessoa.valor_contratacao)),
    ),
  ).sort((a, b) => a - b);
}

export function resumirRaizPagamento(
  raiz: PessoaRaizPagamento,
  pessoas: PessoaRaizPagamento[],
  filtros: FiltrosRaizPagamento,
): ResumoRaizPagamento {
  const niveis = new Set(filtros.niveis);
  const valores = new Set(filtros.valores.map(Number));
  const selecionadas = pessoasDoRelatorio(
    raiz,
    pessoas,
    filtros.todasRegioes,
    filtros.incluirInterior,
  ).filter(
    (pessoa) =>
      contratado(pessoa) &&
      niveis.has(pessoa.tipo) &&
      valores.has(Number(pessoa.valor_contratacao)),
  );

  return {
    pessoas: selecionadas,
    total: selecionadas.reduce((soma, pessoa) => soma + Number(pessoa.valor_contratacao || 0), 0),
    porNivel: {
      coordenador: selecionadas.filter((pessoa) => pessoa.tipo === "coordenador").length,
      lider: selecionadas.filter((pessoa) => pessoa.tipo === "lider").length,
      cabo: selecionadas.filter((pessoa) => pessoa.tipo === "cabo").length,
    },
  };
}

const agruparFaixasPagamento = (pessoas: PessoaRaizPagamento[]): FaixaPagamento[] => {
  const faixas = new Map<number, number>();
  pessoas.forEach((pessoa) => {
    const valor = Number(pessoa.valor_contratacao || 0);
    faixas.set(valor, (faixas.get(valor) || 0) + 1);
  });
  return Array.from(faixas, ([valorUnitario, quantidade]) => ({
    quantidade,
    valorUnitario,
    subtotal: quantidade * valorUnitario,
  })).sort((a, b) => b.valorUnitario - a.valorUnitario);
};

export function resumirPagamentoGeral(
  pessoasAtivas: PessoaRaizPagamento[],
  pessoasSelecionadas: PessoaRaizPagamento[],
): RegiaoPagamentoGeral[] {
  const ativos = pessoasAtivas.filter((pessoa) => !pessoa.arquivado_em);
  const porId = new Map(ativos.map((pessoa) => [pessoa.id, pessoa]));
  const selecionados = new Set(pessoasSelecionadas.map((pessoa) => pessoa.id));
  const localDaPessoa = (pessoa: PessoaRaizPagamento) => localDaHierarquia(pessoa, porId);
  const locais = Array.from(new Set(pessoasSelecionadas.map(localDaPessoa))).sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
  const soma = (lista: PessoaRaizPagamento[]) =>
    lista.reduce((total, pessoa) => total + Number(pessoa.valor_contratacao || 0), 0);

  return locais.map((local) => {
    const pessoasLocal = ativos.filter((pessoa) => localDaPessoa(pessoa) === local);
    const coordenadores = pessoasLocal
      .filter((pessoa) => pessoa.tipo === "coordenador")
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    const idsCoordenadores = new Set(coordenadores.map((pessoa) => pessoa.id));
    const grupos: GrupoPagamentoGeral[] = [];

    coordenadores.forEach((coordenador) => {
      const lideresTodos = pessoasLocal.filter(
        (pessoa) => pessoa.tipo === "lider" && pessoa.parent_id === coordenador.id,
      );
      const idsLideres = new Set(lideresTodos.map((pessoa) => pessoa.id));
      const lideres = lideresTodos.filter((pessoa) => selecionados.has(pessoa.id));
      const cabos = pessoasLocal.filter(
        (pessoa) =>
          pessoa.tipo === "cabo" &&
          selecionados.has(pessoa.id) &&
          (pessoa.parent_id === coordenador.id ||
            (!!pessoa.parent_id && idsLideres.has(pessoa.parent_id))),
      );
      const responsavel = selecionados.has(coordenador.id) ? coordenador : null;
      if (!responsavel && !lideres.length && !cabos.length) return;
      grupos.push({
        tipo: "coordenador",
        responsavel: coordenador,
        lideres,
        cabos,
        faixasCabos: agruparFaixasPagamento(cabos),
        total:
          (responsavel ? Number(coordenador.valor_contratacao || 0) : 0) +
          soma(lideres) +
          soma(cabos),
      });
    });

    pessoasLocal
      .filter(
        (pessoa) =>
          pessoa.tipo === "lider" && (!pessoa.parent_id || !idsCoordenadores.has(pessoa.parent_id)),
      )
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
      .forEach((lider) => {
        const cabos = pessoasLocal.filter(
          (pessoa) =>
            pessoa.tipo === "cabo" && pessoa.parent_id === lider.id && selecionados.has(pessoa.id),
        );
        const responsavel = selecionados.has(lider.id) ? lider : null;
        if (!responsavel && !cabos.length) return;
        grupos.push({
          tipo: "lider_avulso",
          responsavel: lider,
          lideres: [],
          cabos,
          faixasCabos: agruparFaixasPagamento(cabos),
          total: (responsavel ? Number(lider.valor_contratacao || 0) : 0) + soma(cabos),
        });
      });

    const idsResponsaveis = new Set(
      pessoasLocal.filter((pessoa) => pessoa.tipo !== "cabo").map((pessoa) => pessoa.id),
    );
    const cabosSemResponsavel = pessoasLocal.filter(
      (pessoa) =>
        pessoa.tipo === "cabo" &&
        selecionados.has(pessoa.id) &&
        (!pessoa.parent_id || !idsResponsaveis.has(pessoa.parent_id)),
    );
    if (cabosSemResponsavel.length) {
      grupos.push({
        tipo: "cabos_sem_responsavel",
        responsavel: null,
        lideres: [],
        cabos: cabosSemResponsavel,
        faixasCabos: agruparFaixasPagamento(cabosSemResponsavel),
        total: soma(cabosSemResponsavel),
      });
    }

    return { local, grupos, total: grupos.reduce((total, grupo) => total + grupo.total, 0) };
  });
}

const telefone = (value?: string | null) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return value || "-";
};

const enderecoCompleto = (pessoa: PessoaRaizPagamento) => {
  const ruaNumero = [pessoa.rua, pessoa.numero].filter(Boolean).join(", ");
  return [ruaNumero || pessoa.endereco, pessoa.bairro].filter(Boolean).join(" - ") || "-";
};

export async function gerarListaContatosPdf(
  pessoas: PessoaRaizPagamento[],
  filtros: FiltrosListaContatos,
) {
  const grupos = resumirListaContatos(pessoas, filtros);
  const total = grupos.reduce((soma, grupo) => soma + grupo.pessoas.length, 0);
  if (!total) throw new Error("Nenhum contato encontrado com os filtros selecionados.");

  const [pdfModule, tableModule] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const jsPDF =
    (pdfModule as any).jsPDF || (pdfModule as any).default?.jsPDF || (pdfModule as any).default;
  const autoTable = (tableModule as any).default?.default || (tableModule as any).default;
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 36;
  const rotulos: Record<NivelRaizPagamento, string> = {
    coordenador: "Coordenador",
    lider: "Lider",
    cabo: "Cabo eleitoral",
  };
  const rows: string[][] = [];
  grupos.forEach((grupo) => {
    rows.push([`REGIAO / CIDADE: ${grupo.local}`, "", "", ""]);
    grupo.pessoas.forEach((pessoa) =>
      rows.push([
        rotulos[pessoa.tipo],
        pessoa.nome,
        telefone(pessoa.telefone),
        enderecoCompleto(pessoa),
      ]),
    );
  });

  const drawHeader = () => {
    doc.setFillColor(15, 52, 120);
    doc.rect(0, 0, width, 70, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.text("LISTA DE CONTATOS", margin, 29);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.text(`${total} contato(s) em ${grupos.length} regiao(oes) / cidade(s)`, margin, 49);
    doc.text(`Gerado em ${new Date().toLocaleDateString("pt-BR")}`, width - margin, 49, {
      align: "right",
    });
  };
  drawHeader();

  autoTable(doc, {
    startY: 88,
    margin: { top: 86, left: margin, right: margin, bottom: 32 },
    head: [["CARGO", "NOME", "TELEFONE", "ENDERECO"]],
    body: rows,
    theme: "grid",
    showHead: "everyPage",
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      cellPadding: 5,
      lineColor: [203, 213, 225],
      lineWidth: 0.5,
      valign: "middle",
      overflow: "linebreak",
    },
    headStyles: { fillColor: [226, 232, 240], textColor: [15, 23, 42], fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 90, fontStyle: "bold" },
      1: { cellWidth: 190 },
      2: { cellWidth: 105 },
      3: { cellWidth: 344 },
    },
    didParseCell: (data: any) => {
      const primeiraColuna = String(data.row.raw?.[0] || "");
      if (data.section === "body" && primeiraColuna.startsWith("REGIAO / CIDADE:")) {
        data.cell.styles.fillColor = [15, 52, 120];
        data.cell.styles.textColor = [255, 255, 255];
        data.cell.styles.fontStyle = "bold";
      }
    },
    didDrawPage: (data: any) => {
      if (data.pageNumber > 1) drawHeader();
      doc.setTextColor(100, 116, 139);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(`Pagina ${data.pageNumber}`, width - margin, height - 15, { align: "right" });
    },
  });

  doc.save("Lista-de-contatos-por-regiao.pdf");
  return { contatos: total, regioes: grupos.length };
}

export async function gerarRaizPagamentoPdf(
  raiz: PessoaRaizPagamento,
  pessoas: PessoaRaizPagamento[],
  filtros: FiltrosRaizPagamento,
) {
  if (raiz.tipo === "cabo")
    throw new Error("A raiz para pagamento deve ser um coordenador ou lider.");

  const [pdfModule, tableModule] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const jsPDF =
    (pdfModule as any).jsPDF || (pdfModule as any).default?.jsPDF || (pdfModule as any).default;
  const autoTable = (tableModule as any).default?.default || (tableModule as any).default;
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 38;
  const ativos = filtros.todasRegioes
    ? pessoasDoRelatorio(raiz, pessoas, true, filtros.incluirInterior)
    : pessoas.filter((p) => !p.arquivado_em);
  const resumo = resumirRaizPagamento(raiz, pessoas, filtros);
  const idsSelecionados = new Set(resumo.pessoas.map((pessoa) => pessoa.id));
  const lideres =
    raiz.tipo === "coordenador"
      ? ativos
          .filter((p) => p.tipo === "lider" && p.parent_id === raiz.id)
          .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
      : [raiz];
  const caboDoRelatorio = (pessoa: PessoaRaizPagamento) => idsSelecionados.has(pessoa.id);
  const incluirRaiz = idsSelecionados.has(raiz.id);
  const cabosDiretos =
    raiz.tipo === "coordenador"
      ? ativos.filter((p) => p.tipo === "cabo" && p.parent_id === raiz.id && caboDoRelatorio(p))
      : [];
  const cabosPorLider = new Map(
    lideres.map((lider) => [
      lider.id,
      ativos
        .filter((p) => p.tipo === "cabo" && p.parent_id === lider.id && caboDoRelatorio(p))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    ]),
  );
  const lideresVisiveis = lideres.filter(
    (lider) => idsSelecionados.has(lider.id) || (cabosPorLider.get(lider.id)?.length || 0) > 0,
  );
  const membros =
    raiz.tipo === "coordenador"
      ? [
          raiz,
          ...lideresVisiveis,
          ...cabosDiretos,
          ...lideresVisiveis.flatMap((l) => cabosPorLider.get(l.id) || []),
        ]
      : [raiz, ...(cabosPorLider.get(raiz.id) || [])];
  const contratados = resumo.pessoas;
  const total = resumo.total;
  const exibirValor = filtros.exibirValor !== false;
  const incluirAssinatura = filtros.incluirAssinatura === true;
  const todasRegioes = filtros.todasRegioes === true;
  const rows: Array<Array<string>> = [];
  const criarLinha = (nivel: string, pessoa: PessoaRaizPagamento) => [
    nivel,
    pessoa.nome,
    telefone(pessoa.telefone),
    ...(exibirValor ? [dinheiro(Number(pessoa.valor_contratacao))] : []),
    ...(incluirAssinatura ? [""] : []),
  ];

  if (todasRegioes) {
    const regioes = resumirPagamentoGeral(ativos, contratados);
    const linhaResumo = (grupo: string, quantidade: string, faixa: string, subtotal: string) => [
      grupo,
      quantidade,
      faixa,
      ...(exibirValor ? [subtotal] : []),
      ...(incluirAssinatura ? [""] : []),
    ];
    regioes.forEach((regiao) => {
      rows.push(linhaResumo(`REGIAO: ${regiao.local}`, "", "", ""));
      regiao.grupos.forEach((grupo) => {
        if (grupo.tipo === "coordenador" && grupo.responsavel) {
          const selecionado = idsSelecionados.has(grupo.responsavel.id);
          rows.push(
            linhaResumo(
              `COORDENADOR: ${grupo.responsavel.nome}`,
              selecionado ? "1" : "-",
              selecionado
                ? dinheiro(Number(grupo.responsavel.valor_contratacao || 0))
                : "Nao incluido",
              selecionado
                ? dinheiro(Number(grupo.responsavel.valor_contratacao || 0))
                : dinheiro(0),
            ),
          );
          if (grupo.lideres.length) {
            const valoresLideres = new Set(
              grupo.lideres.map((lider) => Number(lider.valor_contratacao || 0)),
            );
            rows.push(
              linhaResumo(
                "  LIDERES",
                String(grupo.lideres.length),
                valoresLideres.size === 1
                  ? dinheiro(Array.from(valoresLideres)[0])
                  : "Valores variados",
                dinheiro(
                  grupo.lideres.reduce(
                    (soma, lider) => soma + Number(lider.valor_contratacao || 0),
                    0,
                  ),
                ),
              ),
            );
          }
        } else if (grupo.tipo === "lider_avulso" && grupo.responsavel) {
          const selecionado = idsSelecionados.has(grupo.responsavel.id);
          rows.push(
            linhaResumo(
              `LIDER AVULSO: ${grupo.responsavel.nome}`,
              selecionado ? "1" : "-",
              selecionado
                ? dinheiro(Number(grupo.responsavel.valor_contratacao || 0))
                : "Nao incluido",
              selecionado
                ? dinheiro(Number(grupo.responsavel.valor_contratacao || 0))
                : dinheiro(0),
            ),
          );
        } else {
          rows.push(linhaResumo("CABOS SEM RESPONSAVEL", "", "", ""));
        }
        grupo.faixasCabos.forEach((faixa) =>
          rows.push(
            linhaResumo(
              "  CABOS",
              String(faixa.quantidade),
              `${faixa.quantidade} cabo(s) de ${dinheiro(faixa.valorUnitario)}`,
              dinheiro(faixa.subtotal),
            ),
          ),
        );
        rows.push(linhaResumo("  TOTAL DO GRUPO", "", "", dinheiro(grupo.total)));
      });
      rows.push(linhaResumo(`TOTAL DA REGIAO: ${regiao.local}`, "", "", dinheiro(regiao.total)));
    });
  } else if (raiz.tipo === "coordenador") {
    if (incluirRaiz) {
      rows.push(criarLinha("COORDENADOR", raiz));
    }
    cabosDiretos
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
      .forEach((cabo) => rows.push(criarLinha("  CABO DIRETO", cabo)));
  }
  if (!todasRegioes) {
    lideresVisiveis.forEach((lider) => {
      if (idsSelecionados.has(lider.id)) {
        rows.push(criarLinha("LIDER", lider));
      }
      (cabosPorLider.get(lider.id) || []).forEach((cabo) => rows.push(criarLinha("CABO", cabo)));
    });
  }
  if (!rows.length) {
    throw new Error("Esta raiz nao possui contratos com valor para pagamento.");
  }

  const drawHeader = () => {
    doc.setFillColor(15, 52, 120);
    doc.rect(0, 0, width, 76, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    const titulo = "EQUIPE";
    doc.text(titulo, margin, 31);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.text(
      todasRegioes
        ? filtros.incluirInterior
          ? "Todos os contratados - Campo Grande e Interior"
          : "Todos os contratados - Campo Grande"
        : `${raiz.tipo === "coordenador" ? "Coordenador" : "Lider"}: ${raiz.nome}`,
      margin,
      51,
    );
    doc.text(`Gerado em ${new Date().toLocaleDateString("pt-BR")}`, width - margin, 51, {
      align: "right",
    });
  };
  drawHeader();

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(
    todasRegioes
      ? filtros.incluirInterior
        ? "Abrangencia: Campo Grande e Interior"
        : "Abrangencia: somente Campo Grande"
      : `Local: ${raiz.cidade || raiz.regiao || "Nao informado"}`,
    margin,
    103,
  );
  doc.text(`Contratados: ${contratados.length}`, margin, 124);
  if (exibirValor) {
    doc.setTextColor(5, 120, 70);
    doc.text(`TOTAL PARA PAGAMENTO: ${dinheiro(total)}`, width - margin, 124, { align: "right" });
  }

  const cabecalho = todasRegioes
    ? [
        "GRUPO",
        "QTD.",
        "VALOR / FAIXA",
        ...(exibirValor ? ["SUBTOTAL"] : []),
        ...(incluirAssinatura ? ["ASSINATURA"] : []),
      ]
    : [
        "NIVEL",
        "NOME",
        "TELEFONE",
        ...(exibirValor ? ["VALOR"] : []),
        ...(incluirAssinatura ? ["ASSINATURA"] : []),
      ];
  const columnStyles: Record<number, Record<string, unknown>> = todasRegioes
    ? incluirAssinatura
      ? exibirValor
        ? {
            0: { cellWidth: 185, fontStyle: "bold" },
            1: { cellWidth: 45, halign: "center" },
            2: { cellWidth: 135 },
            3: { cellWidth: 84, halign: "right", fontStyle: "bold" },
            4: { cellWidth: 70 },
          }
        : {
            0: { cellWidth: 220, fontStyle: "bold" },
            1: { cellWidth: 50, halign: "center" },
            2: { cellWidth: 169 },
            3: { cellWidth: 80 },
          }
      : exibirValor
        ? {
            0: { cellWidth: 220, fontStyle: "bold" },
            1: { cellWidth: 50, halign: "center" },
            2: { cellWidth: 149 },
            3: { cellWidth: 100, halign: "right", fontStyle: "bold" },
          }
        : {
            0: { cellWidth: 250, fontStyle: "bold" },
            1: { cellWidth: 60, halign: "center" },
            2: { cellWidth: 209 },
          }
    : incluirAssinatura
      ? exibirValor
        ? {
            0: { cellWidth: 70, fontStyle: "bold" },
            1: { cellWidth: 150 },
            2: { cellWidth: 90 },
            3: { cellWidth: 75, halign: "right", fontStyle: "bold" },
            4: { cellWidth: 134 },
          }
        : {
            0: { cellWidth: 80, fontStyle: "bold" },
            1: { cellWidth: 170 },
            2: { cellWidth: 100 },
            3: { cellWidth: 169 },
          }
      : exibirValor
        ? {
            0: { cellWidth: 80, fontStyle: "bold" },
            1: { cellWidth: 239 },
            2: { cellWidth: 100 },
            3: { cellWidth: 100, halign: "right", fontStyle: "bold" },
          }
        : {
            0: { cellWidth: 90, fontStyle: "bold" },
            1: { cellWidth: 309 },
            2: { cellWidth: 120 },
          };

  autoTable(doc, {
    startY: 146,
    margin: { top: 95, left: margin, right: margin, bottom: 38 },
    head: [cabecalho],
    body: rows,
    theme: "grid",
    showHead: "everyPage",
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      cellPadding: 5,
      lineColor: [203, 213, 225],
      lineWidth: 0.5,
      valign: "middle",
      ...(incluirAssinatura ? { minCellHeight: 39 } : {}),
    },
    headStyles: { fillColor: [226, 232, 240], textColor: [15, 23, 42], fontStyle: "bold" },
    columnStyles,
    didParseCell: (data: any) => {
      const nivel = String(data.row.raw?.[0] || "").trim();
      if (data.section === "body" && nivel.startsWith("REGIAO:")) {
        data.cell.styles.fillColor = [15, 52, 120];
        data.cell.styles.textColor = [255, 255, 255];
        data.cell.styles.fontStyle = "bold";
      } else if (
        data.section === "body" &&
        (nivel === "COORDENADOR" || nivel.startsWith("COORDENADOR:"))
      ) {
        data.cell.styles.fillColor = [226, 232, 240];
        data.cell.styles.textColor = [15, 52, 120];
        data.cell.styles.fontStyle = "bold";
      } else if (
        data.section === "body" &&
        (nivel === "LIDER" || nivel === "LIDER AVULSO" || nivel.startsWith("LIDER AVULSO:"))
      ) {
        data.cell.styles.fillColor = [219, 234, 254];
        data.cell.styles.textColor = [30, 64, 175];
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.lineColor = [147, 197, 253];
      } else if (data.section === "body" && nivel.includes("TOTAL")) {
        data.cell.styles.fillColor = [240, 253, 244];
        data.cell.styles.textColor = [5, 120, 70];
        data.cell.styles.fontStyle = "bold";
      }
    },
    didDrawPage: (data: any) => {
      if (data.pageNumber > 1) drawHeader();
      doc.setTextColor(100, 116, 139);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(`Pagina ${data.pageNumber}`, width - margin, height - 18, { align: "right" });
    },
  });

  if (exibirValor) {
    const finalY = (doc as any).lastAutoTable?.finalY || 146;
    let totalY = finalY + 14;
    if (totalY > height - 80) {
      doc.addPage("a4", "portrait");
      drawHeader();
      totalY = 105;
    }
    doc.setFillColor(240, 253, 244);
    doc.roundedRect(width - margin - 235, totalY, 235, 42, 4, 4, "F");
    doc.setTextColor(5, 120, 70);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(`TOTAL: ${dinheiro(total)}`, width - margin - 12, totalY + 26, { align: "right" });
  }

  const prefixo = raiz.tipo === "coordenador" ? "Raiz Pagamento" : "Pagamento Lider";
  const nome = todasRegioes
    ? filtros.incluirInterior
      ? "Pagamento - Campo Grande e Interior"
      : "Pagamento - Campo Grande"
    : `${prefixo} - ${raiz.nome}`;
  doc.save(`${slug(nome)}.pdf`);
  return { total, contratados: contratados.length, membros: membros.length };
}
