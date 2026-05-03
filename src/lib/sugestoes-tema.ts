/**
 * Sugestões temáticas para feriados e meses, organizadas por estilo.
 * 100% visual — apoio à decisão para a campanha. Sem disparos automáticos.
 */
export type EstiloTema =
  | "civico"
  | "religioso"
  | "social"
  | "familiar"
  | "comemorativo";

export const ESTILO_LABEL: Record<EstiloTema, { label: string; emoji: string; descricao: string }> = {
  civico:       { label: "Cívico",       emoji: "🇧🇷", descricao: "Patriotismo, democracia, atos cívicos" },
  religioso:    { label: "Religioso",    emoji: "✝️", descricao: "Fé, respeito, datas litúrgicas" },
  social:       { label: "Social",       emoji: "✊", descricao: "Pautas de classe, raça, gênero, trabalho" },
  familiar:     { label: "Familiar",     emoji: "👨‍👩‍👧", descricao: "Família, infância, idosos, cotidiano" },
  comemorativo: { label: "Comemorativo", emoji: "🎉", descricao: "Festas populares, celebrações, virada" },
};

export const ESTILOS_DISPONIVEIS: EstiloTema[] = [
  "civico", "religioso", "social", "familiar", "comemorativo",
];

export type SugestaoFeriado = {
  match: RegExp;
  tema: string;
  emoji: string;
  estilo: EstiloTema;
};

export const SUGESTOES_FERIADO: SugestaoFeriado[] = [
  { match: /confraterniza/i,                 tema: "Mensagem de virada de ano e balanço",            emoji: "🎆", estilo: "comemorativo" },
  { match: /carnaval/i,                      tema: "Comunicado de pausa de campanha + segurança",    emoji: "🎭", estilo: "comemorativo" },
  { match: /sexta.*santa|paix[ãa]o/i,        tema: "Tom respeitoso, foco em fé e família",           emoji: "✝️", estilo: "religioso" },
  { match: /p[áa]scoa/i,                     tema: "Mensagem de esperança e renovação",              emoji: "🐣", estilo: "religioso" },
  { match: /tiradentes/i,                    tema: "Patriotismo, história e justiça",                emoji: "⚖️", estilo: "civico" },
  { match: /trabalhador|trabalho/i,          tema: "Atos com sindicatos e categorias profissionais", emoji: "🛠️", estilo: "social" },
  { match: /corpus christi/i,                tema: "Tom religioso, evitar disparos massivos",        emoji: "🕊️", estilo: "religioso" },
  { match: /independ[êe]ncia/i,              tema: "Patriotismo, atos cívicos, desfile",             emoji: "🇧🇷", estilo: "civico" },
  { match: /aparecida|padroeira/i,           tema: "Família, infância e fé — duplo apelo",           emoji: "🙏", estilo: "religioso" },
  { match: /crian[çc]a/i,                    tema: "Família, infância — proteção e educação",        emoji: "👶", estilo: "familiar" },
  { match: /finados/i,                       tema: "Tom respeitoso, evitar tom comemorativo",        emoji: "🕯️", estilo: "religioso" },
  { match: /proclama[çc][ãa]o.*rep[úu]blica/i, tema: "Patriotismo e democracia",                     emoji: "🏛️", estilo: "civico" },
  { match: /consci[êe]ncia negra/i,          tema: "Pauta racial, lideranças negras, Zumbi",         emoji: "✊🏿", estilo: "social" },
  { match: /natal/i,                         tema: "Mensagem de paz, família e gratidão",            emoji: "🎄", estilo: "familiar" },
];

export function getSugestaoFeriado(
  h: { localName?: string; name?: string },
  estilosAtivos?: ReadonlySet<EstiloTema>,
): { tema: string; emoji: string; estilo: EstiloTema } | null {
  const text = `${h.localName ?? ""} ${h.name ?? ""}`;
  for (const s of SUGESTOES_FERIADO) {
    if (!s.match.test(text)) continue;
    if (estilosAtivos && !estilosAtivos.has(s.estilo)) continue;
    return { tema: s.tema, emoji: s.emoji, estilo: s.estilo };
  }
  return null;
}

/** Tema político mensal — pode ter variações por estilo. */
export type TemaMes = {
  titulo: string;
  descricao: string;
  emoji: string;
  estilo: EstiloTema;
};

