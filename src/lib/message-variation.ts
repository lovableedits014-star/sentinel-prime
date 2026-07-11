// Motor isomórfico de variação de mensagens (frontend).
// ESPELHO 1:1 de supabase/functions/_shared/message-variation.ts
// para o preview no editor. Qualquer mudança de regra tem que acontecer
// nos dois lados. Não importar código do Deno aqui.

export type Recipient = {
  nome?: string | null;
  telefone?: string | null;
};

export type RenderContext = {
  cta?: string | null;
  assinaturas?: string[];
  emojisPositivos?: string[];
  rng?: () => number;
  tzOffsetHours?: number;
  autoAppendCta?: boolean;
};

export type RenderResult = {
  text: string;
  ctaUsed: string | null;
  warnings: string[];
};

const URL_REGEX = /https?:\/\/[^\s<>"')]+/g;
const URL_TOKEN = (i: number) => `\u27E6URL${i}\u27E7`;

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

export function protectUrls(text: string): { masked: string; urls: string[] } {
  const urls: string[] = [];
  const masked = text.replace(URL_REGEX, (u) => {
    urls.push(u);
    return URL_TOKEN(urls.length - 1);
  });
  return { masked, urls };
}

export function restoreUrls(text: string, urls: string[]): string {
  let out = text;
  for (let i = 0; i < urls.length; i++) {
    out = out.split(URL_TOKEN(i)).join(urls[i]);
  }
  return out;
}

export function validateSpintax(text: string): { ok: boolean; error?: string } {
  const openBlocks = (text.match(/\[\[/g) || []).length;
  const closeBlocks = (text.match(/\]\]/g) || []).length;
  if (openBlocks !== closeBlocks) {
    return { ok: false, error: "Blocos [[...]] desbalanceados" };
  }
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

export function expandSpintax(text: string, rng: () => number = Math.random): string {
  const pickFrom = (choices: string[]): string => {
    if (choices.length === 0) return "";
    return choices[Math.floor(rng() * choices.length)];
  };

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

export function saudacaoParaHora(date: Date, tzOffsetHours = -3): string {
  const localMs = date.getTime() + tzOffsetHours * 3600 * 1000;
  const localHour = new Date(localMs).getUTCHours();
  if (localHour < 12) return "Bom dia";
  if (localHour < 18) return "Boa tarde";
  return "Boa noite";
}

export function diaSemana(date: Date, tzOffsetHours = -3): string {
  const localMs = date.getTime() + tzOffsetHours * 3600 * 1000;
  const day = new Date(localMs).getUTCDay();
  return DIAS_SEMANA[day];
}

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

export function hasQuestionAtEnd(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const tail = trimmed.slice(-10);
  return /\?/.test(tail);
}

export function renderMessage(
  template: string,
  recipient: Recipient,
  ctx: RenderContext = {},
): RenderResult {
  const rng = ctx.rng ?? Math.random;

  const validation = validateSpintax(template);
  if (!validation.ok) {
    const literal = template.replace(/\{nome\}/g, recipient.nome || "");
    return {
      text: literal,
      ctaUsed: null,
      warnings: [`spintax_invalid: ${validation.error}`],
    };
  }

  const { masked, urls } = protectUrls(template);
  const spun = expandSpintax(masked, rng);
  const withPlaceholders = applyPlaceholders(spun, recipient, { ...ctx, rng });

  let final = withPlaceholders;
  let ctaUsed: string | null = null;
  if (ctx.cta && ctx.cta.trim() && !final.includes(ctx.cta)) {
    if (ctx.autoAppendCta && !hasQuestionAtEnd(final)) {
      final = final.replace(/\s+$/, "") + "\n\n" + ctx.cta;
      ctaUsed = ctx.cta;
    }
  } else if (ctx.cta && final.includes(ctx.cta)) {
    ctaUsed = ctx.cta;
  }

  final = restoreUrls(final, urls);

  for (const u of urls) {
    if (!final.includes(u)) {
      const literal = template.replace(/\{nome\}/g, recipient.nome || "");
      return {
        text: literal,
        ctaUsed: null,
        warnings: ["url_lost_in_render"],
      };
    }
  }

  return { text: final, ctaUsed, warnings: [] };
}

export function renderPreviewBatch(
  template: string,
  recipients: Recipient[],
  ctx: RenderContext = {},
): { samples: RenderResult[]; uniqueCount: number; total: number } {
  const samples = recipients.map((r) => renderMessage(template, r, ctx));
  const uniq = new Set(samples.map((s) => s.text));
  return { samples, uniqueCount: uniq.size, total: samples.length };
}
