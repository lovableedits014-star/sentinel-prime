// Geração de contratos em .docx para a Eleição (Coordenador, Líder, Cabo)
// Diferenciação visual pensada para impressão preto e branco:
// - Formas e símbolos diferentes (★ / ▌ / ·)
// - Estilos de borda diferentes (dupla / sólida grossa / pontilhada)
// - Fontes diferentes (serif / sans / sans condensada)
// - Monograma grande (C / L / E) no topo
// - Tons de cinza distintos para o cabeçalho
import {
  Document, Packer, Paragraph, TextRun, AlignmentType, Header, Footer,
  BorderStyle, ShadingType, PageNumber,
} from "docx";
import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client-selfhosted";

export type EleicaoTipo = "coordenador" | "lider" | "cabo";
export type DocKind = "contrato" | "distrato";
export type DocModo = "contrato" | "distrato" | "ambos";

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
  is_voluntario?: boolean | null;
  rua?: string | null;
  numero?: string | null;
  bairro?: string | null;
  vigencia_inicio?: string | null;
  vigencia_fim?: string | null;
}

export interface ContractTemplate {
  id: string;
  tipo: string;
  titulo: string;
  conteudo: string;
}


const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

// ─── Esquema visual por tipo (preto e branco, formas distintas) ───────────────
type Theme = {
  label: string;        // título principal
  prefix: string;       // prefixo do nome no arquivo
  monogram: string;     // letra grande no topo
  symbol: string;       // símbolo lateral (★, ▌, ·)
  fontTitle: string;
  fontBody: string;
  // tons de cinza
  bandFill: string;     // cor de fundo da faixa do header
  bandText: string;     // cor do texto na faixa
  sealFill: string;     // cor de fundo do selo grande
  sealText: string;     // cor do texto do selo
  // estilo das bordas
  borderStyle: typeof BorderStyle.SINGLE | typeof BorderStyle.DOUBLE | typeof BorderStyle.THICK | typeof BorderStyle.DOTTED | typeof BorderStyle.DASHED;
  borderSize: number;
  // rodapé
  footerBorderStyle: typeof BorderStyle.SINGLE | typeof BorderStyle.DOUBLE | typeof BorderStyle.DOTTED;
  footerBorderSize: number;
};

const TIPO_THEME: Record<EleicaoTipo, Theme> = {
  coordenador: {
    label: "★ COORDENAÇÃO DE CAMPANHA ★",
    prefix: "Coordenador",
    monogram: "C",
    symbol: "★",
    fontTitle: "Georgia",
    fontBody: "Georgia",
    bandFill: "000000",        // faixa preta
    bandText: "FFFFFF",
    sealFill: "000000",
    sealText: "FFFFFF",
    borderStyle: BorderStyle.DOUBLE,
    borderSize: 18,            // borda dupla bem grossa
    footerBorderStyle: BorderStyle.DOUBLE,
    footerBorderSize: 12,
  },
  lider: {
    label: "▌▌▌  LIDERANÇA REGIONAL  ▌▌▌",
    prefix: "Lider",
    monogram: "L",
    symbol: "▌",
    fontTitle: "Arial Black",
    fontBody: "Calibri",
    bandFill: "595959",        // faixa cinza médio
    bandText: "FFFFFF",
    sealFill: "D9D9D9",        // selo cinza claro
    sealText: "000000",
    borderStyle: BorderStyle.THICK,
    borderSize: 18,            // sólida bem grossa
    footerBorderStyle: BorderStyle.SINGLE,
    footerBorderSize: 18,
  },
  cabo: {
    label: "· · ·  CABO ELEITORAL  · · ·",
    prefix: "Cabo",
    monogram: "E",
    symbol: "·",
    fontTitle: "Arial Narrow",
    fontBody: "Arial",
    bandFill: "FFFFFF",        // sem faixa cheia
    bandText: "000000",
    sealFill: "FFFFFF",
    sealText: "000000",
    borderStyle: BorderStyle.DOTTED,
    borderSize: 8,             // pontilhada fina
    footerBorderStyle: BorderStyle.DOTTED,
    footerBorderSize: 6,
  },
};

function fileNameFor(pessoa: PessoaContratada): string {
  const t = TIPO_THEME[pessoa.tipo];
  const safe = pessoa.nome.replace(/[^\w\s-]/g, "").trim();
  return `${t.prefix} ${safe}.docx`;
}

