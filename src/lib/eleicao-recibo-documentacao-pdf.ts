export type ReciboDocumentacaoPessoa = {
  id: string;
  tipo: "coordenador" | "lider" | "cabo";
  nome: string;
  telefone?: string | null;
  cidade?: string | null;
  regiao?: string | null;
  parent_id?: string | null;
  valor_contratacao?: number | null;
  is_voluntario?: boolean | null;
  arquivado_em?: string | null;
};

const slug = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");

const contratado = (pessoa: ReciboDocumentacaoPessoa) =>
  !pessoa.arquivado_em && !pessoa.is_voluntario && Number(pessoa.valor_contratacao || 0) > 0;

const telefone = (value?: string | null) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return value || "-";
};

export async function gerarReciboDocumentacaoPdf(
  raiz: ReciboDocumentacaoPessoa,
  pessoas: ReciboDocumentacaoPessoa[],
) {
  if (raiz.tipo === "cabo") {
    throw new Error("A raiz de documentação deve ser um coordenador ou líder.");
  }

  const [pdfModule, tableModule] = await Promise.all([
    import("jspdf"), import("jspdf-autotable"),
  ]);
  const jsPDF = (pdfModule as any).jsPDF || (pdfModule as any).default?.jsPDF || (pdfModule as any).default;
  const autoTable = (tableModule as any).default?.default || (tableModule as any).default;
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 38;
  const ativos = pessoas.filter((p) => !p.arquivado_em);
  const lideres = raiz.tipo === "coordenador"
    ? ativos.filter((p) => p.tipo === "lider" && p.parent_id === raiz.id)
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
    : [raiz];
  const cabosDiretos = raiz.tipo === "coordenador"
    ? ativos.filter((p) => p.tipo === "cabo" && p.parent_id === raiz.id && contratado(p))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
    : [];
  const cabosPorLider = new Map(lideres.map((lider) => [
    lider.id,
    ativos.filter((p) => p.tipo === "cabo" && p.parent_id === lider.id && contratado(p))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
  ]));
  const lideresVisiveis = lideres.filter((lider) =>
    contratado(lider) || (cabosPorLider.get(lider.id)?.length || 0) > 0,
  );
  const contratados = [
    ...(contratado(raiz) ? [raiz] : []),
    ...cabosDiretos,
    ...lideresVisiveis.filter(contratado),
    ...lideresVisiveis.flatMap((lider) => cabosPorLider.get(lider.id) || []),
  ].filter((pessoa, index, lista) => lista.findIndex((item) => item.id === pessoa.id) === index);

  if (!contratados.length) {
    throw new Error("Esta raiz não possui pessoas contratadas para receber documentação.");
  }

  type Linha = [string, string, string, string];
  const rows: Linha[] = [];
  if (raiz.tipo === "coordenador" && contratado(raiz)) {
    rows.push(["COORDENADOR", raiz.nome, telefone(raiz.telefone), ""]);
  }
  cabosDiretos.forEach((cabo) =>
    rows.push(["  CABO DIRETO", cabo.nome, telefone(cabo.telefone), ""]));
  lideresVisiveis.forEach((lider) => {
    rows.push([
      raiz.tipo === "coordenador" ? "  LÍDER" : "LÍDER",
      lider.nome,
      telefone(lider.telefone),
      contratado(lider) ? "" : "SEM CONTRATO",
    ]);
    (cabosPorLider.get(lider.id) || []).forEach((cabo) =>
      rows.push([raiz.tipo === "coordenador" ? "    CABO" : "  CABO", cabo.nome, telefone(cabo.telefone), ""]));
  });

  const drawHeader = () => {
    doc.setFillColor(15, 52, 120);
    doc.rect(0, 0, width, 76, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.text("RAIZ DE DOCUMENTAÇÃO", margin, 31);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.text(`Responsável: ${raiz.nome}`, margin, 51);
    doc.text(`Gerado em ${new Date().toLocaleDateString("pt-BR")}`, width - margin, 51, { align: "right" });
  };
  drawHeader();

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`Local: ${raiz.cidade || raiz.regiao || "Não informado"}`, margin, 103);
  doc.text(`Contratados para assinatura: ${contratados.length}`, margin, 124);

  autoTable(doc, {
    startY: 146,
    margin: { top: 95, left: margin, right: margin, bottom: 38 },
    head: [["NÍVEL", "NOME", "TELEFONE", "ASSINATURA"]],
    body: rows,
    theme: "grid",
    showHead: "everyPage",
    styles: {
      font: "helvetica", fontSize: 8.5, cellPadding: 5,
      lineColor: [203, 213, 225], lineWidth: 0.5, valign: "middle", minCellHeight: 39,
    },
    headStyles: {
      fillColor: [226, 232, 240], textColor: [15, 23, 42],
      fontStyle: "bold", minCellHeight: 28,
    },
    columnStyles: {
      0: { cellWidth: 76, fontStyle: "bold" },
      1: { cellWidth: 154 },
      2: { cellWidth: 93 },
      3: { cellWidth: 196.25, textColor: [100, 116, 139], fontSize: 7.5, halign: "center" },
    },
    didParseCell: (data: any) => {
      if (data.section !== "body") return;
      const nivel = String(data.row.raw?.[0] || "").trim();
      if (nivel === "LÍDER") {
        data.cell.styles.fillColor = [219, 234, 254];
        data.cell.styles.textColor = [30, 64, 175];
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.lineColor = [147, 197, 253];
      }
      if (String(data.row.raw?.[3] || "") === "SEM CONTRATO") {
        data.cell.styles.minCellHeight = 28;
      }
    },
    didDrawPage: (data: any) => {
      if (data.pageNumber > 1) drawHeader();
      doc.setTextColor(100, 116, 139);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(`Página ${data.pageNumber}`, width - margin, height - 18, { align: "right" });
    },
  });

  const nome = raiz.tipo === "coordenador"
    ? `Raiz Documentacao - ${raiz.nome}`
    : `Documentacao Lider - ${raiz.nome}`;
  doc.save(`${slug(nome)}.pdf`);
  return { contratados: contratados.length, linhas: rows.length };
}
