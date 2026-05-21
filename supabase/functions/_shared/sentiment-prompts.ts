// Prompts e parsers para classificação de sentimento com Chain-of-Thought.
// A IA é forçada a identificar:
//   - postura do POST  (denuncia, conquista, convite, opiniao, neutro)
//   - alvo do COMENTÁRIO (candidato, fato_do_post, terceiro, ambiguo)
//   - alinhamento     (concorda, discorda, neutro)
// E só então decide o sentimento final.

import type { LLMMessage } from './llm-router.ts';

export type Sentiment = 'positive' | 'negative' | 'neutral';

export interface SentimentAnalysisResult {
  sentiment: Sentiment;
  confidence: number;
  reason: string;
  postStance: string;
  target: string;
  alignment: string;
}

export interface CandidateCtx {
  candidato: string;
  cargo: string;
}

const DENUNCIATION_POST_HINTS = [
  'defesa de', 'defendi', 'fiz a defesa', 'em defesa',
  'luta contra', 'lutar por', 'lutando por', 'não podemos aceitar',
  'absurdo que', 'absurdo é', 'é um absurdo',
  'vergonha que', 'denúncia', 'denuncio', 'denunciei',
  'fechamento', 'querem fechar', 'querem tirar', 'querem acabar',
  'retiram', 'retirar', 'cortar', 'cortaram',
  'cadê', 'descaso', 'abandono', 'abandonad',
  'precisamos lutar', 'não vamos aceitar', 'inadmissível',
];

/** Detecta se o post é uma denúncia / defesa contra algo (não conquista). */
export function isDenunciationPost(postMessage: string | null | undefined): boolean {
  if (!postMessage) return false;
  const lower = postMessage
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return DENUNCIATION_POST_HINTS.some(h => lower.includes(h));
}

export function buildSystemPrompt(ctx: CandidateCtx, corrections: Array<{
  text: string;
  post_message: string | null;
  ai_sentiment: string;
  human_sentiment: string;
}> = []): string {
  let fewShot = '';
  if (corrections.length > 0) {
    // Prioriza correções onde a IA errou para negative
    const sorted = [...corrections].sort((a, b) => {
      const aWasFalseNeg = a.ai_sentiment === 'negative' && a.human_sentiment !== 'negative' ? 0 : 1;
      const bWasFalseNeg = b.ai_sentiment === 'negative' && b.human_sentiment !== 'negative' ? 0 : 1;
      return aWasFalseNeg - bWasFalseNeg;
    });
    const examples = sorted.slice(0, 10).map((c, i) => {
      const post = c.post_message ? c.post_message.substring(0, 180).replace(/\s+/g, ' ').trim() : '(sem post)';
      const txt = c.text.substring(0, 200).replace(/\s+/g, ' ').trim();
      return `Exemplo ${i + 1}:
POST: "${post}"
COMENTÁRIO: "${txt}"
❌ IA tinha dito: ${c.ai_sentiment}
✅ Resposta correta: ${c.human_sentiment}`;
    }).join('\n\n');
    fewShot = `\n\n📚 APRENDIZADOS COM CORREÇÕES HUMANAS (siga este padrão):\n${examples}`;
  }

  return `Você classifica sentimentos de comentários no perfil de "${ctx.candidato}" (${ctx.cargo}).

🧠 ANTES DE CLASSIFICAR, responda mentalmente 3 PERGUNTAS:

1. POST_STANCE — Qual a postura do POST?
   • "denuncia" — o candidato denuncia/critica/luta contra algo (ex: fechamento de polo, descaso, projeto ruim, ação de terceiros)
   • "conquista" — o candidato celebra entrega, obra, vitória, evento próprio
   • "convite" — chamada para evento, inscrição, atendimento, mutirão
   • "opiniao" — candidato dá opinião sobre tema/projeto
   • "neutro" — informativo puro

2. TARGET — Sobre QUEM/O QUÊ o comentário fala?
   • "candidato" — fala diretamente sobre "${ctx.candidato}"
   • "fato_do_post" — fala sobre o tema/fato/situação do post (não sobre o candidato)
   • "terceiro" — fala sobre outra pessoa (governo, prefeito, oposição, aliado)
   • "ambiguo" — não dá pra saber

3. ALIGNMENT — O comentário CONCORDA ou DISCORDA do que o candidato disse no post?
   • "concorda" — apoia, reforça a denúncia, valida a posição
   • "discorda" — contradiz, ataca a posição do candidato
   • "neutro" — não toma lado

⚠️ REGRA CRÍTICA — INVERSÃO DE ALVO:
Se post_stance="denuncia" E target="fato_do_post" E alignment="concorda",
então mesmo palavras fortes ("absurdo", "vergonha", "revoltante", "que absurdo", "inadmissível")
são APOIO À DENÚNCIA → POSITIVE.

Exemplo: Post "Fiz a defesa do polo da UEMS, não podemos aceitar que retirem!" + Comentário "É um absurdo isso"
→ post_stance=denuncia, target=fato_do_post (o "isso" é a retirada da UEMS), alignment=concorda
→ POSITIVE (concorda com a denúncia do candidato)

⚠️ NEGATIVE só se: target="candidato" E alignment="discorda" (ataque direto, deboche, ofensa contra ${ctx.candidato}).

⚠️ Em posts de evento/convite, perguntas práticas ("como faz?", "onde é?", "tem link?") → NEUTRAL.

⚠️ Demandas cívicas sem ofensa ("queremos melhorias", "precisamos disso no bairro") → NEUTRAL.

⚠️ Menções a aliados/candidatos da mesma corrente em tom otimista → POSITIVE.${fewShot}

FORMATO DE RESPOSTA OBRIGATÓRIO (JSON em uma linha, sem markdown):
{"post_stance":"denuncia|conquista|convite|opiniao|neutro","target":"candidato|fato_do_post|terceiro|ambiguo","alignment":"concorda|discorda|neutro","s":"positive|negative|neutral","c":0.0-1.0,"reason":"frase curta"}`;
}

