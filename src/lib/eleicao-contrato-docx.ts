// Geração de contratos em .docx para a Eleição (Coordenador, Líder, Cabo)
import { Document, Packer, Paragraph, TextRun, AlignmentType, Header, Footer, BorderStyle, ShadingType, PageNumber } from "docx";
import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client-selfhosted";

export type EleicaoTipo = "coordenador" | "lider" | "cabo";

export interface PessoaContratada {
  id: string;
  nome: string;
  tipo: EleicaoTipo;
  telefone: string;
  endereco: string;
  cidade: string | null;
  regiao: string | null;
  parent_id: string | null;
  valor_contratacao: number | null;
}

export interface ContractTemplate {
  id: string;
  tipo: string; // eleicao_coordenador | eleicao_lider | eleicao_cabo
  titulo: string;
  conteudo: string;
}

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Conversão simples de número para extenso (suficiente para valores típicos de contrato)
function valorPorExtenso(n: number): string {
  if (!n || n <= 0) return "zero reais";
  const inteiro = Math.floor(n);
  const centavos = Math.round((n - inteiro) * 100);
  let txt = numeroExtenso(inteiro) + (inteiro === 1 ? " real" : " reais");
  if (centavos > 0) txt += " e " + numeroExtenso(centavos) + (centavos === 1 ? " centavo" : " centavos");
  return txt;
}
function numeroExtenso(n: number): string {
  const u = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
  const dez = ["dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const dezenas = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const centenas = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];
  if (n === 0) return "zero";
  if (n === 100) return "cem";
  if (n < 10) return u[n];
  if (n < 20) return dez[n - 10];
  if (n < 100) {
    const d = Math.floor(n / 10), r = n % 10;
    return dezenas[d] + (r ? " e " + u[r] : "");
  }
  if (n < 1000) {
    const c = Math.floor(n / 100), r = n % 100;
    return centenas[c] + (r ? " e " + numeroExtenso(r) : "");
  }
  if (n < 1000000) {
    const m = Math.floor(n / 1000), r = n % 1000;
    const pref = m === 1 ? "mil" : numeroExtenso(m) + " mil";
    return pref + (r ? (r < 100 ? " e " : " ") + numeroExtenso(r) : "");
  }
  return String(n);
}

const REGIAO_LABEL: Record<string, string> = {
  centro: "Centro", segredo: "Segredo", prosa: "Prosa", bandeira: "Bandeira",
  anhanduizinho: "Anhanduizinho", lagoa: "Lagoa", moreninha: "Moreninha", imbirussu: "Imbirussu",
};

export function renderTemplate(
  template: ContractTemplate,
  pessoa: PessoaContratada,
  contratante: string,
  parents: Map<string, PessoaContratada>,
): string {
  const valor = pessoa.valor_contratacao || 0;
  const parent = pessoa.parent_id ? parents.get(pessoa.parent_id) : undefined;
  const lider = pessoa.tipo === "cabo" && parent?.tipo === "lider" ? parent.nome : "—";
  const coordenador =
    pessoa.tipo === "lider" && parent?.tipo === "coordenador" ? parent.nome :
    pessoa.tipo === "cabo" && parent?.tipo === "lider" && parent.parent_id
      ? (parents.get(parent.parent_id)?.nome ?? "—") : "—";

  const replacements: Record<string, string> = {
    nome: pessoa.nome,
    tipo: pessoa.tipo,
    telefone: pessoa.telefone || "—",
    endereco: pessoa.endereco || "—",
    cidade: pessoa.cidade || "—",
    regiao: pessoa.regiao ? (REGIAO_LABEL[pessoa.regiao] ?? pessoa.regiao) : "—",
    lider, coordenador,
    valor: fmtBRL(valor),
    valor_extenso: valorPorExtenso(valor),
    contratante,
    data: new Date().toLocaleDateString("pt-BR"),
  };

  return template.conteudo.replace(/\{(\w+)\}/g, (_m, k) => replacements[k] ?? `{${k}}`);
}

// Esquema visual por tipo — cada cargo tem cor, faixa, rodapé e selo distintos
const TIPO_THEME: Record<EleicaoTipo, {
  label: string;
  color: string;       // hex sem #
  shading: string;     // hex sem # (fundo da faixa do título)
  fontTitle: string;
  fontBody: string;
}> = {
  coordenador: {
    label: "COORDENAÇÃO DE CAMPANHA",
    color: "B91C1C",         // vermelho institucional
    shading: "FEE2E2",
    fontTitle: "Georgia",
    fontBody: "Georgia",
  },
  lider: {
    label: "LIDERANÇA REGIONAL",
    color: "1D4ED8",         // azul institucional
    shading: "DBEAFE",
    fontTitle: "Calibri",
    fontBody: "Calibri",
  },
  cabo: {
    label: "CABO ELEITORAL",
    color: "111827",
    shading: "F3F4F6",
    fontTitle: "Arial",
    fontBody: "Arial",
  },
};

export async function gerarContratoDocxBlob(
  template: ContractTemplate,
  pessoa: PessoaContratada,
  contratante: string,
  parents: Map<string, PessoaContratada>,
): Promise<Blob> {
  const texto = renderTemplate(template, pessoa, contratante, parents);
  const linhas = texto.split("\n");
  const theme = TIPO_THEME[pessoa.tipo];

  // Faixa colorida no topo (header) com tipo do contrato
  const headerStripe = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 0 },
    shading: { type: ShadingType.CLEAR, color: "auto", fill: theme.color },
    border: {
      top:    { style: BorderStyle.SINGLE, size: 4, color: theme.color },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: theme.color },
      left:   { style: BorderStyle.SINGLE, size: 4, color: theme.color },
      right:  { style: BorderStyle.SINGLE, size: 4, color: theme.color },
    },
    children: [new TextRun({
      text: `  ${theme.label}  `,
      bold: true,
      color: "FFFFFF",
      size: 22,
      font: theme.fontTitle,
    })],
  });

  const headerSubtitle = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 60, after: 0 },
    children: [new TextRun({
      text: contratante,
      size: 16,
      color: "6B7280",
      font: theme.fontBody,
    })],
  });

  // Rodapé com selo de identificação visual
  const footerLine = new Paragraph({
    alignment: AlignmentType.CENTER,
    border: { top: { style: BorderStyle.SINGLE, size: 6, color: theme.color, space: 4 } },
    spacing: { before: 60, after: 0 },
    children: [
      new TextRun({ text: `${theme.label} · `, bold: true, color: theme.color, size: 16, font: theme.fontBody }),
      new TextRun({ text: pessoa.nome, size: 16, color: "374151", font: theme.fontBody }),
      new TextRun({ text: "   ·   Página ", size: 16, color: "9CA3AF", font: theme.fontBody }),
      new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "9CA3AF", font: theme.fontBody }),
    ],
  });

  const doc = new Document({
    styles: {
      default: { document: { run: { font: theme.fontBody, size: 22 } } },
    },
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1800, right: 1440, bottom: 1440, left: 1440, header: 720, footer: 720 },
          borders: {
            // Borda interna sutil em todo o documento, na cor do cargo
            pageBorderTop:    { style: BorderStyle.SINGLE, size: 8, color: theme.color, space: 24 },
            pageBorderBottom: { style: BorderStyle.SINGLE, size: 8, color: theme.color, space: 24 },
            pageBorderLeft:   { style: BorderStyle.SINGLE, size: 8, color: theme.color, space: 24 },
            pageBorderRight:  { style: BorderStyle.SINGLE, size: 8, color: theme.color, space: 24 },
          },
        },
      },
      headers: { default: new Header({ children: [headerStripe, headerSubtitle] }) },
      footers: { default: new Footer({ children: [footerLine] }) },
      children: [
        // Selo grande no início — facilita identificação visual ao folhear
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 240, after: 120 },
          shading: { type: ShadingType.CLEAR, color: "auto", fill: theme.shading },
          border: {
            top: { style: BorderStyle.SINGLE, size: 12, color: theme.color },
            bottom: { style: BorderStyle.SINGLE, size: 12, color: theme.color },
            left: { style: BorderStyle.SINGLE, size: 12, color: theme.color },
            right: { style: BorderStyle.SINGLE, size: 12, color: theme.color },
          },
          children: [new TextRun({
            text: `   ${theme.label}   `,
            bold: true,
            color: theme.color,
            size: 28,
            font: theme.fontTitle,
          })],
        }),
        ...linhas.map((linha, i) => {
          if (i === 0 && linha.trim()) {
            return new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 240, after: 240 },
              children: [new TextRun({ text: linha, bold: true, size: 28, color: theme.color, font: theme.fontTitle })],
            });
          }
          return new Paragraph({
            spacing: { after: 120 },
            alignment: AlignmentType.JUSTIFIED,
            children: [new TextRun({ text: linha || " ", font: theme.fontBody })],
          });
        }),
      ],
    }],
  });

  return await Packer.toBlob(doc);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function tipoToTemplateKey(tipo: EleicaoTipo): string {
  return `eleicao_${tipo}`;
}

