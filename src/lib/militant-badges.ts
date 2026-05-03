export type MilitantBadge =
  | "hater"
  | "critico"
  | "sumido"
  | "elite"
  | "defensor"
  | "engajado"
  | "novo"
  | "observador";

export interface BadgeMeta {
  emoji: string;
  label: string;
  description: string;
  /** Tailwind classes for the badge container */
  className: string;
  /** Sort priority — lower number means higher priority/visibility */
  priority: number;
}

export const BADGE_META: Record<MilitantBadge, BadgeMeta> = {
  hater: {
    emoji: "🎯",
    label: "Hater Persistente",
    description: "10+ comentários negativos no histórico contra você. Atenção redobrada.",
    className: "bg-destructive/10 text-destructive border-destructive/30",
    priority: 1,
  },
  critico: {
    emoji: "⚔️",
    label: "Crítico Recorrente",
    description: "3+ comentários negativos nos últimos 30 dias. Monitorar.",
    className: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/30",
    priority: 2,
  },
  sumido: {
    emoji: "💤",
    label: "Sumido",
    description: "Era ativo, mas sumiu há mais de 60 dias. Vale reativar o engajamento.",
    className: "bg-muted text-muted-foreground border-border",
    priority: 3,
  },
  elite: {
    emoji: "💎",
    label: "Tropa de Elite",
    description: "15+ comentários positivos e ZERO negativos. Apoiador de confiança absoluta.",
    className: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30",
    priority: 4,
  },
  defensor: {
    emoji: "🔥",
    label: "Defensor",
    description: "5+ comentários positivos nos últimos 30 dias. Está te apoiando ativamente.",
    className: "bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/30",
    priority: 5,
  },
  engajado: {
    emoji: "📣",
    label: "Engajado",
    description: "10+ comentários no total, mistos. Pessoa muito presente nas suas publicações.",
    className: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30",
    priority: 6,
  },
  novo: {
    emoji: "🆕",
    label: "Novo Rosto",
    description: "Primeiro comentário nos últimos 7 dias. Pode ser um futuro apoiador.",
    className: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/30",
    priority: 7,
  },
  observador: {
    emoji: "👁️",
    label: "Observador",
    description: "Comentou poucas vezes, ainda sem padrão definido.",
    className: "bg-muted text-muted-foreground border-border",
    priority: 8,
  },
};

export function getBadgeMeta(badge: string | null | undefined): BadgeMeta | null {
  if (!badge) return null;
  return BADGE_META[badge as MilitantBadge] ?? null;
}