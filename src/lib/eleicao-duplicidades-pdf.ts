export type DuplicidadePessoaPdf = {
  id: string;
  nome: string;
  tipo: string;
  telefone: string | null;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  responsavel_tipo: string | null;
  valor_contratacao: number | null;
  is_voluntario: boolean | null;
  contrato_fim: string | null;
};

export type DuplicidadeGrupoPdf = {
  tipo: "telefone" | "cpf";
  chave: string;
  cadastros: DuplicidadePessoaPdf[];
};

const papel = (tipo: string | null) =>
  tipo === "coordenador" ? "Coordenador" : tipo === "lider" ? "Líder" : "Sem responsável";

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

  const pastas = new Map<
    string,
    { id: string; nome: string; tipo: string | null; conflitos: DuplicidadeGrupoPdf[] }
  >();
  for (const grupo of grupos) {
    const responsaveis = new Map<string, { nome: string; tipo: string | null }>();
    for (const pessoa of grupo.cadastros) {
      responsaveis.set(pessoa.responsavel_id || "sem-responsavel", {
        nome: pessoa.responsavel_nome || "Sem responsável",
        tipo: pessoa.responsavel_tipo,
      });
    }
    for (const [id, responsavel] of responsaveis) {
      const pasta = pastas.get(id) || { id, ...responsavel, conflitos: [] };
      pasta.conflitos.push(grupo);
      pastas.set(id, pasta);
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

  const ordenadas = Array.from(pastas.values()).sort((a, b) =>
    a.nome.localeCompare(b.nome, "pt-BR"),
  );
  for (const pasta of ordenadas) {
    doc.addPage("a4", "landscape");
    desenharCabecalho(`Pasta: ${pasta.nome} — ${papel(pasta.tipo)}`);
    doc.setTextColor(51, 65, 85);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`${pasta.conflitos.length} conflito(s) relacionado(s) a esta equipe.`, margin, 75);

    autoTable(doc, {
      startY: 88,
      margin: { left: margin, right: margin, bottom: 40 },
      head: [["Conflito", "Nome", "Papel", "Telefone", "Onde está cadastrado", "Contrato"]],
      body: pasta.conflitos.flatMap((grupo) =>
        grupo.cadastros.map((pessoa) => [
          grupo.tipo === "cpf" ? `CPF final ${grupo.chave.slice(-4)}` : `Telefone ${grupo.chave}`,
          pessoa.nome,
          pessoa.tipo,
          pessoa.telefone || "-",
          `${(pessoa.responsavel_id || "sem-responsavel") === pasta.id ? "NESTA EQUIPE" : "DUPLICADO EM OUTRA EQUIPE"}: ${
            pessoa.responsavel_nome
              ? `${pessoa.responsavel_nome} (${papel(pessoa.responsavel_tipo).toLowerCase()})`
              : "Sem responsável"
          }`,
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
