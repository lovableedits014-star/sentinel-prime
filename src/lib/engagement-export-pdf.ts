import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { cargoLabel, type CobrancaRow } from "@/lib/engagement-team";

const SITUACAO_LABEL: Record<CobrancaRow["situacao"], string> = {
  em_dia: "Em dia",
  abaixo: "Abaixo da meta",
  zerado: "Sem interação",
  sem_cadastro: "Sem @ cadastrado",
};

const fmtPhone = (s: string | null) => {
  const d = (s || "").replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return s || "—";
};

const cap = (s?: string | null) =>
  (s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const regiaoOf = (r: CobrancaRow) => cap(r.regiao || r.cidade || "Sem região");

function outputPdf(doc: jsPDF, filename: string, mode: "save" | "print" = "save") {
  if (mode === "print") {
    try {
      const blob = doc.output("blob");
      const url = URL.createObjectURL(blob);
      const w = window.open(url, "_blank");
      if (w) {
        setTimeout(() => {
          try {
            w.focus();
            w.print();
          } catch {
            /* ignore */
          }
        }, 600);
      } else {
        doc.save(filename);
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return;
    } catch {
      doc.save(filename);
    }
    return;
  }
  doc.save(filename);
}

function slugify(s: string) {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export interface CobrancaExportOptions {
  clientName?: string;
  periodoLabel: string;
  filtros?: { label: string; value: string }[];
  rows: CobrancaRow[];
  mode?: "save" | "print";
  fileNameSuffix?: string;
}

/** Relatório de cobrança do time: agrupado por cargo, depois região (A-Z) e nome (A-Z). */
export function exportCobrancaPdf(opts: CobrancaExportOptions) {
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 36;
  let y = margin;

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 70, "F");
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Cobrança do Time — Engajamento", margin, 32);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(opts.periodoLabel, margin, 50);
  const stamp = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  doc.text(`Gerado em ${stamp}`, pageWidth - margin, 50, { align: "right" });
  if (opts.clientName) doc.text(opts.clientName, pageWidth - margin, 32, { align: "right" });
  y = 90;
  doc.setTextColor(0);

  const total = opts.rows.length;
  const emDia = opts.rows.filter((r) => r.situacao === "em_dia").length;
  const abaixo = opts.rows.filter((r) => r.situacao === "abaixo").length;
  const zerado = opts.rows.filter((r) => r.situacao === "zerado").length;
  const semCad = opts.rows.filter((r) => r.situacao === "sem_cadastro").length;

  const cards = [
    { label: "Total", value: String(total), tone: [241, 245, 249] },
    { label: "Em dia", value: String(emDia), tone: [220, 252, 231] },
    { label: "Abaixo da meta", value: String(abaixo), tone: [254, 243, 199] },
    { label: "Sem interação", value: String(zerado), tone: [254, 226, 226] },
    { label: "Sem @", value: String(semCad), tone: [226, 232, 240] },
  ];
  const cardW = (pageWidth - margin * 2 - 8 * 4) / 5;
  const cardH = 50;
  cards.forEach((c, i) => {
    const x = margin + i * (cardW + 8);
    doc.setFillColor(c.tone[0], c.tone[1], c.tone[2]);
    doc.roundedRect(x, y, cardW, cardH, 6, 6, "F");
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(c.label.toUpperCase(), x + 8, y + 14);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(c.value, x + 8, y + 36);
    doc.setFont("helvetica", "normal");
  });
  y += cardH + 18;

  if (opts.filtros && opts.filtros.length > 0) {
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(opts.filtros.map((f) => `${f.label}: ${f.value}`).join("   •   "), margin, y);
    y += 14;
    doc.setTextColor(0);
  }

  // Agrupa por cargo (ordem alfabética do rótulo)
  const cargos = Array.from(new Set(opts.rows.map((r) => r.cargo))).sort((a, b) =>
    cargoLabel(a).localeCompare(cargoLabel(b)),
  );

  for (const cargo of cargos) {
    const grupo = opts.rows
      .filter((r) => r.cargo === cargo)
      .sort((a, b) => {
        const ra = regiaoOf(a).toLowerCase();
        const rb = regiaoOf(b).toLowerCase();
        if (ra !== rb) return ra.localeCompare(rb);
        return (a.nome || "").localeCompare(b.nome || "");
      });
    if (grupo.length === 0) continue;

    if (y > pageHeight - 130) {
      doc.addPage();
      y = margin;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text(`${cargoLabel(cargo)}`, margin, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100);
    const meta = grupo[0];
    doc.text(
      `${grupo.length} pessoa(s) · meta: ${meta.min_interacoes} interações e ${meta.min_missoes} missão(ões)`,
      pageWidth - margin,
      y,
      { align: "right" },
    );
    y += 6;
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(1);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;
    doc.setTextColor(0);

    const rows = grupo.map((r) => [
      regiaoOf(r),
      r.nome,
      fmtPhone(r.telefone),
      r.instagram_handle ? `@${r.instagram_handle}` : "—",
      r.facebook_key ? "sim" : "—",
      `${r.interacoes} (IG ${r.instagram_comments} · FB ${r.facebook_comments})`,
      `${r.missoes_concluidas}/${r.missoes_disponiveis || 0}`,
      r.last_interaction ? new Date(r.last_interaction).toLocaleDateString("pt-BR") : "—",
      SITUACAO_LABEL[r.situacao],
    ]);

    autoTable(doc, {
      startY: y,
      head: [[
        "Região",
        "Nome",
        "Telefone",
        "Instagram",
        "FB",
        "Interações",
        "Missões",
        "Última",
        "Situação",
      ]],
      body: rows,
      theme: "striped",
      styles: { fontSize: 9, cellPadding: 4, valign: "middle" },
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold", fontSize: 9 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 90 },
        1: { fontStyle: "bold", cellWidth: 140 },
        2: { cellWidth: 90 },
        3: { cellWidth: 100 },
        4: { cellWidth: 32, halign: "center" },
        5: { cellWidth: 120 },
        6: { cellWidth: 55, halign: "center" },
        7: { cellWidth: 60 },
        8: { cellWidth: 85 },
      },
      margin: { left: margin, right: margin },
    });
    y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY || y) + 18;
  }

  const pageCount = doc.getNumberOfPages();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(140);
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.text(`Página ${i} de ${pageCount}`, pageWidth - margin, pageHeight - 16, { align: "right" });
    doc.text("Relatório interno — Engajamento", margin, pageHeight - 16);
  }

  const name = `cobranca-time${opts.fileNameSuffix ? `-${slugify(opts.fileNameSuffix)}` : ""}-${new Date()
    .toISOString()
    .slice(0, 10)}.pdf`;
  outputPdf(doc, name, opts.mode);
}