/** index = mês (0..11). Cada mês oferece variações por estilo. */
export const TEMAS_MES_POR_ESTILO: TemaMes[][] = [
  // Janeiro
  [
    { titulo: "Balanço e metas",        descricao: "Comunique balanço do ano anterior e metas claras para o ciclo.",            emoji: "🎯", estilo: "civico" },
    { titulo: "Bênçãos do novo ciclo",  descricao: "Mensagens de fé e gratidão pela virada de ano.",                              emoji: "🙏", estilo: "religioso" },
    { titulo: "Promessas e família",    descricao: "Resoluções coletivas e tempo em família no início do ano.",                   emoji: "👨‍👩‍👧", estilo: "familiar" },
  ],
  // Fevereiro
  [
    { titulo: "Escuta de base",         descricao: "Mês curto: visitas de campo e formulários de escuta nos bairros.",            emoji: "👂", estilo: "social" },
    { titulo: "Carnaval com segurança", descricao: "Pausa de campanha agressiva, foco em segurança e saúde pública.",             emoji: "🎭", estilo: "comemorativo" },
  ],
  // Março
  [
    { titulo: "Mulheres e lideranças",  descricao: "8/3: pautas femininas, lideranças, mães solo, igualdade salarial.",          emoji: "♀️", estilo: "social" },
    { titulo: "Família e cuidado",      descricao: "Homenagens a mães e mulheres da família, tom acolhedor.",                     emoji: "💐", estilo: "familiar" },
  ],
  // Abril
  [
    { titulo: "Fé e renovação",         descricao: "Páscoa: tom respeitoso, esperança. Evite disparos na Sexta-Santa.",          emoji: "🌱", estilo: "religioso" },
    { titulo: "Tiradentes e história",  descricao: "21/4: patriotismo, justiça e história nacional.",                              emoji: "⚖️", estilo: "civico" },
  ],
  // Maio
  [
    { titulo: "Trabalho e categorias",  descricao: "1º de Maio: atos com sindicatos, categorias profissionais e empreendedores.", emoji: "🛠️", estilo: "social" },
    { titulo: "Mães e cuidado",         descricao: "Dia das Mães: homenagens e pautas de cuidado, saúde materna.",                emoji: "🌸", estilo: "familiar" },
  ],
  // Junho
  [
    { titulo: "Festas juninas",         descricao: "Presença em quadrilhas, arraiás e ações comunitárias.",                       emoji: "🌽", estilo: "comemorativo" },
    { titulo: "Tradição e fé",          descricao: "Santos juninos: tom regional e religioso conforme o público.",                 emoji: "🔥", estilo: "religioso" },
  ],
  // Julho
  [
    { titulo: "Recesso e bastidores",   descricao: "Férias escolares: bastidores e família do candidato.",                        emoji: "🏖️", estilo: "familiar" },
    { titulo: "Escuta no interior",     descricao: "Aproveite o recesso para visitas a distritos e zonas rurais.",                 emoji: "🚐", estilo: "social" },
  ],
  // Agosto
  [
    { titulo: "Pais e proteção",        descricao: "Dia dos Pais: paternidade ativa, segurança e responsabilidade familiar.",     emoji: "👨‍👧", estilo: "familiar" },
    { titulo: "Folclore e identidade",  descricao: "Mês do folclore: cultura popular, raízes locais.",                             emoji: "🎨", estilo: "comemorativo" },
  ],
  // Setembro
  [
    { titulo: "Patriotismo cívico",     descricao: "7 de Setembro: atos cívicos, patriotismo. Evite excesso de partidarização.",  emoji: "🇧🇷", estilo: "civico" },
    { titulo: "Setembro Amarelo",       descricao: "Pauta saúde mental e prevenção ao suicídio com responsabilidade.",            emoji: "💛", estilo: "social" },
  ],
  // Outubro
  [
    { titulo: "Crianças e idosos",      descricao: "Dia das Crianças (12/10) e do Idoso (1/10): proteção, saúde e educação.",     emoji: "👶", estilo: "familiar" },
    { titulo: "Padroeira do Brasil",    descricao: "12/10 — N. Sra. Aparecida: tom respeitoso e religioso.",                       emoji: "🙏", estilo: "religioso" },
  ],
  // Novembro
  [
    { titulo: "Memória e diversidade",  descricao: "Consciência Negra (20/11): pauta racial, lideranças negras, igualdade.",      emoji: "✊🏿", estilo: "social" },
    { titulo: "República e democracia", descricao: "15/11: instituições, voto, democracia.",                                       emoji: "🏛️", estilo: "civico" },
  ],
  // Dezembro
  [
    { titulo: "Gratidão e gestão",      descricao: "Natal: paz, prestação de contas e planejamento do próximo ciclo.",            emoji: "🎄", estilo: "familiar" },
    { titulo: "Esperança e fé",         descricao: "Mensagens natalinas com tom religioso e de comunidade.",                       emoji: "⭐", estilo: "religioso" },
  ],
];

export function getTemasMes(month: number, estilosAtivos: ReadonlySet<EstiloTema>): TemaMes[] {
  const todos = TEMAS_MES_POR_ESTILO[month] ?? [];
  const filtrados = todos.filter((t) => estilosAtivos.has(t.estilo));
  // Sempre garante pelo menos uma sugestão visível
  return filtrados.length > 0 ? filtrados : todos.slice(0, 1);
}