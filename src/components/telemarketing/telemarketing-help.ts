// Textos de ajuda do módulo de telemarketing (linguagem simples, para quem opera a campanha).

export const TELE_TAB_HELP: { path: string; title: string; text: string }[] = [
  {
    path: "/telemarketing-admin/filas",
    title: "Filas de ligação",
    text:
      "Cada fila é um pacote de contatos para os operadores ligarem. Aqui você cria filas a partir de uma planilha, da estrutura eleitoral ou dos indicados, adiciona mais contatos depois e distribui entre os operadores.",
  },
  {
    path: "/telemarketing-admin/listas",
    title: "Listas importadas",
    text:
      "Mostra as planilhas que você subiu, quantos contatos cada uma trouxe e a qual fila pertencem. Use para conferir importações e arquivar listas que não serão mais usadas.",
  },
  {
    path: "/telemarketing-admin/resultados",
    title: "Resultados detalhados",
    text:
      "Todas as ligações registradas, contato por contato: quem atendeu, o que respondeu e qual operador falou. Use para auditar o trabalho e revisar respostas.",
  },
  {
    path: "/telemarketing-admin/relatorios",
    title: "Relatórios",
    text:
      "Números consolidados da operação (ligações por dia, taxa de atendimento, intenção de voto) para exportar e apresentar.",
  },
  {
    path: "/telemarketing-admin/ranking",
    title: "Ranking",
    text:
      "Compara o desempenho dos operadores e dos indicadores (quem indicou contatos de melhor qualidade). Clique em um nome para ver o detalhe.",
  },
  {
    path: "/telemarketing-admin/operadores",
    title: "Operadores",
    text:
      "Cadastre quem vai ligar, defina nome de acesso e senha, ative ou desative. É com esse login que a pessoa acessa a fila no celular.",
  },
  {
    path: "/telemarketing-admin/configuracoes",
    title: "Configurações",
    text:
      "Regras gerais: tentativas por contato, tempo de reserva de um contato com o operador, opções de resposta e textos de apoio da ligação.",
  },
  {
    path: "/telemarketing-admin",
    title: "Visão geral",
    text:
      "Resumo do dia: ligações feitas, contatos pendentes, operadores online e resultados recentes. Comece por aqui para saber se a operação está andando.",
  },
];

export function getTeleTabHelp(pathname: string) {
  return TELE_TAB_HELP.find((h) => pathname === h.path)
    ?? TELE_TAB_HELP.find((h) => pathname.startsWith(h.path));
}

export const TELE_HELP = {
  adicionarContatos:
    "Acrescenta novos contatos a uma fila que já existe, sem criar outra. Você escolhe a origem (planilha, estrutura, indicados) e vê uma prévia de quantos entrarão. Quem já está na fila não é duplicado.",
  gerenciarDesignacoes:
    "Aqui você decide quem liga para quem: selecione contatos e atribua a um operador, distribua igualmente entre vários ou deixe livre para os operadores marcados nesta fila.",
  buscarNovos:
    "Repete o mesmo filtro usado quando a fila foi criada e traz apenas as pessoas cadastradas depois disso. Útil quando a lista de um indicador cresce ao longo dos dias.",
  redistribuirFila:
    "Divide novamente todos os contatos pendentes da fila entre os operadores escolhidos. Contatos já ligados não são afetados.",
  removerDaFila:
    "Tira os contatos selecionados desta fila. Eles continuam cadastrados no sistema, apenas deixam de aparecer para os operadores.",
  liberar:
    "Remove a designação fixa e deixa o contato livre para qualquer operador marcado nesta fila puxá-lo.",
  poolLivre:
    "Contato sem operador fixo: o próximo operador marcado nesta fila que pedir um contato pode recebê-lo. Contatos atribuídos aparecem só para o operador escolhido.",
  origemFila:
    "De onde vieram os contatos desta fila e qual filtro foi usado (por exemplo: indicados de um coordenador específico, só de uma cidade).",
  statusLigacao:
    "Pendente = ainda não foi ligado. Os demais status são o resultado registrado pelo operador (atendeu, não atendeu, reagendou, etc.).",
  indicadoPor:
    "Filtra apenas as pessoas indicadas por um coordenador, líder ou cabo específico. Digite parte do nome para encontrar rapidamente.",
} as const;
