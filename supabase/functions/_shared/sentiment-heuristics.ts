export type SentimentLabel = 'positive' | 'negative' | 'neutral';

const DIRECT_NEGATIVE_PATTERNS = [
  /\b(vergonha|vergonhoso|ridiculo|ridicula|palhaco|palhaca|lixo|pessimo|pessima|horrivel|incompetente|mentiroso|mentirosa|corrupto|corrupta|safado|safada|bandido|bandida)\b/,
  /\b(nao faz nada|so promessa|so enrola|nunca faz|abandonad[oa]|descaso|falta de respeito|pior prefeito|pior veread[oa]r|cad[ee])\b/,
  /\b(ta de brincadeira|que piada|me poupe|piada pronta)\b/,
  /🤡|🤮|💩|👎|😡/,
];

const CIVIC_NEUTRAL_PATTERNS = [
  /\b(queremos|precisamos|esperamos|aguardamos|gostariamos|seria importante|seria bom|poderia|podia|tomara|seguimos esperando)\b.{0,50}\b(melhoria|melhorias|resultado|resultados|bairro|rua|regiao|comunidade|iluminacao|asfalto|cascalhamento|patrolamento|saude|escola|creche|seguranca|apoio|atendimento|obra|obras|acao|acoes)\b/,
  /\b(nos precisamos|precisamos no bairro|queremos no bairro|nosso bairro precisa|precisa no bairro|leva para o bairro|traz para o bairro)\b/,
  /\b(queremos melhorias|esperamos resultados|aguardamos retorno|precisamos disso aqui)\b/,
];

const PRACTICAL_QUESTION_PATTERNS = [
  /\b(como faz|como fazer|como participar|como se inscrever|onde e|que horas|qual horario|tem link|tem endereco|posso levar|qual local|onde vai ser)\b/,
];

const EVENT_POST_PATTERNS = [
  /\b(evento|inscric|convite|seminario|audiencia|reuniao|visita|mutirao|encontro|acao|programa|cadastro|atendimento)\b/,
];

const POSITIVE_PATTERNS = [
  /\b(parabens|obrigado|gratid[aã]o|deus abencoe|tamo junto|tmj|conte comigo|orgulho|excelente|muito bom|bom trabalho|forca|vai dar certo|nosso proximo)\b/,
  /❤️|👏|🙏|💪|🔥|✅|💙|💚|😍|🥰|👍/,
];

const TAG_ONLY_PATTERN = /^(@[\w._]+\s*)+$/;

function normalize(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

export function inferHeuristicSentiment(text: string, postMessage?: string | null): SentimentLabel | null {
  const normalizedText = normalize(text);
  const normalizedPost = normalize(postMessage);

  if (!normalizedText) return 'neutral';
  if (TAG_ONLY_PATTERN.test(normalizedText)) return 'neutral';

  const hasDirectNegative = matchesAny(normalizedText, DIRECT_NEGATIVE_PATTERNS) || matchesAny(text, DIRECT_NEGATIVE_PATTERNS);
  if (hasDirectNegative) return 'negative';

  const isPracticalQuestion = matchesAny(normalizedText, PRACTICAL_QUESTION_PATTERNS) && matchesAny(normalizedPost, EVENT_POST_PATTERNS);
  if (isPracticalQuestion) return 'neutral';

  const isCivicNeutral = matchesAny(normalizedText, CIVIC_NEUTRAL_PATTERNS);
  if (isCivicNeutral) return 'neutral';

  const hasPositiveSignal = matchesAny(normalizedText, POSITIVE_PATTERNS) || matchesAny(text, POSITIVE_PATTERNS);
  if (hasPositiveSignal) return 'positive';

  return null;
}

export function applyHeuristicGuard(
  modelSentiment: SentimentLabel,
  text: string,
  postMessage?: string | null,
): SentimentLabel {
  const heuristic = inferHeuristicSentiment(text, postMessage);

  if (!heuristic) return modelSentiment;

  if (modelSentiment === 'negative' && heuristic !== 'negative') {
    return heuristic;
  }

  if (heuristic === 'neutral' && modelSentiment === 'positive') {
    return 'neutral';
  }

  return modelSentiment;
}