export async function gerarContratoDocxBlob(
  template: ContractTemplate,
  pessoa: PessoaContratada,
  contratante: string,
  parents: Map<string, PessoaContratada>,
): Promise<Blob> {
  const texto = renderTemplate(template, pessoa, contratante, parents);
  const linhas = texto.split("\n");
  const theme = TIPO_THEME[pessoa.tipo];

  // Faixa do header (estilo varia: preta sólida / cinza / sem fundo)
  const headerStripe = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 0 },
    shading: { type: ShadingType.CLEAR, color: "auto", fill: theme.bandFill },
    border: {
      top:    { style: theme.borderStyle, size: theme.borderSize, color: "000000" },
      bottom: { style: theme.borderStyle, size: theme.borderSize, color: "000000" },
      left:   { style: theme.borderStyle, size: theme.borderSize, color: "000000" },
      right:  { style: theme.borderStyle, size: theme.borderSize, color: "000000" },
    },
    children: [new TextRun({
      text: `  ${theme.label}  `,
      bold: true,
      color: theme.bandText,
      size: 22,
      font: theme.fontTitle,
      allCaps: true,
    })],
  });

  const headerSubtitle = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 80, after: 0 },
    children: [new TextRun({
      text: contratante,
      size: 16,
      color: "000000",
      font: theme.fontBody,
      italics: pessoa.tipo === "coordenador",
    })],
  });

  // Rodapé com estilo de borda diferente por tipo
  const footerLine = new Paragraph({
    alignment: AlignmentType.CENTER,
    border: { top: { style: theme.footerBorderStyle, size: theme.footerBorderSize, color: "000000", space: 4 } },
    spacing: { before: 80, after: 0 },
    children: [
      new TextRun({ text: `${theme.symbol} ${theme.prefix.toUpperCase()} `, bold: true, color: "000000", size: 16, font: theme.fontTitle }),
      new TextRun({ text: pessoa.nome, size: 16, color: "000000", font: theme.fontBody }),
      new TextRun({ text: `   ${theme.symbol}   Página `, size: 16, color: "000000", font: theme.fontBody }),
      new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "000000", font: theme.fontBody }),
    ],
  });

  // (selo removido — a faixa já aparece no cabeçalho)

  const doc = new Document({
    styles: {
      default: { document: { run: { font: theme.fontBody, size: 22 } } },
    },
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1800, right: 1440, bottom: 1440, left: 1440, header: 720, footer: 720 },
          // borda de página com estilo diferente por tipo (tripla camada visual)
          borders: {
            pageBorderTop:    { style: theme.borderStyle, size: theme.borderSize, color: "000000", space: 24 },
            pageBorderBottom: { style: theme.borderStyle, size: theme.borderSize, color: "000000", space: 24 },
            pageBorderLeft:   { style: theme.borderStyle, size: theme.borderSize, color: "000000", space: 24 },
            pageBorderRight:  { style: theme.borderStyle, size: theme.borderSize, color: "000000", space: 24 },
          },
        },
      },
      headers: { default: new Header({ children: [headerStripe, headerSubtitle] }) },
      footers: { default: new Footer({ children: [footerLine] }) },
      children: [
        
        ...linhas.map((linha, i) => {
          if (i === 0 && linha.trim()) {
            return new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 120, after: 240 },
              children: [new TextRun({
                text: linha,
                bold: true,
                size: 28,
                color: "000000",
                font: theme.fontTitle,
                allCaps: pessoa.tipo === "coordenador",
              })],
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
    supabase.from("eleicao_pessoas" as any).select("id,nome,tipo,telefone,endereco,cidade,regiao,parent_id,valor_contratacao,is_voluntario")
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
    if (p.is_voluntario) continue;
    const tpl = tplByTipo.get(tipoToTemplateKey(p.tipo));
    if (!tpl) { pulados.push(p.nome); continue; }
    const blob = await gerarContratoDocxBlob(tpl, p, contratante, parents);
    zip.file(fileNameFor(p), blob);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  return { blob, pulados };
}

export async function gerarContratoIndividual(
  pessoa: PessoaContratada,
  clientId: string,
): Promise<void> {
  const { tplByTipo, contratante, parents } = await fetchTemplatesAndContext(clientId);
  if (pessoa.is_voluntario) throw new Error(`${pessoa.nome} é voluntário(a) e não gera contrato de custo.`);
  const tpl = tplByTipo.get(tipoToTemplateKey(pessoa.tipo));
  if (!tpl) throw new Error(`Modelo de contrato não encontrado para tipo ${pessoa.tipo}`);
  const blob = await gerarContratoDocxBlob(tpl, pessoa, contratante, parents);
  downloadBlob(blob, fileNameFor(pessoa));
}
