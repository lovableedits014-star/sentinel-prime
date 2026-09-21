export type DuplicidadePessoaPdf = {
  id: string;
  nome: string;
  tipo: string;
  telefone: string | null;
  responsavel_nome: string | null;
  valor_contratacao: number | null;
  is_voluntario: boolean | null;
  contrato_fim: string | null;
};

export type DuplicidadeGrupoPdf = {
  tipo: "telefone" | "cpf";
  chave: string;
  cadastros: DuplicidadePessoaPdf[];
};

const pastaDaPessoa = (pessoa: DuplicidadePessoaPdf) =>
  pessoa.responsavel_nome ||
  (pessoa.tipo === "coordenador" || pessoa.tipo === "lider" ? pessoa.nome : "Sem responsável");

const contratoDaPessoa = (pessoa: DuplicidadePessoaPdf) => {
  if (pessoa.is_voluntario) return "Voluntário";
  const valor = Number(pessoa.valor_contratacao || 0);
  if (valor <= 0) return "Sem contrato";
  const dinheiro = valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return pessoa.contrato_fim
    ? `${dinheiro} - término ${new Date(`${pessoa.contrato_fim}T12:00:00`).toLocaleDateString("pt-BR")}`
    : `${dinheiro} - ativo sem término`;
};

export async function gerarRelatorioDuplicidadesPdf(grupos: DuplicidadeGrupoPdf[]) {
  const [{ default: jsPDF }, tableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = tableModule.default;
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 36;

  const pastas = new Map<string, DuplicidadeGrupoPdf[]>();
  for (const grupo of grupos) {
    const nomes = new Set(grupo.cadastros.map(pastaDaPessoa));
    for (const nome of nomes) {
      const lista = pastas.get(nome) || [];
      lista.push(grupo);
      pastas.set(nome, lista);
    }
  }

  const desenharCabecalho = (titulo: string) => {
    doc.setFillColor(30, 64, 175);
    doc.rect(0, 0, pageWidth, 54, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text(titulo, margin, 33);
  };

  const adicionarRodape = () => {
    const totalPaginas = doc.getNumberOfPages();
    for (let pagina = 1; pagina <= totalPaginas; pagina++) {
      doc.setPage(pagina);
      doc.setDrawColor(203, 213, 225);
      doc.line(margin, pageHeight - 28, pageWidth - margin, pageHeight - 28);
      doc.setTextColor(100, 116, 139);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(
        `Gerado em ${new Date().toLocaleString("pt-BR")} - Página ${pagina} de ${totalPaginas}`,
        margin,
        pageHeight - 14,
      );
    }
  };

  desenharCabecalho("Relatório detalhado de duplicidades eleitorais");
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(
    "Varredura por telefone normalizado e CPF entre todos os cadastros ativos do cliente.",
    margin,
    78,
  );
  autoTable(doc, {
    startY: 94,
    margin: { left: margin, right: margin, bottom: 40 },
    head: [["Indicador", "Quantidade"]],
    body: [
      ["Conflitos encontrados", String(grupos.length)],
      ["Pastas de responsáveis", String(pastas.size)],
      [
        "Cadastros envolvidos",
        String(new Set(grupos.flatMap((grupo) => grupo.cadastros.map((pessoa) => pessoa.id))).size),
      ],
      [
        "Conflitos por telefone",
        String(grupos.filter((grupo) => grupo.tipo === "telefone").length),
      ],
      ["Conflitos por CPF", String(grupos.filter((grupo) => grupo.tipo === "cpf").length)],
    ],
    theme: "grid",
    tableWidth: 330,
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [51, 65, 85] },
    columnStyles: { 0: { cellWidth: 230 }, 1: { cellWidth: 100, halign: "right" } },
  });

  const ordenadas = Array.from(pastas.entries()).sort(([a], [b]) => a.localeCompare(b, "pt-BR"));
  for (const [responsavel, conflitos] of ordenadas) {
    doc.addPage("a4", "landscape");
    desenharCabecalho(`Pasta: ${responsavel}`);
    doc.setTextColor(51, 65, 85);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`${conflitos.length} conflito(s) relacionado(s) a esta equipe.`, margin, 75);

    autoTable(doc, {
      startY: 88,
      margin: { left: margin, right: margin, bottom: 40 },
      head: [["Conflito", "Nome", "Papel", "Telefone", "Responsável", "Contrato"]],
      body: conflitos.flatMap((grupo) =>
        grupo.cadastros.map((pessoa) => [
          grupo.tipo === "cpf" ? `CPF final ${grupo.chave.slice(-4)}` : `Telefone ${grupo.chave}`,
          pessoa.nome,
          pessoa.tipo,
          pessoa.telefone || "-",
          pessoa.responsavel_nome || "Sem responsável",
          contratoDaPessoa(pessoa),
        ]),
      ),
      theme: "striped",
      styles: { fontSize: 7.5, cellPadding: 3.5, overflow: "linebreak", valign: "middle" },
      headStyles: { fillColor: [71, 85, 105] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 105 },
        1: { cellWidth: 145 },
        2: { cellWidth: 65 },
        3: { cellWidth: 90 },
        4: { cellWidth: 145 },
        5: { cellWidth: "auto" },
      },
    });
  }

  adicionarRodape();
  doc.save(`relatorio-duplicidades-${new Date().toISOString().slice(0, 10)}.pdf`);
}