export async function fetchTemplatesAndContext(clientId: string) {
  const [tplRes, clientRes, peopleRes] = await Promise.all([
    supabase.from("contract_templates").select("id,tipo,titulo,conteudo")
      .eq("client_id", clientId)
      .in("tipo", ["eleicao_coordenador", "eleicao_lider", "eleicao_cabo"]),
    supabase.from("clients").select("name").eq("id", clientId).maybeSingle(),
    supabase.from("eleicao_pessoas" as any).select("id,nome,tipo,telefone,endereco,cidade,regiao,parent_id,valor_contratacao")
      .eq("client_id", clientId),
  ]);

  const templates = (tplRes.data || []) as ContractTemplate[];
  const tplByTipo = new Map<string, ContractTemplate>();
  for (const t of templates) tplByTipo.set(t.tipo, t);
  const parents = new Map<string, PessoaContratada>();
  for (const p of (peopleRes.data || []) as any[]) parents.set(p.id, p);

  return {
    templates,
    tplByTipo,
    contratante: clientRes.data?.name || "Campanha",
    parents,
  };
}

export async function gerarLoteZip(
  pessoas: PessoaContratada[],
  clientId: string,
): Promise<{ blob: Blob; pulados: string[] }> {
  const { tplByTipo, contratante, parents } = await fetchTemplatesAndContext(clientId);
  const zip = new JSZip();
  const pulados: string[] = [];
  for (const p of pessoas) {
    const tpl = tplByTipo.get(tipoToTemplateKey(p.tipo));
    if (!tpl) { pulados.push(p.nome); continue; }
    const blob = await gerarContratoDocxBlob(tpl, p, contratante, parents);
    const safe = p.nome.replace(/[^\w\s-]/g, "").trim();
    zip.file(`Contrato - ${safe}.docx`, blob);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  return { blob, pulados };
}

export async function gerarContratoIndividual(
  pessoa: PessoaContratada,
  clientId: string,
): Promise<void> {
  const { tplByTipo, contratante, parents } = await fetchTemplatesAndContext(clientId);
  const tpl = tplByTipo.get(tipoToTemplateKey(pessoa.tipo));
  if (!tpl) throw new Error(`Modelo de contrato não encontrado para tipo ${pessoa.tipo}`);
  const blob = await gerarContratoDocxBlob(tpl, pessoa, contratante, parents);
  const safe = pessoa.nome.replace(/[^\w\s-]/g, "").trim();
  downloadBlob(blob, `Contrato - ${safe}.docx`);
}
