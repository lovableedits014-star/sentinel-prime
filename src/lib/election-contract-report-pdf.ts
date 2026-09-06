export type ContractReportPdfRow = {
  pessoa_id: string;
  parent_id: string | null;
  nome: string;
  telefone: string;
  cargo: string;
  coordenador_id: string | null;
  coordenador_nome: string | null;
  regiao: string | null;
  cidade: string | null;
  missoes: number;
  cumpridas: number;
  abriu_sem_concluir: number;
  nao_abriu: number;
  taxa: number;
  total_indicados: number;
  meta_indicados: number;
  votos_confirmados: number;
  devolutivas_negativas: number;
};

import type { ElectionRankingRow } from "./election-ranking";

const slug = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export async function exportElectionContractReportPdf(args: {
  inicio: string;
  fim: string;
  rows: ContractReportPdfRow[];
}) {
  if (!args.rows.length) throw new Error("Nenhum contratado disponível para exportação.");
  const [{ default: jsPDF }, tableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = tableModule.default;
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 34;
  const groups = new Map<string, ContractReportPdfRow[]>();
  for (const row of args.rows) {
    const key = row.coordenador_id || "sem-coordenador";
    const list = groups.get(key) || [];
    list.push(row);
    groups.set(key, list);
  }

  Array.from(groups.entries()).forEach(([key, team], teamIndex) => {
    if (teamIndex) doc.addPage();
    const coordinator = team.find((r) => r.pessoa_id === r.coordenador_id);
    const name = coordinator?.nome || team[0]?.coordenador_nome || "Sem coordenador";
    const missions = team.reduce((sum, r) => sum + Number(r.missoes || 0), 0);
    const done = team.reduce((sum, r) => sum + Number(r.cumpridas || 0), 0);
    const pending = team.reduce(
      (sum, r) => sum + Number(r.abriu_sem_concluir || 0) + Number(r.nao_abriu || 0),
      0,
    );
    const indicated = team.reduce((sum, r) => sum + Number(r.total_indicados || 0), 0);
    const confirmed = team.reduce((sum, r) => sum + Number(r.votos_confirmados || 0), 0);
    const negative = team.reduce((sum, r) => sum + Number(r.devolutivas_negativas || 0), 0);
    const rate = missions ? (100 * done) / missions : 0;

    doc.setFillColor(
      key === "sem-coordenador" ? 146 : 15,
      key === "sem-coordenador" ? 64 : 52,
      key === "sem-coordenador" ? 14 : 120,
    );
    doc.rect(0, 0, width, 76, "F");
    doc.setTextColor(255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(name, margin, 31);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(
      `Equipe contratada · missões de ${new Date(`${args.inicio}T12:00:00`).toLocaleDateString("pt-BR")} até ${new Date(`${args.fim}T12:00:00`).toLocaleDateString("pt-BR")}`,
      margin,
      51,
    );
    doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, width - margin, 31, {
      align: "right",
    });

    const cards = [
      ["Contratados", team.length],
      ["Cumpridas", done],
      ["Pendentes", pending],
      ["Adesão", `${rate.toFixed(1)}%`],
      ["Votos confirmados", confirmed],
      ["Negativas", negative],
      ["Indicados", indicated],
    ] as const;
    const gap = 7,
      cardWidth = (width - margin * 2 - gap * 6) / 7;
    cards.forEach(([label, value], index) => {
      const x = margin + index * (cardWidth + gap);
      doc.setFillColor(
        index === 1 ? 220 : index === 2 ? 254 : 239,
        index === 1 ? 252 : index === 2 ? 226 : 246,
        index === 1 ? 231 : index === 2 ? 226 : 255,
      );
      doc.roundedRect(x, 91, cardWidth, 50, 5, 5, "F");
      doc.setTextColor(71, 85, 105);
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "normal");
      doc.text(label.toUpperCase(), x + 8, 107);
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(15);
      doc.setFont("helvetica", "bold");
      doc.text(String(value), x + 8, 132);
    });

    const byId = new Map(team.map((r) => [r.pessoa_id, r]));
    const depth = (row: ContractReportPdfRow) => {
      let current = row,
        level = 0;
      const seen = new Set<string>();
      while (current.parent_id && byId.has(current.parent_id) && !seen.has(current.parent_id)) {
        seen.add(current.parent_id);
        current = byId.get(current.parent_id)!;
        level++;
      }
      return Math.min(level, 4);
    };
    const rank: Record<string, number> = { coordenador: 0, lider: 1, cabo: 2 };
    const ordered = [...team].sort(
      (a, b) =>
        depth(a) - depth(b) ||
        (rank[a.cargo] ?? 9) - (rank[b.cargo] ?? 9) ||
        a.nome.localeCompare(b.nome),
    );
    autoTable(doc, {
      startY: 158,
      head: [
        [
          "Estrutura da equipe",
          "Contato",
          "Região",
          "Missões",
          "Cumpridas",
          "Pendentes",
          "Taxa",
          "Confirmados",
          "Negativas",
          "Indicados / meta",
        ],
      ],
      body: ordered.map((r) => [
        `${"   ".repeat(depth(r))}${depth(r) ? "└ " : ""}${r.nome}\n${r.cargo}`,
        r.telefone || "—",
        r.regiao || r.cidade || "—",
        r.missoes,
        r.cumpridas,
        Number(r.abriu_sem_concluir || 0) + Number(r.nao_abriu || 0),
        `${Number(r.taxa || 0).toFixed(1)}%`,
        r.votos_confirmados,
        r.devolutivas_negativas,
        `${r.total_indicados}/${r.meta_indicados}`,
      ]),
      theme: "striped",
      margin: { left: margin, right: margin, bottom: 28 },
      styles: { fontSize: 8, cellPadding: 5, valign: "middle" },
      headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 190, fontStyle: "bold" },
        1: { cellWidth: 90 },
        2: { cellWidth: 90 },
        3: { halign: "center" },
        4: { halign: "center" },
        5: { halign: "center" },
        6: { halign: "center", fontStyle: "bold" },
        7: { halign: "center" },
      },
      didDrawPage: () => {
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text("Relatório de contratados · Eleição", margin, height - 13);
        doc.text(`Página ${doc.getCurrentPageInfo().pageNumber}`, width - margin, height - 13, {
          align: "right",
        });
      },
    });
  });
  doc.save(`relatorio-contratados-${slug(args.inicio)}-a-${slug(args.fim)}.pdf`);
}

