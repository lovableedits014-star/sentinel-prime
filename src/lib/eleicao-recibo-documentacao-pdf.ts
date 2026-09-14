export type ReciboDocumentacaoPessoa = {
  id: string;
  nome: string;
};

const slug = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");

export async function gerarReciboDocumentacaoPdf(
  coordenador: ReciboDocumentacaoPessoa,
  lideres: ReciboDocumentacaoPessoa[],
) {
  const [{ default: jsPDF }, tableModule] = await Promise.all([
    import("jspdf"), import("jspdf-autotable"),
  ]);
  const autoTable = tableModule.default;
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
  const width = doc.internal.pageSize.getWidth();
  const margin = 42;

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("RECIBO DE DOCUMENTAÇÃO", width / 2, 48, { align: "center" });

  doc.setFontSize(11);
  doc.text("COORDENADOR", margin, 91);
  doc.text("ASSINATURA", width - margin - 190, 91);
  doc.setFont("helvetica", "normal");
  doc.text(coordenador.nome, margin, 116);
  doc.line(width - margin - 190, 119, width - margin, 119);

  autoTable(doc, {
    startY: 151,
    margin: { left: margin, right: margin },
    head: [["NOME DO LÍDER", "ASSINATURA"]],
    body: lideres.map((lider) => [lider.nome, ""]),
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 10,
      lineColor: [100, 116, 139],
      lineWidth: 0.7,
      valign: "middle",
    },
    headStyles: {
      fillColor: [226, 232, 240],
      textColor: [15, 23, 42],
      fontStyle: "bold",
      minCellHeight: 28,
    },
    bodyStyles: { minCellHeight: 48 },
    columnStyles: {
      0: { cellWidth: 245 },
      1: { cellWidth: "auto" },
    },
  });

  doc.save(`${slug(`Recibo de Documentacao - ${coordenador.nome}`)}.pdf`);
}
