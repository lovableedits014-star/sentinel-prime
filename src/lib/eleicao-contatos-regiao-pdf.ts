export type NivelContatoRegiao = "coordenador" | "lider" | "cabo";

export type PessoaContatoRegiao = {
  id: string;
  tipo: NivelContatoRegiao;
  nome: string;
  telefone?: string | null;
  endereco?: string | null;
  rua?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  parent_id?: string | null;
  arquivado_em?: string | null;
};

export type OpcoesContatosRegiao = {
  niveis: NivelContatoRegiao[];
  exibirTelefone: boolean;
  exibirEndereco: boolean;
  incluirArquivados: boolean;
};

type GrupoContato = {
  coordenador: PessoaContatoRegiao | null;
  lideres: Array<{ lider: PessoaContatoRegiao; cabos: PessoaContatoRegiao[] }>;
  cabosDiretos: PessoaContatoRegiao[];
};

const compararNome = (a: PessoaContatoRegiao, b: PessoaContatoRegiao) =>
  a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });

export const formatarTelefoneContato = (value?: string | null) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return value?.trim() || "Nao informado";
};

export const formatarEnderecoContato = (pessoa: PessoaContatoRegiao) => {
  if (pessoa.endereco?.trim()) return pessoa.endereco.trim();
  const logradouro = [pessoa.rua?.trim(), pessoa.numero?.trim()].filter(Boolean).join(", ");
  return (
    [logradouro, pessoa.bairro?.trim(), pessoa.cidade?.trim()].filter(Boolean).join(" - ") ||
    "Nao informado"
  );
};

export function filtrarContatosRegiao(
  pessoas: PessoaContatoRegiao[],
  opcoes: OpcoesContatosRegiao,
) {
  const niveis = new Set(opcoes.niveis);
  return pessoas.filter(
    (pessoa) => niveis.has(pessoa.tipo) && (opcoes.incluirArquivados || !pessoa.arquivado_em),
  );
}

export function agruparContatosRegiao(pessoas: PessoaContatoRegiao[]): GrupoContato[] {
  const coordenadores = pessoas.filter((p) => p.tipo === "coordenador").sort(compararNome);
  const lideres = pessoas.filter((p) => p.tipo === "lider").sort(compararNome);
  const cabos = pessoas.filter((p) => p.tipo === "cabo").sort(compararNome);
  const coordIds = new Set(coordenadores.map((p) => p.id));
  const liderIds = new Set(lideres.map((p) => p.id));

  const montar = (
    coordenador: PessoaContatoRegiao | null,
    lideresGrupo: PessoaContatoRegiao[],
  ) => ({
    coordenador,
    lideres: lideresGrupo.map((lider) => ({
      lider,
      cabos: cabos.filter((cabo) => cabo.parent_id === lider.id),
    })),
    cabosDiretos: cabos.filter((cabo) =>
      coordenador
        ? cabo.parent_id === coordenador.id
        : !cabo.parent_id || (!liderIds.has(cabo.parent_id) && !coordIds.has(cabo.parent_id)),
    ),
  });

  const grupos = coordenadores.map((coordenador) =>
    montar(
      coordenador,
      lideres.filter((lider) => lider.parent_id === coordenador.id),
    ),
  );
  const lideresAvulsos = lideres.filter(
    (lider) => !lider.parent_id || !coordIds.has(lider.parent_id),
  );
  const avulsos = montar(null, lideresAvulsos);
  if (avulsos.lideres.length || avulsos.cabosDiretos.length) grupos.push(avulsos);
  return grupos;
}

const slug = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