export async function exportElectionRankingPdf(args: {
  inicio: string;
  fim: string;
  rows: ElectionRankingRow[];
}) {
  if (!args.rows.length) throw new Error("Nenhuma coordenação disponível para o ranking.");
  const [{ default: jsPDF }, tableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const autoTable = tableModule.default;
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 34;
  const praise = args.rows.filter((row) => row.action === "elogiar").length;
  const charge = args.rows.filter(
    (row) => row.action === "cobrar" || row.action === "urgente",
  ).length;
  const average = Math.round(args.rows.reduce((sum, row) => sum + row.score, 0) / args.rows.length);

  doc.setFillColor(30, 27, 75);
  doc.rect(0, 0, width, 96, "F");
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("Ranking das coordenações", margin, 38);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    `Missões de ${new Date(`${args.inicio}T12:00:00`).toLocaleDateString("pt-BR")} a ${new Date(`${args.fim}T12:00:00`).toLocaleDateString("pt-BR")} · 50% missões + 30% indicados + 20% conversão`,
    margin,
    59,
  );
  doc.setTextColor(199, 210, 254);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, margin, 77);

  const summary = [
    ["Líder do ranking", args.rows[0].name],
    ["Média geral", `${average}/100`],
    ["Para elogiar", praise],
    ["Para cobrar", charge],
  ] as const;
  const gap = 10;
  const cardWidth = (width - margin * 2 - gap * 3) / 4;
  summary.forEach(([label, value], index) => {
    const x = margin + index * (cardWidth + gap);
    doc.setFillColor(index === 0 ? 254 : 248, index === 0 ? 243 : 250, index === 0 ? 199 : 252);
    doc.roundedRect(x, 112, cardWidth, 54, 6, 6, "F");
    doc.setTextColor(71, 85, 105);
    doc.setFontSize(8);
    doc.text(label.toUpperCase(), x + 10, 130);
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(index === 0 ? 13 : 18);
    doc.text(String(value), x + 10, 153, { maxWidth: cardWidth - 20 });
  });

  autoTable(doc, {
    startY: 184,
    head: [
      [
        "#",
        "Coordenação",
        "Região",
        "Equipe",
        "Nota",
        "Missões",
        "Meta de indicados",
        "Votos",
        "Orientação",
      ],
    ],
    body: args.rows.map((row) => [
      `${row.position}º`,
      row.name,
      row.area,
      row.people,
      `${row.score}/100`,
      `${row.done}/${row.missions} (${row.missionRate.toFixed(0)}%)`,
      `${row.indicated}/${row.indicationGoal} (${row.listRate.toFixed(0)}%)`,
      `${row.confirmed} sim · ${row.negative} não`,
      row.action === "elogiar"
        ? "ELOGIAR"
        : row.action === "acompanhar"
          ? "ACOMPANHAR"
          : row.action === "cobrar"
            ? "COBRAR"
            : "URGENTE",
    ]),
    theme: "striped",
    margin: { left: margin, right: margin, bottom: 28 },
    styles: { fontSize: 8, cellPadding: 5, valign: "middle" },
    headStyles: { fillColor: [67, 56, 202], textColor: 255, fontStyle: "bold" },
    columnStyles: {
      0: { halign: "center", fontStyle: "bold", cellWidth: 28 },
      1: { fontStyle: "bold", cellWidth: 120 },
      4: { halign: "center", fontStyle: "bold" },
      8: { fontStyle: "bold" },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 8) {
        const value = String(data.cell.raw);
        data.cell.styles.textColor =
          value === "ELOGIAR"
            ? [5, 150, 105]
            : value === "URGENTE"
              ? [220, 38, 38]
              : value === "COBRAR"
                ? [217, 119, 6]
                : [2, 132, 199];
      }
    },
    didDrawPage: () => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text("Ranking executivo · Eleição", margin, height - 13);
      doc.text(`Página ${doc.getCurrentPageInfo().pageNumber}`, width - margin, height - 13, {
        align: "right",
      });
    },
  });
  doc.save(`ranking-eleicao-${slug(args.inicio)}-a-${slug(args.fim)}.pdf`);
}
