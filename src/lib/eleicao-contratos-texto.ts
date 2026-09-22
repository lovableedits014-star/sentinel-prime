import {
  fetchTemplatesAndContext,
  renderTemplate,
  tipoToTemplateKey,
  type PessoaContratada,
} from "@/lib/eleicao-contrato-docx";

export interface CaboContratoTexto {
  id: string;
  nome: string;
  telefone: string;
  rua: string;
  numero: string;
  bairro: string;
  cpf: string;
}

const telefoneLinha = (valor: string) => valor.replace(/\D/g, "").length >= 10;

function limparLinha(valor: string) {
  return valor
    .replace(/&#x20;|&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+\.$/, ".");
}

function separarEndereco(linhas: string[]) {
  if (!linhas.length) return { rua: "", numero: "", bairro: "" };
  const bairro = linhas.length > 1 ? linhas.at(-1)!.replace(/\.$/, "").trim() : "";
  const endereco = (linhas.length > 1 ? linhas.slice(0, -1) : linhas).join(" ").trim();
  const match = endereco.match(
    /^(.*?)(?:,?\s+)(\d+[A-Za-z]?(?:\s+(?:casa|apto|apartamento|fundos)\s*\w+)?)$/i,
  );
  return match
    ? { rua: match[1].trim(), numero: match[2].trim(), bairro }
    : { rua: endereco, numero: "", bairro };
}

export function analisarListaContratos(texto: string): CaboContratoTexto[] {
  const linhas = texto.split(/\r?\n/).map(limparLinha).filter(Boolean);
  const telefones = linhas
    .map((linha, indice) => (telefoneLinha(linha) ? indice : -1))
    .filter((indice) => indice >= 0);

  return telefones.flatMap((indiceTelefone, posicao) => {
    const nome = linhas[indiceTelefone - 1] || "";
    if (!nome || telefoneLinha(nome)) return [];
    const proximoTelefone = telefones[posicao + 1];
    const fim =
      proximoTelefone == null ? linhas.length : Math.max(indiceTelefone + 1, proximoTelefone - 1);
    const { rua, numero, bairro } = separarEndereco(linhas.slice(indiceTelefone + 1, fim));
    return [
      {
        id: `texto-${posicao + 1}`,
        nome,
        telefone: linhas[indiceTelefone].replace(/^cel\.?\s*/i, "").trim(),
        rua,
        numero,
        bairro,
        cpf: "",
      },
    ];
  });
}

const escaparHtml = (valor: string) =>
  valor.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[char]!,
  );

export async function imprimirContratosCabosTexto(
  cabos: CaboContratoTexto[],
  clientId: string,
  opcoes: { valor: number; vigenciaInicio: string; vigenciaFim: string },
) {
  const janela = window.open("", "_blank");
  if (!janela) throw new Error("Autorize pop-ups para abrir os contratos para impressão.");
  janela.document.write("<p style='font-family:Arial;padding:24px'>Preparando contratos...</p>");

  try {
    const { tplByTipo, contratante, parents } = await fetchTemplatesAndContext(clientId);
    const template = tplByTipo.get(tipoToTemplateKey("cabo", "contrato"));
    if (!template)
      throw new Error('Modelo de cabo não encontrado. Configure-o em "Modelos de contrato".');

    const paginas = cabos.map((cabo) => {
      const pessoa: PessoaContratada = {
        id: cabo.id,
        nome: cabo.nome,
        tipo: "cabo",
        telefone: cabo.telefone,
        endereco: [cabo.rua, cabo.numero].filter(Boolean).join(", "),
        rua: cabo.rua,
        numero: cabo.numero,
        bairro: cabo.bairro,
        cpf: cabo.cpf,
        cidade: "Campo Grande",
        regiao: null,
        parent_id: null,
        valor_contratacao: opcoes.valor || null,
        vigencia_inicio: opcoes.vigenciaInicio || null,
        vigencia_fim: opcoes.vigenciaFim || null,
      };
      const linhas = renderTemplate(template, pessoa, contratante, parents).split("\n");
      return `<section class="contrato">${linhas
        .map((linha, indice) =>
          indice === 0
            ? `<h1>${escaparHtml(linha)}</h1>`
            : `<p>${linha.trim() ? escaparHtml(linha) : "&nbsp;"}</p>`,
        )
        .join("")}</section>`;
    });

    janela.document.open();
    janela.document
      .write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Contratos de cabos eleitorais</title><style>
      @page { size: A4; margin: 8mm 10mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #000; font-family: Arial, sans-serif; }
      .contrato { break-after: page; page-break-after: always; min-height: 275mm; }
      .contrato:last-child { break-after: auto; page-break-after: auto; }
      h1 { margin: 0 0 7px; text-align: center; font-size: 10pt; line-height: 1.1; }
      p { margin: 0 0 4px; font-size: 7.5pt; line-height: 1.16; text-align: justify; white-space: pre-wrap; }
      @media screen { body { background: #ddd; } .contrato { width: 210mm; margin: 12px auto; padding: 8mm 10mm; background: white; box-shadow: 0 1px 8px #777; } }
      @media print { .contrato { padding: 0; } }
    </style></head><body>${paginas.join("")}<script>window.onload=()=>setTimeout(()=>window.print(),250);<\/script></body></html>`);
    janela.document.close();
  } catch (error) {
    janela.close();
    throw error;
  }
}