export async function gerarContatosRegiaoPdf(args: {
  regiao: string;
  pessoas: PessoaContatoRegiao[];
  opcoes: OpcoesContatosRegiao;
}) {
  const selecionadas = filtrarContatosRegiao(args.pessoas, args.opcoes);
  if (!selecionadas.length)
    throw new Error("Selecione ao menos um tipo de contato com registros nesta regiao.");

  const [pdfModule, tableModule] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const jsPDF =
    (pdfModule as any).jsPDF || (pdfModule as any).default?.jsPDF || (pdfModule as any).default;
  const autoTable = (tableModule as any).default?.default || (tableModule as any).default;
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 38;
  const niveis = new Set(args.opcoes.niveis);
  const universo = args.pessoas.filter((p) => args.opcoes.incluirArquivados || !p.arquivado_em);
  const grupos = agruparContatosRegiao(universo);
  let y = 112;

  const cabecalho = () => {
    doc.setFillColor(15, 52, 120);
    doc.rect(0, 0, width, 76, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.text("LISTA DE CONTATOS", margin, 30);
    doc.setFontSize(11);
    doc.text(args.regiao, margin, 50);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(
      `Gerado em ${new Date().toLocaleDateString("pt-BR")} - ${selecionadas.length} contato(s)`,
      width - margin,
      50,
      { align: "right" },
    );
  };

  const novaPaginaSeNecessario = (altura = 60) => {
    if (y + altura <= height - 42) return;
    doc.addPage();
    cabecalho();
    y = 96;
  };

  const desenharGrupo = (
    titulo: string,
    contatos: Array<{ nivel: string; pessoa: PessoaContatoRegiao }>,
  ) => {
    if (!contatos.length) return;
    novaPaginaSeNecessario(85);
    doc.setFillColor(226, 232, 240);
    doc.roundedRect(margin, y, width - margin * 2, 28, 4, 4, "F");
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.text(titulo, margin + 10, y + 18);
    y += 36;

    const head = [
      "CARGO",
      "NOME",
      ...(args.opcoes.exibirTelefone ? ["TELEFONE"] : []),
      ...(args.opcoes.exibirEndereco ? ["ENDERECO"] : []),
    ];
    const body = contatos.map(({ nivel, pessoa }) => [
      nivel,
      pessoa.nome,
      ...(args.opcoes.exibirTelefone ? [formatarTelefoneContato(pessoa.telefone)] : []),
      ...(args.opcoes.exibirEndereco ? [formatarEnderecoContato(pessoa)] : []),
    ]);
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin, top: 92, bottom: 34 },
      head: [head],
      body,
      theme: "grid",
      showHead: "everyPage",
      styles: {
        font: "helvetica",
        fontSize: 8.2,
        cellPadding: 5,
        lineColor: [203, 213, 225],
        lineWidth: 0.4,
        overflow: "linebreak",
        valign: "middle",
      },
      headStyles: { fillColor: [30, 64, 175], textColor: [255, 255, 255], fontStyle: "bold" },
      columnStyles: args.opcoes.exibirEndereco
        ? {
            0: { cellWidth: 64, fontStyle: "bold" },
            1: { cellWidth: 122 },
            2: args.opcoes.exibirTelefone ? { cellWidth: 92 } : { cellWidth: 241 },
          }
        : { 0: { cellWidth: 74, fontStyle: "bold" }, 1: { cellWidth: 260 } },
      didDrawPage: (data: any) => {
        if (data.pageNumber > 1) cabecalho();
        doc.setTextColor(100, 116, 139);
        doc.setFontSize(8);
        doc.text(`Pagina ${doc.getNumberOfPages()}`, width - margin, height - 17, {
          align: "right",
        });
      },
    });
    y = ((doc as any).lastAutoTable?.finalY || y) + 16;
  };

  cabecalho();
  for (const grupo of grupos) {
    const contatos: Array<{ nivel: string; pessoa: PessoaContatoRegiao }> = [];
    if (grupo.coordenador && niveis.has("coordenador"))
      contatos.push({ nivel: "COORD.", pessoa: grupo.coordenador });
    for (const item of grupo.lideres) {
      if (niveis.has("lider")) contatos.push({ nivel: "LIDER", pessoa: item.lider });
      if (niveis.has("cabo"))
        item.cabos.forEach((pessoa) => contatos.push({ nivel: "  CABO", pessoa }));
    }
    if (niveis.has("cabo"))
      grupo.cabosDiretos.forEach((pessoa) => contatos.push({ nivel: "CABO DIRETO", pessoa }));
    desenharGrupo(
      grupo.coordenador ? `COORDENADOR: ${grupo.coordenador.nome}` : "SEM COORDENADOR / AVULSOS",
      contatos,
    );
  }

  doc.save(`contatos-${slug(args.regiao)}.pdf`);
  return { contatos: selecionadas.length };
}
