export type PessoaRaizPagamento = {
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

const dinheiro = (value: number) => value.toLocaleString("pt-BR", {
  style: "currency", currency: "BRL",
});

const contratado = (pessoa: PessoaRaizPagamento) =>
  !pessoa.arquivado_em && !pessoa.is_voluntario && Number(pessoa.valor_contratacao || 0) > 0;

const telefone = (value?: string | null) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return value || "-";
};

export async function gerarRaizPagamentoPdf(
  raiz: PessoaRaizPagamento,
  pessoas: PessoaRaizPagamento[],
) {
  if (raiz.tipo === "cabo") throw new Error("A raiz para pagamento deve ser um coordenador ou lider.");

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
    ? ativos.filter((p) => p.tipo === "cabo" && p.parent_id === raiz.id)
    : [];
  const cabosPorLider = new Map(lideres.map((lider) => [
    lider.id,
    ativos.filter((p) => p.tipo === "cabo" && p.parent_id === lider.id)
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
  ]));
  const membros = raiz.tipo === "coordenador"
    ? [raiz, ...lideres, ...cabosDiretos, ...lideres.flatMap((l) => cabosPorLider.get(l.id) || [])]
    : [raiz, ...(cabosPorLider.get(raiz.id) || [])];
  const contratados = membros.filter(contratado);
  const total = contratados.reduce((sum, pessoa) => sum + Number(pessoa.valor_contratacao || 0), 0);
  const rows: Array<Array<string>> = [];

  if (raiz.tipo === "coordenador") {
    rows.push(["COORDENADOR", raiz.nome, telefone(raiz.telefone), contratado(raiz) ? dinheiro(Number(raiz.valor_contratacao)) : "Sem contrato"]);
    cabosDiretos.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")).forEach((cabo) =>
      rows.push(["  CABO DIRETO", cabo.nome, telefone(cabo.telefone), contratado(cabo) ? dinheiro(Number(cabo.valor_contratacao)) : "Sem contrato"]));
  }
  lideres.forEach((lider) => {
    rows.push([raiz.tipo === "coordenador" ? "  LIDER" : "LIDER", lider.nome, telefone(lider.telefone), contratado(lider) ? dinheiro(Number(lider.valor_contratacao)) : "Sem contrato"]);
    (cabosPorLider.get(lider.id) || []).forEach((cabo) =>
      rows.push([raiz.tipo === "coordenador" ? "    CABO" : "  CABO", cabo.nome, telefone(cabo.telefone), contratado(cabo) ? dinheiro(Number(cabo.valor_contratacao)) : "Sem contrato"]));
  });

  const drawHeader = () => {
    doc.setFillColor(15, 52, 120);
    doc.rect(0, 0, width, 76, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.text("RAIZ PARA PAGAMENTO", margin, 31);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.text(`Responsavel: ${raiz.nome}`, margin, 51);
    doc.text(`Gerado em ${new Date().toLocaleDateString("pt-BR")}`, width - margin, 51, { align: "right" });
  };
  drawHeader();

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`Local: ${raiz.cidade || raiz.regiao || "Nao informado"}`, margin, 103);
  doc.text(`Contratados: ${contratados.length}`, margin, 124);
  doc.setTextColor(5, 120, 70);
  doc.text(`TOTAL PARA PAGAMENTO: ${dinheiro(total)}`, width - margin, 124, { align: "right" });

  autoTable(doc, {
    startY: 146,
    margin: { top: 95, left: margin, right: margin, bottom: 38 },
    head: [["NIVEL", "NOME", "TELEFONE", "VALOR"]],
    body: rows,
    theme: "grid",
    showHead: "everyPage",
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 5, lineColor: [203, 213, 225], lineWidth: 0.5, valign: "middle" },
    headStyles: { fillColor: [226, 232, 240], textColor: [15, 23, 42], fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 88, fontStyle: "bold" },
      1: { cellWidth: 207 },
      2: { cellWidth: 102 },
      3: { cellWidth: 110, halign: "right", fontStyle: "bold" },
    },
    didParseCell: (data: any) => {
      if (data.section === "body" && data.column.index === 3 && data.cell.raw === "Sem contrato") {
        data.cell.styles.textColor = [180, 83, 9];
        data.cell.styles.fontStyle = "normal";
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

  const nome = raiz.tipo === "coordenador" ? `Raiz Pagamento - ${raiz.nome}` : `Pagamento Lider - ${raiz.nome}`;
  doc.save(`${slug(nome)}.pdf`);
  return { total, contratados: contratados.length, membros: membros.length };
}
