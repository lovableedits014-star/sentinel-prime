// Biblioteca de CTAs de resposta (anti-ban via engajamento reverso).
// Cada CTA tem categoria, tom e tags.
// A função pickCta() combina defaults + custom do cliente e sorteia 1,
// evitando repetir consecutivamente.

export type CtaCategory =
  | "pergunta_leve"
  | "confirmacao"
  | "escolha_binaria"
  | "opiniao"
  | "ajuda_mutua"
  | "micro_compromisso";

export type Cta = {
  id: string;
  text: string;
  category: CtaCategory;
  tone: "formal" | "informal" | "neutro";
  active?: boolean;
};

export const DEFAULT_CTAS: Cta[] = [
  // pergunta_leve
  { id: "pl_01", text: "Posso te contar em 1 linha o que muda pra você?", category: "pergunta_leve", tone: "informal" },
  { id: "pl_02", text: "Quer que eu te avise quando abrir?", category: "pergunta_leve", tone: "informal" },
  { id: "pl_03", text: "Faz sentido pra você?", category: "pergunta_leve", tone: "informal" },
  { id: "pl_04", text: "O que te chamou mais atenção nisso?", category: "pergunta_leve", tone: "neutro" },
  { id: "pl_05", text: "Você já tinha ouvido falar disso?", category: "pergunta_leve", tone: "neutro" },

  // confirmacao
  { id: "cf_01", text: "Consegue me confirmar se recebeu? Um 👍 já ajuda muito 🙏", category: "confirmacao", tone: "informal" },
  { id: "cf_02", text: "Me manda um oi de volta pra eu saber que chegou 🙏", category: "confirmacao", tone: "informal" },
  { id: "cf_03", text: "Deu pra ler direitinho? Qualquer dúvida me chama.", category: "confirmacao", tone: "neutro" },
  { id: "cf_04", text: "Se conseguir me responder, garanto que vou ler pessoalmente.", category: "confirmacao", tone: "formal" },
  { id: "cf_05", text: "Passa aqui um sinalzinho de que recebeu 🙏", category: "confirmacao", tone: "informal" },

  // escolha_binaria
  { id: "eb_01", text: "Prefere que eu te mande por aqui ou por áudio?", category: "escolha_binaria", tone: "informal" },
  { id: "eb_02", text: "Tanto faz de manhã ou à noite pra falar?", category: "escolha_binaria", tone: "informal" },
  { id: "eb_03", text: "Consegue me responder hoje ou prefere que eu te chame amanhã?", category: "escolha_binaria", tone: "neutro" },
  { id: "eb_04", text: "Quer mais detalhes por texto ou uma ligação rápida?", category: "escolha_binaria", tone: "neutro" },
  { id: "eb_05", text: "Podemos falar aqui pelo WhatsApp ou pessoalmente é melhor?", category: "escolha_binaria", tone: "formal" },

  // opiniao
  { id: "op_01", text: "O que você acha disso?", category: "opiniao", tone: "informal" },
  { id: "op_02", text: "Você concorda?", category: "opiniao", tone: "informal" },
  { id: "op_03", text: "Como está aí no seu bairro?", category: "opiniao", tone: "informal" },
  { id: "op_04", text: "Gostaria de saber sua opinião sobre isso.", category: "opiniao", tone: "formal" },
  { id: "op_05", text: "Isso faz diferença aí na sua região?", category: "opiniao", tone: "neutro" },

  // ajuda_mutua
  { id: "am_01", text: "Se puder me contar o que mais te preocupa hoje, eu levo pra pauta.", category: "ajuda_mutua", tone: "neutro" },
  { id: "am_02", text: "Me conta em uma palavra o que você precisa aqui no bairro.", category: "ajuda_mutua", tone: "informal" },
  { id: "am_03", text: "Se tiver alguma demanda, me manda por aqui que eu registro.", category: "ajuda_mutua", tone: "formal" },
  { id: "am_04", text: "Se conhecer alguém que precise saber disso, me avisa por favor 🙏", category: "ajuda_mutua", tone: "informal" },
  { id: "am_05", text: "Sua opinião ajuda muito a gente a melhorar. Manda pra mim!", category: "ajuda_mutua", tone: "informal" },

  // micro_compromisso
  { id: "mc_01", text: "Posso te mandar o material completo?", category: "micro_compromisso", tone: "neutro" },
  { id: "mc_02", text: "Topa receber 1 atualização por semana?", category: "micro_compromisso", tone: "informal" },
  { id: "mc_03", text: "Quer entrar na lista de quem recebe as novidades primeiro?", category: "micro_compromisso", tone: "informal" },
  { id: "mc_04", text: "Posso te chamar quando tiver o próximo encontro aqui perto?", category: "micro_compromisso", tone: "neutro" },
  { id: "mc_05", text: "Se quiser, te mando o link do grupo oficial. Topa?", category: "micro_compromisso", tone: "informal" },
];

export const ALL_CATEGORIES: CtaCategory[] = [
  "pergunta_leve",
  "confirmacao",
  "escolha_binaria",
  "opiniao",
  "ajuda_mutua",
  "micro_compromisso",
];

/**
 * Combina defaults com CTAs personalizados do cliente. CTAs do cliente
 * podem sobrescrever/desligar defaults pelo mesmo id.
 */
export function mergeCtas(clientCtas: Cta[] | undefined | null): Cta[] {
  const byId = new Map<string, Cta>();
  for (const c of DEFAULT_CTAS) byId.set(c.id, { ...c, active: true });
  if (Array.isArray(clientCtas)) {
    for (const c of clientCtas) {
      if (!c || typeof c.text !== "string") continue;
      byId.set(c.id, { ...c, active: c.active !== false });
    }
  }
  return Array.from(byId.values()).filter((c) => c.active !== false);
}

/**
 * Sorteia um CTA respeitando o filtro de categorias. `avoidIds` permite
 * evitar repetição consecutiva dentro do mesmo run.
 */
export function pickCta(
  clientCtas: Cta[] | undefined | null,
  categories: CtaCategory[] | undefined,
  opts: { avoidIds?: Set<string>; rng?: () => number } = {},
): Cta | null {
  const rng = opts.rng ?? Math.random;
  let pool = mergeCtas(clientCtas);
  if (categories && categories.length > 0) {
    pool = pool.filter((c) => categories.includes(c.category));
  }
  if (pool.length === 0) return null;

  const avoid = opts.avoidIds ?? new Set<string>();
  const filtered = pool.filter((c) => !avoid.has(c.id));
  const finalPool = filtered.length > 0 ? filtered : pool;

  return finalPool[Math.floor(rng() * finalPool.length)];
}
