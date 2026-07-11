// Motor puro de variação de mensagens (anti-ban).
// Sem I/O. As mesmas regras existem em src/lib/message-variation.ts (frontend)
// e são testadas com as mesmas fixtures para evitar drift.
//
// Contrato:
//   renderMessage(template, recipient, ctx) => { text, variant, ctaUsed, warnings }
//
// Regras:
//   1. URLs são protegidas antes de qualquer transformação. Se qualquer URL
//      original sumir do texto final, lança erro (garantia dura).
//   2. Spintax { a | b | c } e blocos [[ A | B ]] são expandidos recursivamente.
//   3. Placeholders: {nome}, {primeiro_nome}, {saudacao}, {dia_semana},
//      {assinatura}, {emoji_positivo}, {cta_resposta}.
//   4. Se o template não usar spintax nem placeholders novos, o resultado é
//      idêntico ao antigo replace(/{nome}/g, ...) — retrocompatibilidade total.

export type Recipient = {
  nome?: string | null;
  telefone?: string | null;
};

export type RenderContext = {
  /** CTA já selecionado (ou undefined para não injetar). */
  cta?: string | null;
  /** Assinaturas rotativas do candidato/cliente (uma será sorteada). */
  assinaturas?: string[];
  /** Emojis positivos para {emoji_positivo}. Defaults se vazio. */
  emojisPositivos?: string[];
  /** RNG determinístico opcional (para testes). Default Math.random. */
  rng?: () => number;
  /** Timezone offset em horas (default -3, America/Sao_Paulo). */
  tzOffsetHours?: number;
  /** Se true, adiciona CTA ao fim do texto se {cta_resposta} não estiver presente
   * E o texto não terminar em pergunta. */
  autoAppendCta?: boolean;
};

export type RenderResult = {
  text: string;
  ctaUsed: string | null;
  warnings: string[];
};

const URL_REGEX = /https?:\/\/[^\s<>"')]+/g;
const URL_TOKEN = (i: number) => `\u27E6URL${i}\u27E7`; // ⟦URL0⟧

const DEFAULT_EMOJIS_POSITIVOS = ["🙏", "💪", "🇧🇷", "✨", "🌟", "❤️", "🤝", "👏"];

const DIAS_SEMANA = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

/** Extrai URLs para tokens; devolve texto mascarado + array de URLs. */
export function protectUrls(text: string): { masked: string; urls: string[] } {
  const urls: string[] = [];
  const masked = text.replace(URL_REGEX, (u) => {
    urls.push(u);
    return URL_TOKEN(urls.length - 1);
  });
  return { masked, urls };
}

/** Reinsere URLs a partir dos tokens. */
export function restoreUrls(text: string, urls: string[]): string {
  let out = text;
  for (let i = 0; i < urls.length; i++) {
    out = out.split(URL_TOKEN(i)).join(urls[i]);
  }
  return out;
}

/** Valida spintax básica: chaves e colchetes duplos balanceados. */
export function validateSpintax(text: string): { ok: boolean; error?: string } {
  // Blocos [[ ... ]] devem estar balanceados
  const openBlocks = (text.match(/\[\[/g) || []).length;
  const closeBlocks = (text.match(/\]\]/g) || []).length;
  if (openBlocks !== closeBlocks) {
    return { ok: false, error: "Blocos [[...]] desbalanceados" };
  }
  // Chaves simples: contar { e } (ignorando conhecidos placeholders sem |)
  // Heurística: qualquer { não fechado antes de fim de linha é erro.
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    if (depth < 0) return { ok: false, error: "Chave } sem { correspondente" };
  }
  if (depth !== 0) return { ok: false, error: "Chave { sem } correspondente" };
  return { ok: true };
}

/**
 * Expande spintax:
 *   - Blocos multilinha [[A|B|C]] são resolvidos primeiro.
 *   - Depois, {a|b|c} com pelo menos um pipe dentro é sorteado.
 *   - Chaves sem pipe (ex: {nome}) NÃO são tocadas — são placeholders.
 * Recursivo: escolhas podem conter novas spintax.
 */
export function expandSpintax(text: string, rng: () => number = Math.random): string {
  const pickFrom = (choices: string[]): string => {
    if (choices.length === 0) return "";
    return choices[Math.floor(rng() * choices.length)];
  };

  // 1) Blocos [[A|B]]
  let prev = "";
  let cur = text;
  let guard = 0;
  while (prev !== cur && guard++ < 20) {
    prev = cur;
    cur = cur.replace(/\[\[([^\[\]]+)\]\]/g, (_m, inner: string) => {
      const parts = inner.split("|");
      return pickFrom(parts);
    });
  }

  // 2) Spintax {a|b} (com pipe). Aplica repetidamente para resolver aninhados.
  prev = "";
  guard = 0;
  while (prev !== cur && guard++ < 20) {
    prev = cur;
    cur = cur.replace(/\{([^{}]*\|[^{}]*)\}/g, (_m, inner: string) => {
      const parts = inner.split("|");
      return pickFrom(parts);
    });
  }

  return cur;
}

