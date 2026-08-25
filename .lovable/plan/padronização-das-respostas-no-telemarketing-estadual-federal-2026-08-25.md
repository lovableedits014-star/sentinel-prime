# Padronização das respostas no Telemarketing (estadual, federal, senador e governador)

Hoje o operador tem 4 botões (Atendeu / Não atendeu / Recusou / Reagendar) e um único campo livre "Candidato que apoia" — por isso os relatórios mostram dezenas de variações do mesmo "não quis responder". O objetivo é fechar o fluxo em opções padronizadas e separar Deputado Estadual (nosso oficial) de Deputado Federal.

## 1. Fim do "Recusou"

- O botão "Recusou" sai da tela do operador. Recusa passa a ser tratada como **Não atendeu** (volta à fila depois de 6h, como as outras).
- Os registros antigos com "Recusou" são convertidos para "Não atendeu", então voltam ao ciclo de ligação normalmente e deixam de aparecer como categoria própria.
- Relatórios, filtros e exportações deixam de listar "Recusou" (Resultados, Relatórios, Scorecard por indicador, Designações).

## 2. Fluxo padronizado quando a pessoa atende

**Passo 1 — Deputado Estadual (nosso candidato oficial)**

| Opção | O que acontece |
|---|---|
| Vota | já confirma o voto no nosso estadual e segue para os demais cargos |
| Não vota | abre campo **obrigatório** "Qual estadual vota?" — informado o nome, segue para os demais cargos |
| Indeciso | segue para os demais cargos (campo de nome citado fica opcional) |
| Não quis opinar | **encerra tudo** — nenhum outro cargo é perguntado, salva direto |

Se em "Não vota" a pessoa não quiser dizer o nome, o operador usa **Não quis opinar**, que encerra o atendimento. Não existe mais texto livre tipo "não quis citar".

**Passo 2 — Federal, Senador e Governador (sempre que o passo 1 não foi "Não quis opinar")**

Três blocos iguais, um para cada cargo:

- **Deputado Federal** — nome obrigatório OU botão "Não quis responder"
- **Senador** — nome obrigatório OU botão "Não quis responder"
- **Governador** — nome obrigatório OU botão "Não quis responder"

Cada bloco só é considerado resolvido com nome preenchido ou com "Não quis responder" marcado. Enquanto houver bloco em aberto, o botão Salvar fica bloqueado com aviso claro (mesmo padrão já usado hoje no "não vota").

## 3. Anti-lixo nos dados

- Sugestões de nomes já registrados (autocomplete por cargo, a partir do que já foi citado no mesmo cliente), para evitar "Paulo Duarte" vs "paulo duarte".
- Normalização ao salvar: trim, espaços duplicados e capitalização consistente.
- Frases como "não sabe", "não quis citar", "nenhum" deixam de ser digitadas: existem as opções fixas para isso.

## 4. Relatórios

- Novos blocos/colunas por cargo: **Estadual** (Vota / Não vota + nome / Indeciso / Não quis opinar), **Federal**, **Senador** e **Governador** (nome ou "Não quis responder").
- "Candidatos Alternativos Mencionados" passa a ter um ranking limpo por cargo, com "Não quis responder" agrupado em um único item em vez de dez variações.
- Excel e PDF incluem as quatro dimensões, e os filtros por cargo/nome ficam disponíveis para cobrança por indicador.


## Detalhes técnicos

- Migração: adicionar, nas 5 origens de contato já usadas pelo telemarketing (`telemarketing_contatos_avulsos`, `contratados`, `contratado_indicados`, `eleicao_indicados`, `eleicao_pessoas`) e em `telemarketing_call_log`, os pares `candidato_federal`/`federal_status`, `candidato_senador`/`senador_status` e `candidato_governador`/`governador_status` (status: `informado` | `nao_quis_responder`); ampliar os valores aceitos de `vota_candidato` com `nao_quis_opinar`.
- `UPDATE` de dados: converter `ligacao_status = 'recusou'` → `'nao_atendeu'` nas mesmas tabelas e no log.
- `tele_registrar_ligacao`: novos parâmetros e validação — rejeita `atendeu` + estadual `nao` sem alternativo (já existe) e, quando o estadual ≠ `nao_quis_opinar`, exige para federal, senador e governador nome informado ou `nao_quis_responder`; normaliza os nomes.
- `tele_list_contatos`, `tele_buscar_contato`, `tele_indicador_report_rows` e as views de relatório: expor os novos campos.
- Frontend: `src/pages/Telemarketing.tsx` (remoção do botão "Recusou", fluxo em passos com os 4 cargos, validações), `TelemarketingResultsPanel.tsx`, `TelemarketingReportsPanel.tsx`, `TelemarketingIndicadorScorecard.tsx`, `DesignarEleicaoPanel.tsx` (remover filtro "Recusou", colunas e agregações por cargo, exports).
