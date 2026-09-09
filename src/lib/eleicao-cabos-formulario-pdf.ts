export type LiderFormularioCabos = {
  id: string;
  nome: string;
  telefone: string;
  regiao: string | null;
  cidade: string | null;
  coordenador_nome?: string | null;
};

const slug = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");

const localLabel = (lider: LiderFormularioCabos) => lider.cidade || lider.regiao || "Nao informado";

export async function gerarFormularioCabosPdf(lideres: LiderFormularioCabos[], nomeArquivo?: string) {
  if (!lideres.length) throw new Error("Nenhum lider disponivel para gerar o formulario.");
  const [{ default: jsPDF }, tableModule] = await Promise.all([
    import("jspdf"), import("jspdf-autotable"),
  ]);
  const autoTable = tableModule.default;
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 38;

  lideres.forEach((lider, index) => {
    if (index > 0) doc.addPage("a4", "landscape");
    doc.setFillColor(15, 52, 120);
    doc.rect(0, 0, width, 72, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("FORMULARIO DE CADASTRO DE CABOS ELEITORAIS", margin, 31);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("Preenchimento manual - limite de 4 cabos eleitorais por lider", margin, 51);

    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(`Lider: ${lider.nome}`, margin, 101);
    doc.text(`Telefone: ${lider.telefone || "Nao informado"}`, margin, 122);
    doc.text(`Coordenador: ${lider.coordenador_nome || "Nao vinculado"}`, width / 2, 101);
    doc.text(`Regiao/Cidade: ${localLabel(lider)}`, width / 2, 122);

    autoTable(doc, {
      startY: 151,
      margin: { left: margin, right: margin },
      head: [["No", "NOME COMPLETO", "TELEFONE", "CPF", "ASSINATURA"]],
      body: Array.from({ length: 4 }, (_, row) => [String(row + 1), "", "", "", ""]),
      theme: "grid",
      styles: { font: "helvetica", fontSize: 10, lineColor: [71, 85, 105], lineWidth: 0.8, valign: "middle" },
      headStyles: { fillColor: [226, 232, 240], textColor: [15, 23, 42], fontStyle: "bold", halign: "center", minCellHeight: 30 },
      bodyStyles: { minCellHeight: 62 },
      columnStyles: {
        0: { cellWidth: 34, halign: "center" },
        1: { cellWidth: 225 },
        2: { cellWidth: 125 },
        3: { cellWidth: 125 },
        4: { cellWidth: "auto" },
      },
    });

    const footerY = height - 52;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Data da entrega: ____/____/________", margin, footerY);
    doc.text("Recebido/conferido por: ______________________________________________", width / 2, footerY);
    doc.setTextColor(100, 116, 139);
    doc.text(`Formulario ${index + 1} de ${lideres.length}`, width - margin, height - 20, { align: "right" });
  });

  const base = nomeArquivo || (lideres.length === 1
    ? `Formulario Cabos - ${lideres[0].nome}`
    : "Formularios de Cabos - Lideres");
  doc.save(`${slug(base)}.pdf`);
}
