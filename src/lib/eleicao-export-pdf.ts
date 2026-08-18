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
  participou_reuniao?: boolean;
  reuniao_em?: string | null;
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

// Ordena pessoas por região/cidade alfabética, depois por nome alfabético.
const sortByRegiaoNome = (a: ExportPessoa, b: ExportPessoa) => {
  // Em Campo Grande `regiao` guarda a região urbana (centro, moreninha...) e `cidade` = "Campo Grande".
  // No interior `regiao` é nulo e `cidade` é o município. Preferir região urbana quando existir.
  const ra = (a.regiao || a.cidade || "").toLowerCase();
  const rb = (b.regiao || b.cidade || "").toLowerCase();
  if (ra !== rb) return ra.localeCompare(rb);
  return (a.nome || "").localeCompare(b.nome || "");
};

export interface ExportOptions {
  clientName?: string;
  escopoLabel: string;
  pessoas: ExportPessoa[];
  filtros?: { label: string; value: string }[];
  fileNameSuffix?: string;
  mode?: "save" | "print";
  apenasAvulsos?: boolean;
  apenasReuniao?: boolean;
  apenasNaoReuniao?: boolean;
}

function outputPdf(doc: jsPDF, filename: string, mode: "save" | "print" = "save") {
  if (mode === "print") {
    try {
      const blob = doc.output("blob");
      const url = URL.createObjectURL(blob);
      const w = window.open(url, "_blank");
      if (w) {
        // Alguns navegadores requerem tempo para carregar o PDF antes do print
        setTimeout(() => {
          try { w.focus(); w.print(); } catch { /* ignore */ }
        }, 600);
      } else {
        // Popup bloqueado — cai para download
        doc.save(filename);
      }
      // Libera o object URL depois de um tempo (o viewer já leu o blob)
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
    let grupo = opts.pessoas.filter((p) => p.tipo === tipo);
    if (opts.apenasAvulsos && tipo === "lider") {
      grupo = grupo.filter(p => !p.parent_id);
    }
    if (opts.apenasReuniao) {
      grupo = grupo.filter(p => !!p.participou_reuniao);
    }
    if (opts.apenasNaoReuniao) {
      grupo = grupo.filter(p => !p.participou_reuniao);
    }
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

    const sorted = [...grupo].sort(sortByRegiaoNome);

    const rows = sorted.map((p) => [
      p.nome,
      fmtPhone(p.telefone),
      p.regiao ? cap(p.regiao) : (p.cidade || "—"),
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
  const escopoSlug = slugify(opts.escopoLabel);
  const suf = opts.fileNameSuffix ? `-${slugify(opts.fileNameSuffix)}` : "";
  outputPdf(doc, `cadastros-eleicao-${escopoSlug}${suf}-${ts}.pdf`, opts.mode);
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
  const sortedPessoas = [...opts.pessoas].sort(sortByRegiaoNome);
  const finalPessoas = opts.apenasAvulsos 
    ? sortedPessoas.filter(p => p.tipo === "lider" && !p.parent_id)
    : sortedPessoas;

  for (const p of finalPessoas) {
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
  const escopoSlug = slugify(opts.escopoLabel);
  const suf = opts.fileNameSuffix ? `-${slugify(opts.fileNameSuffix)}` : "";
  a.download = `cadastros-eleicao-${escopoSlug}${suf}-${ts}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Exportação RAIZ (hierárquica: Coordenador → Líderes → Cabos) ───

export interface RaizExportOptions {
  clientName?: string;
  escopoLabel: string;
  pessoas: ExportPessoa[]; // todas as pessoas do escopo (com id e parent_id)
  tipos?: Array<"coordenador" | "lider" | "cabo">;
  incluirAvulsos?: boolean;
  apenasAvulsos?: boolean;
  coordenadorFiltro?: { id: string; nome: string } | null;
  filtros?: { label: string; value: string }[];
  fileNameSuffix?: string;
  mode?: "save" | "print";
}

interface EquipeNode {
  coord: ExportPessoa | null; // null = grupo AVULSOS
  lideres: Array<{ lider: ExportPessoa; cabos: ExportPessoa[] }>;
  totalValor: number;
  qtdLideres: number;
  qtdCabos: number;
}

function montarEquipes(opts: RaizExportOptions): EquipeNode[] {
  const { pessoas, incluirAvulsos = true, apenasAvulsos = false, coordenadorFiltro, tipos } = opts;
  const byId = new Map<string, ExportPessoa>();
  for (const p of pessoas) if (p.id) byId.set(p.id, p);

  const filterTipo = (p: ExportPessoa) => !tipos || tipos.includes(p.tipo);
  const filterReuniao = (p: ExportPessoa) => {
    if (opts.apenasReuniao) return !!p.participou_reuniao;
    if (opts.apenasNaoReuniao) return !p.participou_reuniao;
    return true;
  };

  const coords = apenasAvulsos 
    ? [] 
    : pessoas.filter(p => p.tipo === "coordenador")
      .filter(c => !coordenadorFiltro || c.id === coordenadorFiltro.id)
      .filter(filterTipo)
      .filter(filterReuniao);
  const lideres = pessoas.filter(p => p.tipo === "lider").filter(filterTipo).filter(filterReuniao);
  const cabos = apenasAvulsos ? [] : pessoas.filter(p => p.tipo === "cabo").filter(filterTipo).filter(filterReuniao);

  const lideresPorCoord = new Map<string, ExportPessoa[]>();
  const avulsos: ExportPessoa[] = [];
  for (const l of lideres) {
    if (l.parent_id && byId.get(l.parent_id)?.tipo === "coordenador") {
      const arr = lideresPorCoord.get(l.parent_id) || [];
      arr.push(l); lideresPorCoord.set(l.parent_id, arr);
    } else {
      avulsos.push(l);
    }
  }
  const cabosPorLider = new Map<string, ExportPessoa[]>();
  for (const c of cabos) {
    if (c.parent_id) {
      const arr = cabosPorLider.get(c.parent_id) || [];
      arr.push(c); cabosPorLider.set(c.parent_id, arr);
    }
  }

  const nodes: EquipeNode[] = [];
  for (const coord of coords.sort(sortByRegiaoNome)) {
    const lids = (lideresPorCoord.get(coord.id || "") || []).sort(sortByRegiaoNome);
    const arr = lids.map(lider => ({
      lider,
      cabos: (cabosPorLider.get(lider.id || "") || []).sort(sortByRegiaoNome),
    }));
    const totalValor =
      (coord.valor_contratacao || 0) +
      arr.reduce((s, l) => s + (l.lider.valor_contratacao || 0) + l.cabos.reduce((ss, c) => ss + (c.valor_contratacao || 0), 0), 0);
    const qtdCabos = arr.reduce((s, l) => s + l.cabos.length, 0);
    nodes.push({ coord, lideres: arr, totalValor, qtdLideres: arr.length, qtdCabos });
  }

  if (incluirAvulsos && !coordenadorFiltro && avulsos.length > 0) {
    const arr = avulsos.sort(sortByRegiaoNome).map(lider => ({
      lider,
      cabos: (cabosPorLider.get(lider.id || "") || []).sort(sortByRegiaoNome),
    }));
    const totalValor = arr.reduce((s, l) => s + (l.lider.valor_contratacao || 0) + l.cabos.reduce((ss, c) => ss + (c.valor_contratacao || 0), 0), 0);
    const qtdCabos = arr.reduce((s, l) => s + l.cabos.length, 0);
    nodes.push({ coord: null, lideres: arr, totalValor, qtdLideres: arr.length, qtdCabos });
  }

  return nodes;
}

export function exportEleicaoPdfRaiz(opts: RaizExportOptions) {
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 36;
  let y = margin;

  // Header band
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 70, "F");
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Estrutura por Coordenador", margin, 32);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(opts.escopoLabel, margin, 50);
  const stamp = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  doc.text(`Gerado em ${stamp}`, pageWidth - margin, 50, { align: "right" });
  if (opts.clientName) doc.text(opts.clientName, pageWidth - margin, 32, { align: "right" });
  y = 90;
  doc.setTextColor(0);

  if (opts.filtros && opts.filtros.length > 0) {
    doc.setFontSize(9); doc.setTextColor(100);
    doc.text(opts.filtros.map(f => `${f.label}: ${f.value}`).join("   •   "), margin, y);
    y += 14; doc.setTextColor(0);
  }

  const equipes = montarEquipes(opts);
  if (equipes.length === 0) {
    doc.setFontSize(11); doc.text("Nenhuma equipe encontrada com os filtros aplicados.", margin, y);
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);
    outputPdf(doc, `eleicao-raiz-${ts}.pdf`, opts.mode); return;
  }

  // Totais gerais
  const totGeral = equipes.reduce((s, e) => s + e.totalValor, 0);
  const totLid = equipes.reduce((s, e) => s + e.qtdLideres, 0);
  const totCab = equipes.reduce((s, e) => s + e.qtdCabos, 0);
  const totCoord = equipes.filter(e => e.coord).length;
  doc.setFontSize(9); doc.setTextColor(71, 85, 105);
  doc.text(
    `${totCoord} coordenador(es) · ${totLid} líder(es) · ${totCab} cabo(s) · Total: ${fmtBRL(totGeral)}`,
    margin, y,
  );
  y += 14; doc.setTextColor(0);

  for (const eq of equipes) {
    if (y > pageHeight - 140) { doc.addPage(); y = margin; }

    // Header do bloco
    const isAvulso = !eq.coord;
    doc.setFillColor(isAvulso ? 250 : 30, isAvulso ? 204 : 41, isAvulso ? 21 : 59);
    doc.roundedRect(margin, y, pageWidth - margin * 2, 32, 4, 4, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(255);
    const tituloCoord = isAvulso
      ? "LÍDERES AVULSOS (sem coordenador)"
      : `${eq.coord!.nome}  —  ${eq.coord!.regiao ? cap(eq.coord!.regiao) : (eq.coord!.cidade || "—")}`;
    doc.text(tituloCoord, margin + 10, y + 13);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    const sub = isAvulso
      ? `${eq.qtdLideres} líder(es) · ${eq.qtdCabos} cabo(s) · Total ${fmtBRL(eq.totalValor)}`
      : `${fmtPhone(eq.coord!.telefone)} · ${eq.qtdLideres} líder(es) · ${eq.qtdCabos} cabo(s) · Total equipe ${fmtBRL(eq.totalValor)}`;
    doc.text(sub, margin + 10, y + 25);
    doc.setTextColor(0);
    y += 38;

    if (eq.lideres.length === 0) {
      doc.setFontSize(9); doc.setTextColor(120);
      doc.text("(sem líderes vinculados)", margin + 14, y);
      doc.setTextColor(0); y += 18; continue;
    }

    // Tabela de líderes + cabos resumidos
    const rows: any[] = [];
    for (const { lider, cabos } of eq.lideres) {
      rows.push([
        { content: `▸ ${lider.nome}`, styles: { fontStyle: "bold" } },
        fmtPhone(lider.telefone),
        cap(lider.bairro || lider.cidade || lider.regiao),
        String(cabos.length),
        lider.valor_contratacao && lider.valor_contratacao > 0 ? fmtBRL(lider.valor_contratacao) : "—",
      ]);
      for (const c of cabos) {
        rows.push([
          { content: `      └ ${c.nome}`, styles: { textColor: [80, 80, 80] as any, fontSize: 8 } },
          { content: fmtPhone(c.telefone), styles: { textColor: [80, 80, 80] as any, fontSize: 8 } },
          { content: cap(c.bairro || c.cidade || c.regiao), styles: { textColor: [80, 80, 80] as any, fontSize: 8 } },
          { content: "—", styles: { textColor: [80, 80, 80] as any, fontSize: 8 } },
          { content: c.valor_contratacao && c.valor_contratacao > 0 ? fmtBRL(c.valor_contratacao) : "—", styles: { textColor: [80, 80, 80] as any, fontSize: 8 } },
        ]);
      }
    }

    autoTable(doc, {
      startY: y,
      head: [["Líder / Cabo", "Telefone", "Bairro/Cidade", "Cabos", "Valor"]],
      body: rows,
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 4, valign: "middle" },
      headStyles: { fillColor: [71, 85, 105], textColor: 255, fontStyle: "bold", fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 200 },
        1: { cellWidth: 85 },
        2: { cellWidth: 110 },
        3: { halign: "center", cellWidth: 45 },
        4: { halign: "right", cellWidth: 70 },
      },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 14;
  }

  const pageCount = doc.getNumberOfPages();
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(140);
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.text(
      `Sentinelle • Estrutura por Coordenador • Página ${i} de ${pageCount}`,
      pageWidth / 2, pageHeight - 14, { align: "center" },
    );
  }

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);
  const escopoSlug = slugify(opts.escopoLabel);
  const coordSlug = opts.coordenadorFiltro
    ? "-equipe-" + slugify(opts.coordenadorFiltro.nome)
    : "";
  const suf = opts.fileNameSuffix ? `-${slugify(opts.fileNameSuffix)}` : "";
  outputPdf(doc, `eleicao-raiz-${escopoSlug}${coordSlug}${suf}-${ts}.pdf`, opts.mode);
}

export function exportEleicaoCsvRaiz(opts: RaizExportOptions) {
  const equipes = montarEquipes(opts);
  const headers = [
    "Nivel", "Coordenador (raiz)", "Lider (raiz)",
    "Tipo", "Nome", "Telefone", "Regiao", "Cidade", "Bairro", "Valor (R$)",
  ];
  const escapeCsv = (v: any) => {
    const s = v == null ? "" : String(v);
    return /[";,\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(";")];
  const push = (cells: (string | number)[]) => lines.push(cells.map(escapeCsv).join(";"));

  for (const eq of equipes) {
    const coordNome = eq.coord?.nome || "— AVULSOS —";
    if (eq.coord && (!opts.tipos || opts.tipos.includes("coordenador"))) {
      push([
        "coordenador", coordNome, "",
        TIPO_LABEL.coordenador, eq.coord.nome, fmtPhone(eq.coord.telefone),
        cap(eq.coord.regiao), eq.coord.cidade || "", eq.coord.bairro || "",
        (eq.coord.valor_contratacao || 0).toFixed(2).replace(".", ","),
      ]);
    }
    for (const { lider, cabos } of eq.lideres) {
      if (!opts.tipos || opts.tipos.includes("lider")) {
        push([
          "lider", coordNome, lider.nome,
          TIPO_LABEL.lider, lider.nome, fmtPhone(lider.telefone),
          cap(lider.regiao), lider.cidade || "", lider.bairro || "",
          (lider.valor_contratacao || 0).toFixed(2).replace(".", ","),
        ]);
      }
      if (!opts.tipos || opts.tipos.includes("cabo")) {
        for (const c of cabos) {
          push([
            "cabo", coordNome, lider.nome,
            TIPO_LABEL.cabo, c.nome, fmtPhone(c.telefone),
            cap(c.regiao), c.cidade || "", c.bairro || "",
            (c.valor_contratacao || 0).toFixed(2).replace(".", ","),
          ]);
        }
      }
    }
  }

  const csv = "\uFEFF" + lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);
  const escopoSlug = slugify(opts.escopoLabel);
  const coordSlug = opts.coordenadorFiltro
    ? "-equipe-" + slugify(opts.coordenadorFiltro.nome)
    : "";
  const suf = opts.fileNameSuffix ? `-${slugify(opts.fileNameSuffix)}` : "";
  a.download = `eleicao-raiz-${escopoSlug}${coordSlug}${suf}-${ts}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
