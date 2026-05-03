/**
 * Geração de prompt para arte de divulgação de feriados / datas comemorativas.
 * Estilo padrão: Institucional / candidato (foto-realista, sóbrio, espaço para nome e logo).
 *
 * Saída pensada para colar no ChatGPT / DALL·E / Midjourney / Nano Banana etc.
 */
import { SUGESTOES_FERIADO } from "@/lib/sugestoes-tema";

export type ContextoArte = {
  nomeCandidato?: string;
  cargo?: string; // ex: "Vereador", "Prefeito"
  cidade?: string;
  paletaCores?: string; // ex: "azul royal e branco"
};

/** Detalhes visuais por feriado conhecido (cenário, símbolos, tom). */
const VISUAL_FERIADO: { match: RegExp; cenario: string; simbolos: string; tom: string }[] = [
  { match: /confraterniza/i,                 cenario: "céu noturno com fogos de artifício suaves ao fundo",                            simbolos: "champanhe, contagem regressiva, ano novo em destaque",            tom: "esperançoso, celebrativo, balanço positivo" },
  { match: /carnaval/i,                       cenario: "ambiente festivo com confetes e serpentinas em desfoque",                        simbolos: "máscara veneziana discreta, serpentinas",                          tom: "leve e responsável, mensagem de segurança e diversão consciente" },
  { match: /sexta.*santa|paix[ãa]o/i,         cenario: "luz natural suave, atmosfera de recolhimento, fundo sóbrio",                     simbolos: "cruz simples, pão e cálice sutis, sem sensacionalismo",            tom: "respeitoso, contemplativo, fé" },
  { match: /p[áa]scoa/i,                       cenario: "manhã clara com tons pastel, ovos decorados discretos",                          simbolos: "ovo de páscoa, ramos floridos, coelho estilizado opcional",        tom: "renovação, esperança, família" },
  { match: /tiradentes/i,                     cenario: "ambiente histórico, tons terrosos, bandeira de Minas ao fundo",                  simbolos: "bandeira do Brasil, referência sutil ao busto de Tiradentes",      tom: "patriótico, reverente, valorização da história nacional" },
  { match: /trabalhador|trabalho/i,           cenario: "trabalhadores diversos (uniforme, escritório, campo) em primeiro plano",         simbolos: "ferramentas de trabalho, mãos calejadas, mosaico de profissões",   tom: "valorização do trabalho, dignidade, reconhecimento" },
  { match: /corpus christi/i,                  cenario: "tapete de serragem colorido em rua de pequena cidade",                           simbolos: "óstia estilizada, flores, vela acesa",                             tom: "religioso, comunitário, respeitoso" },
  { match: /independ[êe]ncia/i,                cenario: "céu azul aberto com bandeira do Brasil tremulando ao vento",                     simbolos: "bandeira do Brasil grande, verde e amarelo dominantes",            tom: "patriótico, cívico, orgulho nacional" },
  { match: /aparecida|padroeira/i,             cenario: "santuário ao fundo desfocado, luz dourada suave",                                simbolos: "imagem discreta de N. Sra. Aparecida, rosário, vela",              tom: "devocional, respeitoso, fé católica" },
  { match: /crian[çc]a/i,                      cenario: "crianças sorrindo brincando em parque ensolarado",                               simbolos: "balões coloridos, brinquedos clássicos, mãos dadas",               tom: "alegre, protetor, foco em educação e infância" },
  { match: /finados/i,                         cenario: "cemitério tranquilo com flores, luz suave de fim de tarde",                      simbolos: "vela acesa, flores brancas, sem imagens fortes",                   tom: "respeitoso, reflexivo, sem comemoração" },
  { match: /proclama[çc][ãa]o.*rep[úu]blica/i, cenario: "praça pública com prédio histórico, bandeira tremulando",                        simbolos: "bandeira do Brasil, livro da constituição estilizado",             tom: "cívico, valorização da democracia e instituições" },
  { match: /consci[êe]ncia negra/i,            cenario: "retrato de pessoas negras de diferentes idades, iluminação dourada",             simbolos: "padrão geométrico afro-brasileiro, mãos unidas",                   tom: "respeito, valorização cultural, igualdade racial" },
  { match: /natal/i,                           cenario: "sala iluminada por luzes quentes, árvore de natal ao fundo",                     simbolos: "estrela, presente envolto, vela",                                  tom: "paz, gratidão, união familiar" },
  { match: /m[ãa]e/i,                           cenario: "mãe e filho(a) abraçados em ambiente acolhedor",                                 simbolos: "flores (rosas), mãos entrelaçadas",                                tom: "afetivo, valorização da maternidade" },
  { match: /pai/i,                             cenario: "pai e filho(a) em momento cotidiano, luz natural",                                simbolos: "abraço, ferramenta de trabalho do pai",                            tom: "afetivo, paternidade ativa, responsabilidade familiar" },
];

function getVisual(text: string) {
  for (const v of VISUAL_FERIADO) if (v.match.test(text)) return v;
  return {
    cenario: "ambiente brasileiro relacionado à data, iluminação natural, fundo limpo",
    simbolos: "elementos visuais clássicos da data (sutis, sem exageros)",
    tom: "respeitoso, alinhado ao espírito da data",
  };
}

function dataFormatada(dateStr?: string): string | null {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", timeZone: "UTC" });
}

