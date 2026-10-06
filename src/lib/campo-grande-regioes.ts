export type RegiaoCampoGrande =
  | "centro"
  | "segredo"
  | "prosa"
  | "bandeira"
  | "anhanduizinho"
  | "lagoa"
  | "imbirussu"
  | "moreninha";

export const REGIAO_CAMPO_GRANDE_LABEL: Record<RegiaoCampoGrande, string> = {
  centro: "Centro",
  segredo: "Segredo",
  prosa: "Prosa",
  bandeira: "Bandeira",
  anhanduizinho: "Anhanduizinho",
  lagoa: "Lagoa",
  imbirussu: "Imbirussu",
  moreninha: "Moreninha",
};

export const normalizarLocalidade = (value: string | null | undefined) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleUpperCase("pt-BR")
    .replace(/\b(DO|DA|DOS|DAS|DE)\b/g, " ")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

const ALIASES: Record<Exclude<RegiaoCampoGrande, "moreninha">, string[]> = {
  centro: [
    "Centro",
    "São Francisco",
    "Cruzeiro",
    "Jardim dos Estados",
    "Bela Vista",
    "Itanhangá",
    "Itanhangá Park",
    "São Bento",
    "Monte Líbano",
    "Glória",
    "Carvalho",
    "Amambaí",
    "Cabreúva",
    "Planalto",
    "Vila Carvalho",
    "Vila Corumbá",
    "Vila Célia",
    "Vila Gomes",
    "Vila Planalto",
    "Vila Rosa",
    "Vila Rosa Pires",
    "Vila Santa Dorothéia",
    "Miguel Couto",
    "Eudes Costa",
  ],
  segredo: [
    "José Abrão",
    "Nasser",
    "Seminário",
    "Monte Castelo",
    "Mata do Segredo",
    "Coronel Antonino",
    "Nova Lima",
    "Campo Belo",
    "Campo Novo",
    "Coophasul",
    "Conjunto Residencial Octavio Pécora",
    "Estrela do Sul",
    "Jardim Anache",
    "Jardim Colúmbia",
    "Jardim Seminário",
    "Manoel Taveira",
    "Nascente do Segredo",
    "Vida Nova",
    "Vida Nova III",
    "Vila Nasser",
    "Vila Santa Luzia",
  ],
  prosa: [
    "Autonomista",
    "Santa Fé",
    "Chácara Cachoeira",
    "Carandá",
    "Carandá Bosque",
    "Margarida",
    "Mata do Jacinto",
    "Novos Estados",
    "Estrela Dalva",
    "Estrela D'Alva I",
    "Veraneio",
    "Chácara dos Poderes",
    "Noroeste",
    "Jardim Autonomista",
    "Jardim Noroeste",
    "Nova Bahia",
    "Novo Maranhão",
    "Vila do Polonês",
    "Vila Manoel da Costa Lima",
    "Vila Margarida",
    "Vila Rica",
    "Vivendas do Bosque",
  ],
  bandeira: [
    "Jardim Paulista",
    "TV Morena",
    "Vilasboas",
    "Vila Vilas Boas",
    "São Lourenço",
    "Tiradentes",
    "Maria Aparecida Pedrossian",
    "Rita Vieira",
    "Carlota",
    "Vila Carlota",
    "Dr. Albuquerque",
    "Doutor Albuquerque",
    "Vila Albuquerque",
    "Universitário",
    "Coopharádio",
    "Dalva de Oliveira",
    "Jardim Flamboyant",
    "Jardim Itamaracá",
    "Jardim Pacaembú",
    "Loteamento Marçal de Souza",
    "Oliveira I",
    "Parque Residencial Maria Aparecida Pedrossian",
    "Parque Residencial Rita Vieira",
    "Residencial Betaville",
    "Residencial Oiti",
    "Três Barras",
    "Vila Almeida",
    "Vila Santo Eugênio",
    "Chácara das Mansões",
    "Conjunto Residencial Recanto dos Rouxinóis",
  ],
  anhanduizinho: [
    "Taquarussu",
    "Jockey Club",
    "Jardim Jockey Clube",
    "América",
    "Piratininga",
    "Jacy",
    "Guanandi",
    "Aero Rancho",
    "Conjunto Aero Rancho",
    "Jardim Aero Rancho",
    "Parati",
    "Pioneiros",
    "Alves Pereira",
    "Centenário",
    "Lageado",
    "Los Angeles",
    "Centro-Oeste",
    "Centro Oeste",
    "Dom Antônio Barbosa",
    "Jardim Canguru",
    "Jardim Colibri II",
    "Jardim Colonial",
    "Jardim das Hortênsias",
    "Jardim das Macaúbas",
    "Jardim das Meninas",
    "Jardim Los Angeles",
    "Jardim Morenão",
    "Jardim Nhánhá",
    "Vila Nhanha",
    "Jardim Paulo Coelho Machado",
    "Jardim Penfigo",
    "Núcleo Habitacional Universitárias",
    "Parque Residencial Iracy Coelho Netto",
    "Vila Alves Pereira",
    "Vila Piratininga",
    "Vila Santa Branca",
    "Jardim Botafogo",
  ],
  lagoa: [
    "Taveirópolis",
    "Bandeirantes",
    "Vila Bandeirante",
    "Caiçara",
    "União",
    "Leblon",
    "Jardim Leblon",
    "São Conrado",
    "Tijuca",
    "Caiobá",
    "Batistão",
    "Coophavila II",
    "Tarumã",
    "Bonança",
    "Buriti",
    "Jardim Ouro Verde",
    "Jardim Santa Emília",
    "Jardim São Conrado",
    "Jardim Tarumã",
    "Jardim Tijuca",
    "Jardim Tijuca I",
    "Jardim Tijuca II",
    "Loteamento Bela Laguna",
    "Oliveira III",
    "Portal Caiobá",
    "Portal Caiobá II",
    "Residencial Oliveira",
    "São Pedro",
    "Vila Belo Horizonte",
    "Vila Jussara",
  ],
  imbirussu: [
    "Sobrinho",
    "Santo Amaro",
    "Santo Antônio",
    "Panamá",
    "Jardim Panamá",
    "Popular",
    "Nova Campo Grande",
    "Núcleo Industrial",
    "Aeroporto",
    "Coophatrabalho",
    "Jardim Imá",
    "Jardim Petrópolis",
    "Recanto dos Pássaros",
    "Vila Alba",
    "Vila Eliane",
    "Vila Palmira",
    "Vila Popular",
    "Vila Serradinho",
    "Vila Silvia Regina",
    "Vila Sobrinho",
    "Zé Pereira",
  ],
};

