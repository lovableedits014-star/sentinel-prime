export type PessoaRaizPagamento = {
  id: string;
  tipo: "coordenador" | "lider" | "cabo";
  nome: string;
  telefone?: string | null;
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

const telefone = (value?: string | null) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return value || "-";
};

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
    const selecionados = new Set(contratados.map((pessoa) => pessoa.id));
    const ativosPorId = new Map(ativos.map((pessoa) => [pessoa.id, pessoa]));
    const localDaPessoa = (pessoa: PessoaRaizPagamento) => {
      let atual: PessoaRaizPagamento | undefined = pessoa;
      let local = pessoa.cidade || pessoa.regiao || "Nao informado";
      const visitados = new Set<string>();
      while (atual?.parent_id && !visitados.has(atual.parent_id)) {
        visitados.add(atual.parent_id);
        atual = ativosPorId.get(atual.parent_id);
        if (atual) local = atual.cidade || atual.regiao || local;
      }
      return local;
    };
    const locais = Array.from(new Set(contratados.map(localDaPessoa))).sort((a, b) =>
      a.localeCompare(b, "pt-BR"),
    );
    const noLocal = (pessoa: PessoaRaizPagamento, local: string) => localDaPessoa(pessoa) === local;
    const ordenarNome = (a: PessoaRaizPagamento, b: PessoaRaizPagamento) =>
      a.nome.localeCompare(b.nome, "pt-BR");
    const linhaRegiao = (local: string) => [
      `REGIAO: ${local}`,
      "",
      "",
      ...(exibirValor ? [""] : []),
      ...(incluirAssinatura ? [""] : []),
    ];
    const linhaGrupo = (nivel: string, nome: string) => [
      nivel,
      nome,
      "-",
      ...(exibirValor ? [""] : []),
      ...(incluirAssinatura ? [""] : []),
    ];

    locais.forEach((local) => {
      const pessoasLocal = ativos.filter((pessoa) => noLocal(pessoa, local));
      const coords = pessoasLocal
        .filter((pessoa) => pessoa.tipo === "coordenador")
        .sort(ordenarNome);
      const idsCoords = new Set(coords.map((pessoa) => pessoa.id));
      const lideresOrfaos = pessoasLocal
        .filter(
          (pessoa) =>
            pessoa.tipo === "lider" && (!pessoa.parent_id || !idsCoords.has(pessoa.parent_id)),
        )
        .sort(ordenarNome);

      rows.push(linhaRegiao(local));
      coords.forEach((coord) => {
        const lideresCoord = pessoasLocal
          .filter((pessoa) => pessoa.tipo === "lider" && pessoa.parent_id === coord.id)
          .sort(ordenarNome);
        const idsLideres = new Set(lideresCoord.map((pessoa) => pessoa.id));
        const cabosDiretosCoord = pessoasLocal
          .filter((pessoa) => pessoa.tipo === "cabo" && pessoa.parent_id === coord.id)
          .sort(ordenarNome);
        const possuiSelecionado =
          selecionados.has(coord.id) ||
          lideresCoord.some((lider) => selecionados.has(lider.id)) ||
          cabosDiretosCoord.some((cabo) => selecionados.has(cabo.id)) ||
          pessoasLocal.some(
            (pessoa) =>
              pessoa.tipo === "cabo" &&
              !!pessoa.parent_id &&
              idsLideres.has(pessoa.parent_id) &&
              selecionados.has(pessoa.id),
          );
        if (!possuiSelecionado) return;
        rows.push(
          selecionados.has(coord.id)
            ? criarLinha("COORDENADOR", coord)
            : linhaGrupo("COORDENADOR", coord.nome),
        );
        cabosDiretosCoord
          .filter((cabo) => selecionados.has(cabo.id))
          .forEach((cabo) => rows.push(criarLinha("  CABO DIRETO", cabo)));
        lideresCoord.forEach((lider) => {
          const cabosLider = pessoasLocal
            .filter((pessoa) => pessoa.tipo === "cabo" && pessoa.parent_id === lider.id)
            .sort(ordenarNome);
          if (selecionados.has(lider.id)) rows.push(criarLinha("  LIDER", lider));
          else if (cabosLider.some((cabo) => selecionados.has(cabo.id))) {
            rows.push(linhaGrupo("  LIDER", lider.nome));
          }
          cabosLider
            .filter((cabo) => selecionados.has(cabo.id))
            .forEach((cabo) => rows.push(criarLinha("    CABO", cabo)));
        });
      });

      lideresOrfaos.forEach((lider) => {
        const cabos = pessoasLocal
          .filter((pessoa) => pessoa.tipo === "cabo" && pessoa.parent_id === lider.id)
          .sort(ordenarNome);
        if (selecionados.has(lider.id)) rows.push(criarLinha("LIDER AVULSO", lider));
        else if (cabos.some((cabo) => selecionados.has(cabo.id))) {
          rows.push(linhaGrupo("LIDER AVULSO", lider.nome));
        }
        cabos
          .filter((cabo) => selecionados.has(cabo.id))
          .forEach((cabo) => rows.push(criarLinha("  CABO", cabo)));
      });

      pessoasLocal
        .filter(
          (pessoa) =>
            pessoa.tipo === "cabo" &&
            selecionados.has(pessoa.id) &&
            (!pessoa.parent_id || !pessoasLocal.some((item) => item.id === pessoa.parent_id)),
        )
        .sort(ordenarNome)
        .forEach((cabo) => rows.push(criarLinha("CABO SEM RESPONSAVEL", cabo)));
    });
  } else if (raiz.tipo === "coordenador") {
    if (incluirRaiz) {
      rows.push(criarLinha("COORDENADOR", raiz));
    }
    cabosDiretos
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
      .forEach((cabo) => rows.push(criarLinha("  CABO DIRETO", cabo)));
  }
  lideresVisiveis.forEach((lider) => {
    if (idsSelecionados.has(lider.id)) {
      rows.push(criarLinha("LIDER", lider));
    }
    (cabosPorLider.get(lider.id) || []).forEach((cabo) => rows.push(criarLinha("CABO", cabo)));
  });
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

  const cabecalho = [
    "NIVEL",
    "NOME",
    "TELEFONE",
    ...(exibirValor ? ["VALOR"] : []),
    ...(incluirAssinatura ? ["ASSINATURA"] : []),
  ];
  const columnStyles: Record<number, Record<string, unknown>> = incluirAssinatura
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
      } else if (data.section === "body" && nivel === "COORDENADOR") {
        data.cell.styles.fillColor = [226, 232, 240];
        data.cell.styles.textColor = [15, 52, 120];
        data.cell.styles.fontStyle = "bold";
      } else if (data.section === "body" && (nivel === "LIDER" || nivel === "LIDER AVULSO")) {
        data.cell.styles.fillColor = [219, 234, 254];
        data.cell.styles.textColor = [30, 64, 175];
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.lineColor = [147, 197, 253];
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