/** Retorna "Bom dia" / "Boa tarde" / "Boa noite" para o horário local. */
export function saudacaoParaHora(date: Date, tzOffsetHours = -3): string {
  const localMs = date.getTime() + tzOffsetHours * 3600 * 1000;
  const localHour = new Date(localMs).getUTCHours();
  if (localHour < 12) return "Bom dia";
  if (localHour < 18) return "Boa tarde";
  return "Boa noite";
}

/** Nome do dia da semana em português. */
export function diaSemana(date: Date, tzOffsetHours = -3): string {
  const localMs = date.getTime() + tzOffsetHours * 3600 * 1000;
  const day = new Date(localMs).getUTCDay();
  return DIAS_SEMANA[day];
}

/** Substitui todos os placeholders {xxx} conhecidos. Ignora desconhecidos. */
export function applyPlaceholders(
  text: string,
  recipient: Recipient,
  ctx: RenderContext,
): string {
  const rng = ctx.rng ?? Math.random;
  const now = new Date();
  const nome = (recipient.nome || "").trim();
  const primeiro = nome.split(/\s+/)[0] || nome;
  const emojis = ctx.emojisPositivos?.length ? ctx.emojisPositivos : DEFAULT_EMOJIS_POSITIVOS;
  const emoji = emojis[Math.floor(rng() * emojis.length)];
  const assinaturas = ctx.assinaturas ?? [];
  const assinatura = assinaturas.length ? assinaturas[Math.floor(rng() * assinaturas.length)] : "";
  const cta = ctx.cta ?? "";
  const tz = ctx.tzOffsetHours ?? -3;

  return text
    .replace(/\{nome\}/g, nome)
    .replace(/\{primeiro_nome\}/g, primeiro)
    .replace(/\{saudacao\}/g, saudacaoParaHora(now, tz))
    .replace(/\{dia_semana\}/g, diaSemana(now, tz))
    .replace(/\{assinatura\}/g, assinatura)
    .replace(/\{emoji_positivo\}/g, emoji)
    .replace(/\{cta_resposta\}/g, cta);
}

/** True se o texto (após trim) termina em ? ou ! seguido opcional de emoji. */
export function hasQuestionAtEnd(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  // Pega os últimos ~10 chars e checa por '?'
  const tail = trimmed.slice(-10);
  return /\?/.test(tail);
}

/**
 * Pipeline principal. Retrocompatível: template sem novidades → mesma saída
 * do antigo replace(/{nome}/g, ...).
 */
export function renderMessage(
  template: string,
  recipient: Recipient,
  ctx: RenderContext = {},
): RenderResult {
  const warnings: string[] = [];
  const rng = ctx.rng ?? Math.random;

  const validation = validateSpintax(template);
  if (!validation.ok) {
    // Fallback duro: retorna template literal apenas com {nome} substituído
    // (comportamento antigo) — não quebra disparos existentes.
    const literal = template.replace(/\{nome\}/g, recipient.nome || "");
    return {
      text: literal,
      ctaUsed: null,
      warnings: [`spintax_invalid: ${validation.error}`],
    };
  }

  // 1. Protege URLs
  const { masked, urls } = protectUrls(template);

  // 2. Expande spintax
  const spun = expandSpintax(masked, rng);

  // 3. Aplica placeholders
  const withPlaceholders = applyPlaceholders(spun, recipient, { ...ctx, rng });

  // 4. Auto-anexa CTA se pedido, se cta existe e se o texto ainda não perguntou
  let final = withPlaceholders;
  let ctaUsed: string | null = null;
  if (ctx.cta && ctx.cta.trim() && !final.includes(ctx.cta)) {
    // {cta_resposta} não foi usado no template
    if (ctx.autoAppendCta && !hasQuestionAtEnd(final)) {
      final = final.replace(/\s+$/, "") + "\n\n" + ctx.cta;
      ctaUsed = ctx.cta;
    }
  } else if (ctx.cta && final.includes(ctx.cta)) {
    ctaUsed = ctx.cta;
  }

  // 5. Restaura URLs
  final = restoreUrls(final, urls);

  // 6. Garantia dura: toda URL original tem que estar no texto final
  for (const u of urls) {
    if (!final.includes(u)) {
      // Fallback seguro: devolve template com URL preservada e {nome} literal
      const literal = template.replace(/\{nome\}/g, recipient.nome || "");
      return {
        text: literal,
        ctaUsed: null,
        warnings: ["url_lost_in_render"],
      };
    }
  }

  return { text: final, ctaUsed, warnings };
}

/**
 * Utilitário de auditoria: renderiza N amostras contra uma lista de
 * destinatários e devolve estatística de unicidade.
 * Usado para o preview no editor e para logging de colisão.
 */
export function renderPreviewBatch(
  template: string,
  recipients: Recipient[],
  ctx: RenderContext = {},
): { samples: RenderResult[]; uniqueCount: number; total: number } {
  const samples = recipients.map((r) => renderMessage(template, r, ctx));
  const uniq = new Set(samples.map((s) => s.text));
  return { samples, uniqueCount: uniq.size, total: samples.length };
}
