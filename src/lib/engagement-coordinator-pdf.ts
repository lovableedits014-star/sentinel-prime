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
  coordenador_status?: "cumpriu" | "abriu" | "nao_abriu";
};

export type StandaloneMissionPdfRow = {
  nome: string; telefone: string | null; cargo: string | null; regiao: string | null; cidade: string | null;
  status: "cumpriu" | "abriu" | "nao_abriu";
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
    const ownStatus=team.coordenador_status==="cumpriu"?"Coordenador concluiu":team.coordenador_status==="abriu"?"Coordenador abriu, mas não concluiu":"Coordenador ainda não abriu";
    doc.text(`${ownStatus}. ${pending ? `${pending} contratado(s) ainda precisam de acompanhamento.` : "Equipe com 100% de conclusão."}`, margin, 210);

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

export async function exportCoordinatorMissionSummaryPdf(args: {
  missionTitle: string;
  publishedAt: string;
  teams: CoordinatorMissionPdfRow[];
}) {
  if (!args.teams.length) throw new Error("Nenhum coordenador disponível para exportação.");
  const [{ default: jsPDF }, tableModule] = await Promise.all([
    import("jspdf"), import("jspdf-autotable"),
  ]);
  const autoTable = tableModule.default;
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 36;
  const teams = [...args.teams].sort((a, b) => b.taxa - a.taxa || b.total_lideres - a.total_lideres || a.coordenador_nome.localeCompare(b.coordenador_nome));
  const totalTeams = teams.reduce((sum, row) => sum + Number(row.total_lideres), 0);
  const totalDone = teams.reduce((sum, row) => sum + Number(row.concluidos), 0);
  const totalPending = teams.reduce((sum, row) => sum + Number(row.abriu_sem_concluir) + Number(row.nao_abriu), 0);
  const overallRate = totalTeams ? 100 * totalDone / totalTeams : 0;

  doc.setFillColor(15, 52, 120);
  doc.rect(0, 0, width, 76, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Visão geral das equipes", margin, 31);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(args.missionTitle.slice(0, 100), margin, 50);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, width - margin, 31, { align: "right" });
  doc.text(`Missão publicada em ${new Date(args.publishedAt).toLocaleString("pt-BR")}`, width - margin, 50, { align: "right" });

  const cards = [
    ["Coordenadores", teams.length], ["Contratados em equipes", totalTeams],
    ["Concluíram", totalDone], ["Pendentes", totalPending], ["Adesão geral", `${overallRate.toFixed(1)}%`],
  ] as const;
  const gap = 8;
  const cardWidth = (width - margin * 2 - gap * 4) / 5;
  cards.forEach(([label, value], index) => {
    const x = margin + index * (cardWidth + gap);
    doc.setFillColor(index === 2 ? 220 : index === 3 ? 254 : 232, index === 2 ? 252 : index === 3 ? 226 : 240, index === 2 ? 231 : index === 3 ? 226 : 254);
    doc.roundedRect(x, 94, cardWidth, 50, 5, 5, "F");
    doc.setTextColor(71, 85, 105);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(label.toUpperCase(), x + 8, 109);
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text(String(value), x + 8, 134);
  });

  autoTable(doc, {
    startY: 164,
    head: [["Coordenador", "Situação pessoal", "Equipe", "Concluíram", "Abriram, não concluíram", "Não abriram", "Cumprimento"]],
    body: teams.map((team) => [
      team.coordenador_nome,
      team.coordenador_status==="cumpriu"?"Concluiu":team.coordenador_status==="abriu"?"Abriu, não concluiu":"Não abriu",
      team.total_lideres,
      team.concluidos,
      team.abriu_sem_concluir,
      team.nao_abriu,
      `${Number(team.taxa).toFixed(1)}%`,
    ]),
    theme: "striped",
    margin: { left: margin, right: margin, bottom: 32 },
    styles: { fontSize: 8.5, cellPadding: 5, valign: "middle" },
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 175, fontStyle: "bold" },
      1: { halign: "center" }, 2: { halign: "center" }, 3: { halign: "center" },
      4: { halign: "center" }, 5: { halign: "center" }, 6: { halign: "center", fontStyle: "bold" },
    },
    didDrawPage: () => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text("Resumo executivo - Engajamento", margin, height - 14);
      doc.text(`Página ${doc.getCurrentPageInfo().pageNumber}`, width - margin, height - 14, { align: "right" });
    },
  });
  doc.save(`resumo-equipes-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export async function exportStandaloneMissionPdf(args: {
  missionTitle: string; publishedAt: string; rows: StandaloneMissionPdfRow[];
}) {
  if (!args.rows.length) throw new Error("Nenhum contratado avulso disponível para exportação.");
  const [{ default: jsPDF }, tableModule] = await Promise.all([import("jspdf"),import("jspdf-autotable")]);
  const autoTable=tableModule.default;
  const doc=new jsPDF({unit:"pt",format:"a4",orientation:"landscape"});
  const width=doc.internal.pageSize.getWidth(),height=doc.internal.pageSize.getHeight(),margin=36;
  const done=args.rows.filter(r=>r.status==="cumpriu").length;
  const opened=args.rows.filter(r=>r.status==="abriu").length;
  const unopened=args.rows.filter(r=>r.status==="nao_abriu").length;
  doc.setFillColor(15,52,120);doc.rect(0,0,width,76,"F");doc.setTextColor(255);doc.setFont("helvetica","bold");doc.setFontSize(18);
  doc.text("Desempenho dos contratados avulsos",margin,31);doc.setFont("helvetica","normal");doc.setFontSize(9);
  doc.text(args.missionTitle.slice(0,100),margin,50);doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`,width-margin,31,{align:"right"});
  doc.text(`Publicada em ${new Date(args.publishedAt).toLocaleString("pt-BR")}`,width-margin,50,{align:"right"});
  const rate=args.rows.length?100*done/args.rows.length:0;
  doc.setTextColor(15,23,42);doc.setFont("helvetica","bold");doc.setFontSize(11);
  doc.text(`${args.rows.length} avulsos  |  ${done} concluíram  |  ${opened} abriram e não concluíram  |  ${unopened} não abriram  |  ${rate.toFixed(1)}% de cumprimento`,margin,104);
  autoTable(doc,{startY:122,head:[["Nome","Cargo","Região","Telefone","Situação"]],body:args.rows.map(r=>[
    r.nome,r.cargo||"-",r.regiao||r.cidade||"-",r.telefone||"-",r.status==="cumpriu"?"Concluiu":r.status==="abriu"?"Abriu, não concluiu":"Não abriu"
  ]),theme:"striped",margin:{left:margin,right:margin,bottom:30},styles:{fontSize:9,cellPadding:5},
    headStyles:{fillColor:[30,64,175],textColor:255,fontStyle:"bold"},columnStyles:{0:{cellWidth:230,fontStyle:"bold"},4:{cellWidth:120,fontStyle:"bold"}},
    didDrawPage:()=>{doc.setFontSize(8);doc.setTextColor(100,116,139);doc.text("Relatório interno - Engajamento",margin,height-14);doc.text(`Página ${doc.getCurrentPageInfo().pageNumber}`,width-margin,height-14,{align:"right"});}
  });
  doc.save(`desempenho-avulsos-${new Date().toISOString().slice(0,10)}.pdf`);
}