export function buildUserPrompt(text: string, postMessage: string | null | undefined): string {
  const postCtx = postMessage
    ? postMessage.substring(0, 500).replace(/\s+/g, ' ').trim()
    : '(sem contexto do post)';
  return `Classifique seguindo as 3 perguntas mentais. Responda APENAS o JSON:

POST: "${postCtx}"
COMENTÁRIO: "${text}"`;
}

export function buildMessages(
  text: string,
  postMessage: string | null | undefined,
  ctx: CandidateCtx,
  corrections: Array<{ text: string; post_message: string | null; ai_sentiment: string; human_sentiment: string }> = [],
): LLMMessage[] {
  return [
    { role: 'system', content: buildSystemPrompt(ctx, corrections) },
    { role: 'user', content: buildUserPrompt(text, postMessage) },
  ];
}

export function parseAnalysisResponse(raw: string): SentimentAnalysisResult {
  const fallback: SentimentAnalysisResult = {
    sentiment: 'neutral',
    confidence: 0.4,
    reason: '',
    postStance: '',
    target: '',
    alignment: '',
  };
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return fallback;
    const parsed = JSON.parse(match[0]);
    let sentiment: Sentiment = 'neutral';
    const s = String(parsed.s || '').toLowerCase().trim();
    if (s === 'positive' || s === 'negative' || s === 'neutral') sentiment = s;
    const confidence = typeof parsed.c === 'number' ? Math.max(0, Math.min(1, parsed.c)) : 0.6;
    return {
      sentiment,
      confidence,
      reason: String(parsed.reason || '').slice(0, 240),
      postStance: String(parsed.post_stance || '').slice(0, 40),
      target: String(parsed.target || '').slice(0, 40),
      alignment: String(parsed.alignment || '').slice(0, 40),
    };
  } catch {
    return fallback;
  }
}

/**
 * Heurística pós-LLM ciente do contexto: se o post é denúncia e a IA
 * marcou como negativo, mas o comentário usa as MESMAS palavras fortes que
 * normalmente reforçariam a denúncia (absurdo, vergonha, revoltante),
 * reverte para neutral (cautela: não força positivo sem certeza).
 */
export function softenNegativeOnDenunciation(
  sentiment: Sentiment,
  text: string,
  postMessage: string | null | undefined,
  target?: string,
  alignment?: string,
): Sentiment {
  if (sentiment !== 'negative') return sentiment;
  if (!isDenunciationPost(postMessage)) return sentiment;
  // Se a IA já identificou que o alvo é o fato e há concordância, vira positivo
  if (target === 'fato_do_post' && alignment === 'concorda') return 'positive';
  // Se o comentário é curto e usa palavra de indignação alinhada à denúncia → neutral
  const normalized = (text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const agreementWords = /\b(absurdo|absurda|vergonha|revoltante|inadmissivel|que absurdo|isso e absurdo|e um absurdo|nao podem|nao pode|tem que reverter|tem que mudar)\b/;
  if (agreementWords.test(normalized) && normalized.length < 120) {
    return 'neutral';
  }
  return sentiment;
}