const INDEX = new Map<string, Exclude<RegiaoCampoGrande, "moreninha">>();
for (const [region, names] of Object.entries(ALIASES)) {
  for (const name of names)
    INDEX.set(normalizarLocalidade(name), region as Exclude<RegiaoCampoGrande, "moreninha">);
}

const MORENINHA_ALIASES = new Set(
  [
    "Moreninha",
    "Moreninha I",
    "Moreninha II",
    "Moreninha III",
    "Moreninha IV",
    "Vila Cidade Morena",
  ].map(normalizarLocalidade),
);

export type ClassificacaoBairro = {
  regiao: string | null;
  fonte: "manual" | "planurb" | "nao_classificado";
};

export function classificarBairroCampoGrande(
  bairro: string | null | undefined,
  overrides: Map<string, string> = new Map(),
  regioesDisponiveis: Set<string> = new Set(),
): ClassificacaoBairro {
  const key = normalizarLocalidade(bairro);
  if (!key) return { regiao: null, fonte: "nao_classificado" };
  const override = overrides.get(key);
  if (override) return { regiao: override, fonte: "manual" };
  if (MORENINHA_ALIASES.has(key) && regioesDisponiveis.has("moreninha")) {
    return { regiao: "moreninha", fonte: "planurb" };
  }
  if (MORENINHA_ALIASES.has(key)) return { regiao: "bandeira", fonte: "planurb" };
  return INDEX.has(key)
    ? { regiao: INDEX.get(key) || null, fonte: "planurb" }
    : { regiao: null, fonte: "nao_classificado" };
}
