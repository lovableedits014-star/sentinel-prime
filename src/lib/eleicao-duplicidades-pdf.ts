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
  contrato_inicio: string | null;
  contrato_fim: string | null;
  importacao_lote_id: string | null;
  importacao_lote_nome: string | null;
  contrato_ativo: boolean;
};

export type DuplicidadeGrupoPdf = {
  tipo: "telefone" | "cpf";
  chave: string;
  cadastros: DuplicidadePessoaPdf[];
};

export type OcorrenciaImportacaoPdf = {
  lote_nome?: string;
  arquivo_nome?: string;
  data_tentativa?: string;
  responsavel_tentativa_nome?: string | null;
  responsavel_tentativa_tipo?: string | null;
  numero_linha: number;
  nome: string | null;
  cpf_normalizado: string | null;
  telefone_normalizado: string | null;
  classificacao: string;
  motivo: string | null;
  duplicado: {
    nome: string;
    tipo: string;
    telefone: string | null;
    responsavel_nome: string | null;
    responsavel_tipo: string | null;
    valor_contratacao: number | null;
    is_voluntario: boolean | null;
    contrato_inicio: string | null;
    contrato_fim: string | null;
  } | null;
};

const papel = (tipo: string | null) =>
  tipo === "coordenador" ? "Coordenador" : tipo === "lider" ? "Líder" : "Sem responsável";

const contratoDaPessoa = (pessoa: DuplicidadePessoaPdf) => {
  if (pessoa.is_voluntario) return "Voluntário";
  const valor = Number(pessoa.valor_contratacao || 0);
  if (valor <= 0) return "Sem contrato";
  const dinheiro = valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const inicio = pessoa.contrato_inicio
    ? new Date(`${pessoa.contrato_inicio}T12:00:00`).toLocaleDateString("pt-BR")
    : "não informado";
  const fim = pessoa.contrato_fim
    ? new Date(`${pessoa.contrato_fim}T12:00:00`).toLocaleDateString("pt-BR")
    : "sem término";
  return `${dinheiro} - ${inicio} até ${fim} - ${pessoa.importacao_lote_nome || "cadastro manual"}`;
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
  const contratosUnicos = new Map<string, DuplicidadePessoaPdf>();
  for (const grupo of grupos) {
    for (const pessoa of grupo.cadastros) contratosUnicos.set(pessoa.id, pessoa);
  }
  const valorSobRisco = Array.from(contratosUnicos.values()).reduce(
    (total, pessoa) => total + Number(pessoa.valor_contratacao || 0),
    0,
  );

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

  desenharCabecalho("Relatório de auditoria - contratos ativos duplicados");
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(
    "Varredura financeira por telefone normalizado e CPF, com localização de todos os vínculos ativos.",
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
      [
        "Valor total dos contratos sob revisão",
        valorSobRisco.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
      ],
    ],
    theme: "grid",
    tableWidth: 430,
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [51, 65, 85] },
    columnStyles: { 0: { cellWidth: 300 }, 1: { cellWidth: 130, halign: "right" } },
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

const dataBr = (value: string | null) =>
  value ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR") : null;