/**
 * Monta prompt institucional pronto para colar no ChatGPT/DALL·E.
 * Estilo: foto-realista sóbrio, com espaço reservado para nome do candidato + logo.
 */
export function buildPromptArteFeriado(
  feriado: { localName: string; name?: string; date?: string },
  ctx: ContextoArte = {},
): string {
  const text = `${feriado.localName} ${feriado.name ?? ""}`;
  const v = getVisual(text);
  const sug = SUGESTOES_FERIADO.find((s) => s.match.test(text));
  const dataLabel = dataFormatada(feriado.date);

  const candidato = ctx.nomeCandidato?.trim();
  const cargo = ctx.cargo?.trim();
  const cidade = ctx.cidade?.trim();
  const paleta = ctx.paletaCores?.trim() || "azul royal, branco e dourado discreto";

  const linhaCandidato = candidato
    ? `- Identidade: arte assinada por ${candidato}${cargo ? ` (${cargo})` : ""}${cidade ? ` — ${cidade}` : ""}.`
    : `- Identidade: deixar área inferior livre para inserir nome do candidato e logo (não escrever nomes fictícios).`;

  const linhaTema = sug
    ? `- Mensagem-chave sugerida: "${sug.tema}".`
    : `- Mensagem-chave: alinhada ao espírito da data, sem promessas eleitorais.`;

  return [
    `Crie uma arte institucional de divulgação para a data "${feriado.localName}"${dataLabel ? ` (${dataLabel})` : ""}.`,
    ``,
    `ESTILO VISUAL`,
    `- Foto-realista, iluminação cinematográfica suave, alta qualidade, 4K.`,
    `- Composição limpa, hierarquia clara, profissional e sóbria — adequada para um perfil político institucional.`,
    `- Paleta de cores: ${paleta}. Evitar tons que conflitem com bandeiras partidárias adversárias.`,
    ``,
    `CONTEÚDO DA CENA`,
    `- Cenário: ${v.cenario}.`,
    `- Elementos simbólicos (sutis, sem exagero): ${v.simbolos}.`,
    `- Tom emocional: ${v.tom}.`,
    ``,
    `TIPOGRAFIA E TEXTO`,
    `- Título grande e legível com o nome da data: "${feriado.localName.toUpperCase()}".`,
    `- Subtítulo curto (1 linha) com mensagem positiva e respeitosa, em português do Brasil.`,
    `- Tipografia sem-serifa moderna, alto contraste com o fundo.`,
    `- Reservar 20% inferior da arte como faixa para assinatura (nome + logo).`,
    ``,
    `IDENTIDADE E REGRAS`,
    linhaCandidato,
    linhaTema,
    `- Não usar logotipos partidários. Não usar bandeiras de outros países.`,
    `- Não inserir números eleitorais nem pedidos explícitos de voto (período não eleitoral).`,
    `- Sem rostos de pessoas reais identificáveis (use figuras genéricas brasileiras, diversidade representada).`,
    `- Texto sem erros de ortografia em português; revisar cada palavra antes de finalizar.`,
    ``,
    `FORMATOS DE ENTREGA`,
    `- Versão 1: 1080x1350 (feed Instagram, vertical).`,
    `- Versão 2: 1080x1920 (story Instagram/WhatsApp).`,
    `- Versão 3: 1200x630 (Facebook/LinkedIn, horizontal).`,
  ].join("\n");
}

/** Variante para quando não há feriado no dia, mas há tema do mês. */
export function buildPromptArteTemaMes(
  tema: { titulo: string; descricao: string; emoji?: string },
  ctx: ContextoArte = {},
): string {
  const candidato = ctx.nomeCandidato?.trim();
  const cargo = ctx.cargo?.trim();
  const cidade = ctx.cidade?.trim();
  const paleta = ctx.paletaCores?.trim() || "azul royal, branco e dourado discreto";

  const linhaCandidato = candidato
    ? `- Identidade: arte assinada por ${candidato}${cargo ? ` (${cargo})` : ""}${cidade ? ` — ${cidade}` : ""}.`
    : `- Identidade: deixar área inferior livre para inserir nome do candidato e logo.`;

  return [
    `Crie uma arte institucional de divulgação para o tema do mês: "${tema.titulo}".`,
    `Contexto: ${tema.descricao}`,
    ``,
    `ESTILO VISUAL`,
    `- Foto-realista, iluminação cinematográfica suave, alta qualidade, 4K.`,
    `- Composição profissional, sóbria e otimista, adequada para perfil político institucional.`,
    `- Paleta de cores: ${paleta}.`,
    ``,
    `TIPOGRAFIA`,
    `- Título grande: "${tema.titulo.toUpperCase()}".`,
    `- Subtítulo curto em português do Brasil reforçando a mensagem do mês.`,
    `- Tipografia sem-serifa moderna, alto contraste, leitura fácil em mobile.`,
    ``,
    `REGRAS`,
    linhaCandidato,
    `- Sem logotipos partidários, sem números eleitorais, sem rostos reais identificáveis.`,
    `- Sem promessas eleitorais; tom de gestão e cuidado.`,
    `- Reservar 20% inferior para assinatura (nome + logo).`,
    ``,
    `FORMATOS`,
    `- 1080x1350 (feed), 1080x1920 (story), 1200x630 (Facebook/LinkedIn).`,
  ].join("\n");
}