export type LinhaConferencia = {
  nome: string;
  telefone: string;
};

const chaveCabecalho = (valor: unknown) =>
  String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const ALIASES = {
  nome: [
    "nome",
    "nomecompleto",
    "nomedoeleitor",
    "nomedapessoa",
    "nomecontato",
    "pessoa",
    "contato",
    "colaborador",
    "cabo",
    "lider",
  ],
  telefone: [
    "telefone",
    "telefonecelular",
    "numerodetelefone",
    "celular",
    "celularwhatsapp",
    "whatsapp",
    "fone",
  ],
} as const;

const encontrar = (linha: Record<string, unknown>, aliases: readonly string[]) => {
  const indexada = Object.fromEntries(
    Object.entries(linha).map(([cabecalho, valor]) => [chaveCabecalho(cabecalho), valor]),
  );
  return aliases.map((alias) => indexada[alias]).find((valor) => valor !== undefined);
};

export function normalizarLinhasConferencia(linhas: Record<string, unknown>[]): LinhaConferencia[] {
  return linhas
    .map((linha) => ({
      nome: String(encontrar(linha, ALIASES.nome) ?? "").trim(),
      telefone: String(encontrar(linha, ALIASES.telefone) ?? "").replace(/\D/g, ""),
    }))
    .filter((linha) => linha.nome || linha.telefone);
}

export function formatarTelefoneConferencia(valor: string | null | undefined) {
  const digitos = String(valor ?? "")
    .replace(/\D/g, "")
    .slice(-11);
  if (digitos.length === 11) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
  }
  if (digitos.length === 10) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
  }
  return valor || "—";
}

export const CONFERENCIA_CLASSIFICACOES = {
  dentro: { label: "Dentro", tone: "success" },
  outra_lideranca: { label: "Outra liderança", tone: "warning" },
  sem_contrato: { label: "Sem contrato ativo", tone: "warning" },
  arquivado: { label: "Arquivado", tone: "muted" },
  nao_encontrado: { label: "Fora do sistema", tone: "danger" },
  possivel_correspondencia: { label: "Possível por nome", tone: "warning" },
  conflito_nome: { label: "Nome divergente", tone: "danger" },
  repetido_lista: { label: "Repetido na lista", tone: "muted" },
  dados_invalidos: { label: "Dados inválidos", tone: "danger" },
  ausente_lista: { label: "Saiu / ausente", tone: "danger" },
} as const;

export type ClassificacaoConferencia = keyof typeof CONFERENCIA_CLASSIFICACOES;