export async function gerarRelatorioOcorrenciasLotePdf(
  nomeLote: string,
  ocorrencias: OcorrenciaImportacaoPdf[],
) {
  const [{ default: jsPDF }, tableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = tableModule.default;
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const largura = doc.internal.pageSize.getWidth();
  const altura = doc.internal.pageSize.getHeight();
  const margem = 30;
  const duplicadosAtivos = ocorrencias.filter(
    (item) => item.classificacao === "duplicado_contrato_ativo" && item.duplicado,
  );
  const outrasOcorrencias = ocorrencias.filter(
    (item) => item.classificacao !== "duplicado_contrato_ativo" || !item.duplicado,
  );
  const contexto = ocorrencias[0];
  const responsavel = contexto?.responsavel_tentativa_nome || "Responsável não identificado";
  const responsavelTipo = papel(contexto?.responsavel_tentativa_tipo || null);
  const arquivoOrigem = contexto?.arquivo_nome || nomeLote;

  const cabecalho = (titulo: string, subtitulo: string) => {
    doc.setFillColor(153, 27, 27);
    doc.rect(0, 0, largura, 58, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text(titulo, margem, 27);
    doc.setFontSize(9);
    doc.text(subtitulo, margem, 44);
  };

  cabecalho(
    "Relatório de cabos recusados por contrato ativo",
    `${responsavel} - ${responsavelTipo} | Lote: ${nomeLote}`,
  );
  doc.setTextColor(51, 65, 85);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    `Arquivo: ${arquivoOrigem}. Este documento comprova por que cada cabo abaixo não foi cadastrado para ${responsavel}.`,
    margem,
    78,
  );

  autoTable(doc, {
    startY: 90,
    tableWidth: 460,
    head: [["Resumo", "Quantidade"]],
    body: [
      ["Cabos recusados por contrato ativo", String(duplicadosAtivos.length)],
      ["Outras ocorrências da planilha", String(outrasOcorrencias.length)],
      ["Responsável da importação", `${responsavel} (${responsavelTipo.toLowerCase()})`],
    ],
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 4 },
    headStyles: { fillColor: [127, 29, 29] },
    columnStyles: { 0: { cellWidth: 300 }, 1: { cellWidth: 160 } },
  });

  if (duplicadosAtivos.length) {
    const finalResumo = (doc as typeof doc & { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY;
    autoTable(doc, {
      startY: (finalResumo || 90) + 16,
      margin: { left: margem, right: margem, bottom: 40 },
      head: [
        [
          "Cabo recusado",
          "Solicitado por",
          "Contrato ativo encontrado",
          "Onde já está contratado",
          "Justificativa da recusa",
        ],
      ],
      body: duplicadosAtivos.map((item) => {
        const duplicado = item.duplicado!;
        const valor = Number(duplicado.valor_contratacao || 0).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        });
        const destino = duplicado.responsavel_nome
          ? `${duplicado.responsavel_nome} (${papel(duplicado.responsavel_tipo).toLowerCase()})`
          : "Sem responsável identificado";
        return [
          `${item.nome || "Sem nome"}\nTelefone: ${item.telefone_normalizado || "-"}\nCPF: ${item.cpf_normalizado || "-"}\nLinha ${item.numero_linha + 1}`,
          `${item.responsavel_tentativa_nome || responsavel}\n${papel(item.responsavel_tentativa_tipo || contexto?.responsavel_tentativa_tipo || null)}`,
          `${duplicado.nome} (${duplicado.tipo})\nTelefone: ${duplicado.telefone || "-"}\n${valor}\n${dataBr(duplicado.contrato_inicio) || "início não informado"} até ${dataBr(duplicado.contrato_fim) || "sem término"}`,
          destino,
          `Não cadastrado para ${item.responsavel_tentativa_nome || responsavel} porque já possui contrato ativo com ${destino}.`,
        ];
      }),
      theme: "grid",
      styles: { fontSize: 7.2, cellPadding: 4, overflow: "linebreak", valign: "top" },
      headStyles: { fillColor: [127, 29, 29] },
      alternateRowStyles: { fillColor: [254, 242, 242] },
      columnStyles: {
        0: { cellWidth: 135 },
        1: { cellWidth: 125 },
        2: { cellWidth: 175 },
        3: { cellWidth: 145 },
        4: { cellWidth: "auto" },
      },
    });
  }

  if (outrasOcorrencias.length) {
    doc.addPage("a4", "landscape");
    cabecalho("Anexo - outras ocorrências da planilha", `${arquivoOrigem} | ${nomeLote}`);
    doc.setTextColor(51, 65, 85);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(
      "Estes itens são erros de dados, conflitos de identidade ou repetições no próprio arquivo; não representam outro contrato ativo.",
      margem,
      78,
    );
    autoTable(doc, {
      startY: 90,
      margin: { left: margem, right: margem, bottom: 40 },
      head: [["Linha", "Pessoa", "Contato/documento", "Situação", "Motivo"]],
      body: outrasOcorrencias.map((item) => [
        String(item.numero_linha + 1),
        item.nome || "Sem nome",
        item.telefone_normalizado || item.cpf_normalizado || "Sem documento",
        item.classificacao.replaceAll("_", " "),
        item.motivo || "-",
      ]),
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak", valign: "top" },
      headStyles: { fillColor: [71, 85, 105] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 50 },
        1: { cellWidth: 180 },
        2: { cellWidth: 150 },
        3: { cellWidth: 150 },
        4: { cellWidth: "auto" },
      },
    });
  }

  const paginas = doc.getNumberOfPages();
  for (let pagina = 1; pagina <= paginas; pagina++) {
    doc.setPage(pagina);
    doc.setDrawColor(203, 213, 225);
    doc.line(margem, altura - 27, largura - margem, altura - 27);
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(8);
    doc.text(
      `Gerado em ${new Date().toLocaleString("pt-BR")} - Página ${pagina} de ${paginas}`,
      margem,
      altura - 13,
    );
  }

  const arquivo = responsavel
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  doc.save(`ocorrencias-${arquivo || "importacao"}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export type CasoRecusadoPdf = {
  id: number;
  data_tentativa: string;
  lote_nome: string;
  arquivo_nome: string;
  numero_linha: number;
  nome_tentativa: string | null;
  telefone_tentativa: string | null;
  cpf_tentativa?: string | null;
  fatores_duplicidade?: string[];
  responsavel_tentativa_nome: string | null;
  cadastro_existente_nome: string;
  cadastro_existente_telefone: string | null;
  responsavel_existente_nome: string | null;
  responsavel_existente_tipo: string | null;
  valor_contratacao: number;
  contrato_inicio: string | null;
  contrato_fim: string | null;
  motivo: string | null;
};

export async function gerarRelatorioCasosRecusadosPdf(casos: CasoRecusadoPdf[]) {
  const [{ default: jsPDF }, tableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = tableModule.default;
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const largura = doc.internal.pageSize.getWidth();
  const altura = doc.internal.pageSize.getHeight();
  const margem = 30;

  doc.setFillColor(146, 64, 14);
  doc.rect(0, 0, largura, 58, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("Relatório de cabos recusados por contrato ativo", margem, 28);
  doc.setFontSize(9);
  doc.text(
    `${casos.length} caso(s) selecionado(s) para apresentação aos responsáveis.`,
    margem,
    44,
  );

  autoTable(doc, {
    startY: 76,
    margin: { left: margem, right: margem, bottom: 40 },
    head: [
      [
        "Cabo recusado",
        "Tentativa de cadastro",
        "Contrato já existente",
        "Responsável atual",
        "Contrato",
      ],
    ],
    body: casos.map((item) => [
      `${item.nome_tentativa || "Sem nome"}\nTelefone: ${item.telefone_tentativa || "-"}\nCPF: ${item.cpf_tentativa || "-"}\nCoincidência: ${item.fatores_duplicidade?.length ? item.fatores_duplicidade.map((fator) => (fator === "cpf" ? "CPF" : fator === "nome_telefone" ? "nome + telefone" : "telefone")).join(" e ") : "nome + telefone, telefone ou CPF"}`,
      `${item.responsavel_tentativa_nome || "Sem responsável"}\n${item.lote_nome} - linha ${item.numero_linha + 1}\n${new Date(item.data_tentativa).toLocaleString("pt-BR")}`,
      `${item.cadastro_existente_nome}\n${item.cadastro_existente_telefone || "Sem telefone"}`,
      item.responsavel_existente_nome
        ? `${item.responsavel_existente_nome} (${papel(item.responsavel_existente_tipo).toLowerCase()})`
        : "Sem responsável",
      `${Number(item.valor_contratacao || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}\n${dataBr(item.contrato_inicio) || "início não informado"} até ${dataBr(item.contrato_fim) || "sem término"}`,
    ]),
    theme: "grid",
    styles: { fontSize: 7.5, cellPadding: 4, overflow: "linebreak", valign: "top" },
    headStyles: { fillColor: [180, 83, 9] },
    alternateRowStyles: { fillColor: [255, 247, 237] },
    columnStyles: {
      0: { cellWidth: 145 },
      1: { cellWidth: 165 },
      2: { cellWidth: 145 },
      3: { cellWidth: 145 },
      4: { cellWidth: "auto" },
    },
  });

  const paginas = doc.getNumberOfPages();
  for (let pagina = 1; pagina <= paginas; pagina++) {
    doc.setPage(pagina);
    doc.setDrawColor(203, 213, 225);
    doc.line(margem, altura - 27, largura - margem, altura - 27);
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(8);
    doc.text(
      `Gerado em ${new Date().toLocaleString("pt-BR")} - Página ${pagina} de ${paginas}`,
      margem,
      altura - 13,
    );
  }
  doc.save(`casos-duplicados-ativos-${new Date().toISOString().slice(0, 10)}.pdf`);
}
