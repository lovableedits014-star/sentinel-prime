export type CoordinatorMissionPdfRow = {
  coordenador_nome: string;
  total_lideres: number;
  concluidos: number;
  abriu_sem_concluir: number;
  nao_abriu: number;
  taxa: number;
  concluidos_nomes: string[];
  abriu_nomes: string[];
  nao_abriu_nomes: string[];
};

const slug = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export async function exportCoordinatorMissionPdf(args: {
  missionTitle: string;
  publishedAt: string;
  teams: CoordinatorMissionPdfRow[];
  coordinatorName?: string;
}) {
  const [{ default: jsPDF }, tableModule] = await Promise.all([
    import("jspdf"), import("jspdf-autotable"),
  ]);
  const autoTable = tableModule.default;
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 38;
  const teams = [...args.teams].sort((a, b) => b.total_lideres - a.total_lideres || a.coordenador_nome.localeCompare(b.coordenador_nome));

  const header = (team: CoordinatorMissionPdfRow, index: number) => {
    if (index > 0) doc.addPage();
    doc.setFillColor(15, 52, 120);
    doc.rect(0, 0, width, 78, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.text("Desempenho da equipe", margin, 31);
    doc.setFontSize(12);
    doc.text(team.coordenador_nome, margin, 52);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(args.missionTitle.slice(0, 85), width - margin, 31, { align: "right" });
    doc.text(`Publicada em ${new Date(args.publishedAt).toLocaleString("pt-BR")}`, width - margin, 48, { align: "right" });
    doc.text(`Relatório gerado em ${new Date().toLocaleString("pt-BR")}`, width - margin, 63, { align: "right" });
  };

  teams.forEach((team, index) => {
    header(team, index);
    const pending = Number(team.abriu_sem_concluir) + Number(team.nao_abriu);
    const cards = [
      ["Contratados", team.total_lideres, [232, 240, 254]],
      ["Concluíram", team.concluidos, [220, 252, 231]],
      ["Abriram, não concluíram", team.abriu_sem_concluir, [254, 243, 199]],
      ["Não abriram", team.nao_abriu, [254, 226, 226]],
    ] as const;
    const gap = 8;
    const cardWidth = (width - margin * 2 - gap * 3) / 4;
    cards.forEach(([label, value, color], cardIndex) => {
      const x = margin + cardIndex * (cardWidth + gap);
      doc.setFillColor(...color);
      doc.roundedRect(x, 96, cardWidth, 52, 5, 5, "F");
      doc.setTextColor(71, 85, 105);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.text(label.toUpperCase(), x + 8, 111, { maxWidth: cardWidth - 16 });
      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text(String(value), x + 8, 138);
    });

    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(`Adesão: ${Number(team.taxa).toFixed(1)}%`, margin, 172);
    doc.setFillColor(226, 232, 240);
    doc.roundedRect(margin, 181, width - margin * 2, 9, 4, 4, "F");
    if (Number(team.taxa) > 0) {
      doc.setFillColor(22, 101, 216);
      doc.roundedRect(margin, 181, (width - margin * 2) * Math.min(100, Number(team.taxa)) / 100, 9, 4, 4, "F");
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(pending ? `${pending} contratado(s) ainda precisam de acompanhamento.` : "Equipe com 100% de conclusão.", margin, 210);

    autoTable(doc, {
      startY: 228,
      head: [["Situação", "Quantidade", "Integrantes"]],
      body: [
        ["Concluíram", team.concluidos, team.concluidos_nomes.join(", ") || "Nenhum"],
        ["Abriram, não concluíram", team.abriu_sem_concluir, team.abriu_nomes.join(", ") || "Nenhum"],
        ["Ainda não abriram", team.nao_abriu, team.nao_abriu_nomes.join(", ") || "Nenhum"],
      ],
      theme: "grid",
      margin: { left: margin, right: margin, bottom: 34 },
      styles: { fontSize: 9, cellPadding: 6, overflow: "linebreak", valign: "top" },
      headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: "bold" },
      columnStyles: { 0: { cellWidth: 125, fontStyle: "bold" }, 1: { cellWidth: 65, halign: "center" } },
      didDrawPage: () => {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text("Relatório interno - Engajamento", margin, height - 16);
        doc.text(`Página ${doc.getCurrentPageInfo().pageNumber}`, width - margin, height - 16, { align: "right" });
      },
    });
  });

  if (!teams.length) throw new Error("Nenhum coordenador disponível para exportação.");
  const suffix = args.coordinatorName ? slug(args.coordinatorName) : "todos-os-coordenadores";
  doc.save(`desempenho-equipes-${suffix}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
