# Padronização das respostas no Telemarketing (estadual, federal, senador e governador)

Hoje o operador tem 4 botões (Atendeu / Não atendeu / Recusou / Reagendar) e um único campo livre "Candidato que apoia" — por isso os relatórios mostram dezenas de variações do mesmo "não quis responder". O objetivo é fechar o fluxo em opções padronizadas e separar Deputado Estadual (nosso oficial) de Deputado Federal.

## 1. Fim do "Recusou"

- O botão "Recusou" sai da tela do operador. Recusa passa a ser tratada como **Não atendeu** (volta à fila depois de 6h, como as outras).
- Os registros antigos com "Recusou" são convertidos para "Não atendeu", então voltam ao ciclo de ligação normalmente e deixam de aparecer como categoria própria.
- Relatórios, filtros e exportações deixam de listar "Recusou" (Resultados, Relatórios, Scorecard por indicador, Designações).

## 2. Fluxo padronizado quando a pessoa atende

**Passo 1 — Deputado Estadual (nosso candidato oficial)**

Quatro opções fixas:

| Opção | O que acontece |
|---|---|
| Vota | segue para o federal |
| Não vota | abre campo obrigatório "Vota em quem?" (nome do estadual que ela citou) e segue para o federal |
| Indeciso | segue para o federal (campo de nome citado fica opcional) |
| Não quis opinar | **encerra o atendimento** — não pergunta federal, salva direto |

**Passo 2 — Deputado Federal (sempre perguntado, exceto em "Não quis opinar")**

- Campo de nome do federal **obrigatório**, OU
- Botão/checkbox **"Não quis responder"** — que preenche o registro de forma padronizada e libera o salvamento.

Enquanto o passo obrigatório não estiver resolvido, o botão Salvar fica bloqueado com aviso claro (mesmo padrão já usado hoje no "não vota").

## 3. Anti-lixo nos dados

- Sugestões de nomes já registrados (autocomplete a partir dos candidatos citados anteriormente do mesmo cliente), para evitar "Paulo Duarte" vs "paulo duarte".
- Normalização ao salvar: trim, espaços duplicados e capitalização consistente.
- Frases como "não sabe", "não quis citar", "nenhum" deixam de ser digitadas: existem as opções fixas para isso.

## 4. Relatórios

- Novas colunas/blocos: **Voto Estadual** (Vota / Não vota / Indeciso / Não quis opinar) e **Voto Federal** (nome, ou "Não quis responder").
- "Candidatos Alternativos Mencionados" passa a ter dois rankings limpos: alternativos do estadual e citações do federal, com "Não quis responder" agrupado num único item em vez de dez variações.
- Excel e PDF incluem as duas dimensões.

## Detalhes técnicos

- Migração: adicionar `candidato_federal` (texto) e `federal_status` (`informado` | `nao_quis_responder`) nas 5 origens de contato já usadas pelo telemarketing (`telemarketing_contatos_avulsos`, `contratados`, `contratado_indicados`, `eleicao_indicados`, `eleicao_pessoas`) e em `telemarketing_call_log`; ampliar os valores aceitos de `vota_candidato` com `nao_quis_opinar`.
- `UPDATE` de dados: converter `ligacao_status = 'recusou'` → `'nao_atendeu'` nas mesmas tabelas e no log.
- `tele_registrar_ligacao`: aceitar/validar os novos parâmetros — rejeita `atendeu` + estadual `nao` sem alternativo (já existe), e rejeita `atendeu` (estadual ≠ `nao_quis_opinar`) sem federal informado nem `nao_quis_responder`; normaliza os nomes.
- `tele_list_contatos`, `tele_buscar_contato`, `tele_indicador_report_rows` e as views de relatório: expor os novos campos.
- Frontend: `src/pages/Telemarketing.tsx` (remoção do botão, fluxo em passos, validações), `TelemarketingResultsPanel.tsx`, `TelemarketingReportsPanel.tsx`, `TelemarketingIndicadorScorecard.tsx`, `DesignarEleicaoPanel.tsx` (remover filtro "Recusou", somar colunas federal/estadual, exports).
