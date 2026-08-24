# Melhorias no Telemarketing (tela do operador)

Três ajustes na operação de ligações: obrigar o registro de em quem a pessoa vota quando ela diz que não vota, mudar o retorno automático da fila de 1h para 6h e criar uma busca para registrar pesquisa de quem retornou a ligação.

## 1. "Não vota" exige informar o candidato

Hoje o campo "Candidato que apoia" aparece como opcional quando o operador marca "Não vota" ou "Indeciso".

- Quando o resultado for **Atendeu** e a resposta for **Não vota**, o campo passa a ser obrigatório: rótulo "Vota em quem? (obrigatório)" e bloqueio do botão Salvar até estar preenchido, com aviso claro.
- Para **Indeciso** o campo continua opcional (a pessoa não declarou voto), mas ganha texto de ajuda ("se citou algum nome, registre aqui").
- Validação também no servidor: a função de registro de ligação rejeita `atendeu` + `nao` sem candidato alternativo, para que nenhum caminho salve o dado incompleto.

## 2. Retorno à fila em 6 horas (em vez de 1 hora)

- O botão passa a ser "Não atendeu (+6h)" e pré-preenche a próxima tentativa com agora + 6 horas.
- Mesma regra aplicada como padrão no servidor: se o operador salvar "não atendeu" sem data, o contato volta à fila 6 horas depois (hoje ele pode voltar imediatamente).
- O operador continua podendo editar a data/hora manualmente.

## 3. Busca de contato para registrar retorno de ligação

Nova barra de busca no topo da tela do operador, para o caso de a pessoa ligar de volta.

- Campo único: digitar nome ou telefone (busca por trecho, ignorando máscara/DDI — usa a mesma normalização já usada no botão do WhatsApp).
- Resultados mostram nome, telefone, cidade, indicador, status atual da ligação e operador que atendeu antes; inclui contatos **pendentes, agendados e já trabalhados** da carteira do operador (hoje a lista só traz pendentes, então quem já foi marcado como "não atendeu" desaparece da tela).
- Ao escolher um resultado, o contato abre no mesmo painel de atendimento (com trava de atendimento) e o operador registra o resultado normalmente — inclusive sobrescrevendo um "não atendeu" anterior por "atendeu / vota / não vota / indeciso".
- Cada registro continua gerando uma linha no histórico de ligações, então o retorno aparece nos relatórios e no ranking por indicador sem contagem duplicada de contato.
- Botão "Voltar para a fila" para retomar o fluxo automático depois de atender o retorno.

## Detalhes técnicos

- `src/pages/Telemarketing.tsx`: validação obrigatória de `candidatoAlt` quando `votaCandidato === "nao"`, mudança do preset de +1h para +6h, novo componente de busca e seleção de contato fora da fila.
- Nova função `tele_buscar_contato` (SECURITY DEFINER, autenticada pelo par nome/senha do operador como as demais `tele_*`): busca por nome/telefone normalizado nas cinco origens já cobertas por `tele_list_contatos` (`telemarketing_contatos_avulsos`, `contratados`, `contratado_indicados`, `eleicao_indicados`, `eleicao_pessoas`), respeitando `assigned_operador_id`, `lista_atual_id` e campanha, e sem o filtro de "apenas pendentes".
- `tele_registrar_ligacao`: rejeitar `atendeu` + `vota_candidato = 'nao'` sem `candidato_alternativo`; usar `now() + interval '6 hours'` como `proxima_tentativa_em` padrão para `nao_atendeu` sem data informada.
- Sem mudanças de schema; apenas funções e UI.
