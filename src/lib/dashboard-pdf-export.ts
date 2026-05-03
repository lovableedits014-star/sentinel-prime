import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import html2canvas from "html2canvas";

export interface DashboardPdfData {
  clientName?: string;
  periodDays: number;
  generatedAt: Date;
  stats: {
    total: number;
    positive: number;
    neutral: number;
    negative: number;
    unanalyzed: number;
    posPercent: number;
    negPercent: number;
    neuPercent: number;
    respondedCount: number;
    pendingCount: number;
  };
  supportersCount: number;
  platform: { facebook: number; instagram: number };
  ied?: {
    score: number;
    sentiment: number;
    growth: number;
    engagement: number;
    checkin: number;
  } | null;
  highlights: string[];
  /** CSS selector for sections to capture as images (charts, etc.) */
  captureSelectors?: string[];
}

const formatDate = (d: Date) =>
  d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export async function exportDashboardPdf(data: DashboardPdfData) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  let cursorY = margin;

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Relatório do Dashboard", margin, cursorY);
  cursorY += 22;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(110);
  const subtitleParts = [
    data.clientName ? `Cliente: ${data.clientName}` : null,
    `Período: últimos ${data.periodDays} dias`,
    `Gerado em: ${formatDate(data.generatedAt)}`,
  ].filter(Boolean) as string[];
  doc.text(subtitleParts.join("  •  "), margin, cursorY);
  cursorY += 18;
  doc.setTextColor(0);

  // KPIs table
  autoTable(doc, {
    startY: cursorY,
    head: [["Indicador", "Valor"]],
    body: [
      ["Comentários no período", data.stats.total.toLocaleString("pt-BR")],
      ["Positivos", `${data.stats.positive} (${data.stats.posPercent}%)`],
      ["Neutros", `${data.stats.neutral} (${data.stats.neuPercent}%)`],
      ["Negativos", `${data.stats.negative} (${data.stats.negPercent}%)`],
      ["Sem classificação", String(data.stats.unanalyzed)],
      ["Respondidos", String(data.stats.respondedCount)],
      ["Pendentes", String(data.stats.pendingCount)],
      ["Apoiadores cadastrados", String(data.supportersCount)],
      ["Comentários no Facebook", String(data.platform.facebook)],
      ["Comentários no Instagram", String(data.platform.instagram)],
    ],
    theme: "striped",
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    styles: { fontSize: 10, cellPadding: 6 },
    margin: { left: margin, right: margin },
  });
  cursorY = (doc as any).lastAutoTable.finalY + 18;

  // IED block
  if (data.ied) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Índice de Eleitorabilidade Digital (IED)", margin, cursorY);
    cursorY += 14;
    autoTable(doc, {
      startY: cursorY,
      head: [["Componente", "Pontuação"]],
      body: [
        ["Score geral", `${data.ied.score} / 100`],
        ["Sentimento (30%)", String(data.ied.sentiment)],
        ["Crescimento (25%)", String(data.ied.growth)],
        ["Engajamento (25%)", String(data.ied.engagement)],
        ["Check-ins (20%)", String(data.ied.checkin)],
      ],
      theme: "grid",
      headStyles: { fillColor: [30, 41, 59], textColor: 255 },
      styles: { fontSize: 10, cellPadding: 6 },
      margin: { left: margin, right: margin },
    });
    cursorY = (doc as any).lastAutoTable.finalY + 18;
  }

  // Highlights / insights
  if (data.highlights.length > 0) {
    if (cursorY > pageHeight - 120) {
      doc.addPage();
      cursorY = margin;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Principais insights do período", margin, cursorY);
    cursorY += 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    for (const line of data.highlights) {
      const wrapped = doc.splitTextToSize(`• ${line}`, pageWidth - margin * 2);
      if (cursorY + wrapped.length * 13 > pageHeight - margin) {
        doc.addPage();
        cursorY = margin;
      }
      doc.text(wrapped, margin, cursorY);
      cursorY += wrapped.length * 13 + 4;
    }
    cursorY += 10;
  }

  // Capture chart sections as images
  if (data.captureSelectors && data.captureSelectors.length > 0) {
    for (const sel of data.captureSelectors) {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!el) continue;
      try {
        const canvas = await html2canvas(el, {
          backgroundColor: "#ffffff",
          scale: 2,
          useCORS: true,
          logging: false,
        });
        const imgData = canvas.toDataURL("image/png");
        const maxWidth = pageWidth - margin * 2;
        const ratio = canvas.height / canvas.width;
        const imgWidth = maxWidth;
        const imgHeight = imgWidth * ratio;

        if (cursorY + imgHeight > pageHeight - margin) {
          doc.addPage();
          cursorY = margin;
        }
        doc.addImage(imgData, "PNG", margin, cursorY, imgWidth, imgHeight);
        cursorY += imgHeight + 16;
      } catch (err) {
        console.warn("Falha ao capturar seção", sel, err);
      }
    }
  }

  // Footer page numbers
  const pageCount = doc.getNumberOfPages();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(140);
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.text(
      `Sentinelle • Página ${i} de ${pageCount}`,
      pageWidth / 2,
      pageHeight - 18,
      { align: "center" },
    );
  }

  const stamp = data.generatedAt
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 16);
  doc.save(`dashboard-${data.periodDays}d-${stamp}.pdf`);
}