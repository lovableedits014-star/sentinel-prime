import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface ExportPessoa {
  id?: string;
  parent_id?: string | null;
  nome: string;
  tipo: "coordenador" | "lider" | "cabo";
  telefone: string;
  regiao?: string | null;
  cidade?: string | null;
  bairro?: string | null;
  rua?: string | null;
  numero?: string | null;
  email?: string | null;
  observacoes?: string | null;
  valor_contratacao?: number | null;
  parent_nome?: string | null;
}

const TIPO_LABEL: Record<string, string> = {
  coordenador: "Coordenador",
  lider: "Líder",
  cabo: "Cabo Eleitoral",
};

const fmtBRL = (n?: number | null) =>
  (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtPhone = (s: string) => {
  const d = (s || "").replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return s || "";
};

const cap = (s?: string | null) =>
  (s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const enderecoOf = (p: ExportPessoa) => {
  const linha = [p.rua, p.numero].filter(Boolean).join(", ");
  const bairro = p.bairro ? ` — ${p.bairro}` : "";
  return (linha + bairro).trim() || "—";
};

export interface ExportOptions {
  clientName?: string;
  escopoLabel: string;
  pessoas: ExportPessoa[];
  filtros?: { label: string; value: string }[];
}

export function exportEleicaoPdf(opts: ExportOptions) {
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 36;
  let y = margin;

  // Header band
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 70, "F");
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Cadastros da Eleição", margin, 32);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(opts.escopoLabel, margin, 50);
  const stamp = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  doc.text(`Gerado em ${stamp}`, pageWidth - margin, 50, { align: "right" });
  if (opts.clientName) {
    doc.text(opts.clientName, pageWidth - margin, 32, { align: "right" });
  }
  y = 90;
  doc.setTextColor(0);

  // Stats
  const total = opts.pessoas.length;
  const coord = opts.pessoas.filter((p) => p.tipo === "coordenador").length;
  const lider = opts.pessoas.filter((p) => p.tipo === "lider").length;
  const cabo = opts.pessoas.filter((p) => p.tipo === "cabo").length;
  const valorTotal = opts.pessoas.reduce((s, p) => s + (p.valor_contratacao || 0), 0);

  const cards = [
    { label: "Total", value: String(total), tone: [241, 245, 249] },
    { label: "Coordenadores", value: String(coord), tone: [254, 226, 226] },
    { label: "Líderes", value: String(lider), tone: [219, 234, 254] },
    { label: "Cabos", value: String(cabo), tone: [220, 252, 231] },
    { label: "Investimento", value: fmtBRL(valorTotal), tone: [209, 250, 229] },
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

  // Filtros
  if (opts.filtros && opts.filtros.length > 0) {
    doc.setFontSize(9);
    doc.setTextColor(100);
    const txt = opts.filtros.map((f) => `${f.label}: ${f.value}`).join("   •   ");
    doc.text(txt, margin, y);
    y += 14;
    doc.setTextColor(0);
  }

  // Agrupar por tipo, depois região/cidade
  const tiposOrdem: Array<ExportPessoa["tipo"]> = ["coordenador", "lider", "cabo"];
  for (const tipo of tiposOrdem) {
    const grupo = opts.pessoas.filter((p) => p.tipo === tipo);
    if (grupo.length === 0) continue;

    if (y > pageHeight - 120) {
      doc.addPage();
      y = margin;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text(`${TIPO_LABEL[tipo]}s`, margin, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`${grupo.length} cadastro(s)`, pageWidth - margin, y, { align: "right" });
    y += 6;
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(1);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;
    doc.setTextColor(0);

    const sorted = [...grupo].sort((a, b) => {
      const ra = (a.cidade || a.regiao || "").toLowerCase();
      const rb = (b.cidade || b.regiao || "").toLowerCase();
      if (ra !== rb) return ra.localeCompare(rb);
      return (a.nome || "").localeCompare(b.nome || "");
    });

    const rows = sorted.map((p) => [
      p.nome,
      fmtPhone(p.telefone),
      cap(p.cidade || p.regiao),
      enderecoOf(p),
      p.parent_nome || (p.tipo === "lider" ? "— AVULSO —" : "—"),
      p.valor_contratacao && p.valor_contratacao > 0 ? fmtBRL(p.valor_contratacao) : "—",
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Nome", "Telefone", "Região/Cidade", "Endereço", "Vinculado a", "Valor"]],
      body: rows,
      theme: "striped",
      styles: { fontSize: 9, cellPadding: 5, valign: "middle" },
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: 255,
        fontStyle: "bold",
        fontSize: 9,
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 110 },
        1: { cellWidth: 80 },
        2: { cellWidth: 75 },
        3: { cellWidth: 130 },
        4: { cellWidth: 80 },
        5: { halign: "right", cellWidth: 50 },
      },
      margin: { left: margin, right: margin },
      didDrawPage: () => {
        // header reduzido nas demais páginas
      },
    });
    y = (doc as any).lastAutoTable.finalY + 18;
  }

  // Rodapé com paginação
  const pageCount = doc.getNumberOfPages();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(140);
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.text(
      `Sentinelle • Cadastros da Eleição • Página ${i} de ${pageCount}`,
      pageWidth / 2,
      pageHeight - 14,
      { align: "center" },
    );
  }

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);
  const escopoSlug = opts.escopoLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  doc.save(`cadastros-eleicao-${escopoSlug}-${ts}.pdf`);
}

export function exportEleicaoCsv(opts: ExportOptions) {
  const headers = [
    "Tipo",
    "Nome",
    "Telefone",
    "Região",
    "Cidade",
    "Bairro",
    "Rua",
    "Número",
    "Email",
    "Vinculado a",
    "Valor (R$)",
    "Observações",
  ];
  const escapeCsv = (v: any) => {
    const s = v == null ? "" : String(v);
    return /[";,\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(";")];
  for (const p of opts.pessoas) {
    lines.push(
      [
        TIPO_LABEL[p.tipo] || p.tipo,
        p.nome,
        fmtPhone(p.telefone),
        cap(p.regiao),
        p.cidade || "",
        p.bairro || "",
        p.rua || "",
        p.numero || "",
        p.email || "",
        p.parent_nome || (p.tipo === "lider" ? "AVULSO" : ""),
        (p.valor_contratacao || 0).toFixed(2).replace(".", ","),
        (p.observacoes || "").replace(/\n/g, " "),
      ]
        .map(escapeCsv)
        .join(";"),
    );
  }
  const csv = "\uFEFF" + lines.join("\n"); // BOM p/ Excel
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);
  const escopoSlug = opts.escopoLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  a.download = `cadastros-eleicao-${escopoSlug}-${ts}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
