# Filas com operadores marcados por caixinha (fim do "Pool livre")

Hoje uma fila em "Pool livre" é aberta para qualquer operador ativo do cliente: os contatos ficam sem dono (`assigned_operador_id` nulo) e a única regra é "mesma campanha". Por isso não existe como tirar um operador da fila — não há nenhuma lista de quem pode trabalhar nela. A melhoria é criar essa lista: cada fila passa a ter **operadores marcados**, e só eles recebem contatos dela.

## Como vai ficar para você

### Na aba Filas
- Cada card da fila mostra os operadores liberados (ex.: "Ariana, João +2") e um botão **Operadores da fila**.
- Nesse painel: uma caixinha por operador ativo, com marcar/desmarcar, "Marcar todos", "Desmarcar todos" e o número de pendentes que cada um já tem naquela fila.
- Ao desmarcar alguém: aviso claro do que vai acontecer com os contatos que estavam com ele e três opções:
  - devolver os contatos dele para a fila (para os operadores que continuam),
  - repassar para um operador específico,
  - manter os contatos parados com ele (só bloqueia novas puxadas).
- Fila sem nenhum operador marcado aparece com etiqueta **"Sem operador — ninguém liga"**, para não ficar invisível.

### Na criação da fila (assistente)
- O passo "Quem vai ligar" perde a opção "Pool livre" e passa a ter, sempre, as caixinhas de operadores. Duas escolhas depois de marcar:
  - **Compartilhada**: os marcados puxam da mesma fila, sem contato repetido (é o comportamento atual do pool, mas restrito aos marcados).
  - **Dividir igualmente**: cada marcado recebe sua fatia fixa (round-robin, já existente).
- "Um operador específico" continua funcionando: é simplesmente uma caixinha marcada.

### Na tela do operador
- O operador só vê e só puxa contatos das filas em que está marcado. Ao tirá-lo de uma fila, na próxima busca de contato ele já não recebe nada dela.

## Migração dos dados atuais
As filas existentes em pool livre serão convertidas para "todos os operadores ativos marcados", ou seja, nada muda no dia a dia até você desmarcar alguém. Contatos já designados a um operador continuam com ele.

## Detalhes técnicos

- Nova tabela `telemarketing_campanha_operadores` (`client_id`, `campanha_id`, `operador_id`, `ativo`, timestamps, único por campanha+operador), com GRANTs para `authenticated`/`service_role` e RLS por membro do `client_id`; escrita apenas por admin do cliente (`_tele_assert_client_admin`).
- Coluna `modo_designacao` em `telemarketing_campanhas` (`compartilhada` | `dividida`), default `compartilhada`, só para rótulo/UX.
- Migração de dados: para cada campanha existente, inserir todos os operadores ativos do cliente como marcados.
- RPCs alteradas para respeitar a lista (operador precisa estar marcado na campanha):
  - `tele_proximo_contato` — no filtro de candidatos, exigir vínculo em `telemarketing_campanha_operadores` para a campanha do contato; contatos sem dono só são puxados por operador marcado.
  - `tele_list_contatos`, `tele_buscar_contato` — mesmo filtro, para a lista e a busca do operador.
  - `tele_operador_campanhas` — retornar apenas campanhas em que o operador está marcado.
- Novas RPCs (`SECURITY DEFINER`, admin do cliente):
  - `tele_fila_operadores(_client_id, _campanha_id)` — operadores ativos + marcado sim/não + pendentes/ligados na fila.
  - `tele_fila_set_operadores(_client_id, _campanha_id, _operador_ids, _modo, _acao_remocao)` — grava a marcação e aplica `devolver` / `repassar` / `manter` nos contatos de quem saiu, reaproveitando `tele_release_contatos` e `tele_reassign_from_operador`.
- `tele_fila_summary` passa a devolver `operadores_marcados` (contagem) para o badge do card.
- Front:
  - novo `src/components/telemarketing/FilaOperadoresDialog.tsx` (caixinhas + escolha do que fazer com os contatos de quem sai);
  - `src/pages/TelemarketingAdminFilas.tsx` — botão/badge por fila e recarga após salvar;
  - `src/components/telemarketing/NovaFilaWizard.tsx` — passo 5 sem "Pool livre", com caixinhas + Compartilhada/Dividir, e a marcação enviada na criação;
  - textos de ajuda em `telemarketing-help.ts` atualizados (sai "pool livre", entra "operadores da fila"); `AtribuicoesDialog.tsx` e `AdicionarContatosDialog.tsx` passam a chamar essa condição de "Livre para os operadores da fila".

## Ordem de execução
1. Migração (tabela, coluna, GRANTs/RLS, preenchimento das filas atuais).
2. RPCs de leitura/gravação da marcação + travas nas RPCs do operador.
3. Painel "Operadores da fila" na aba Filas.
4. Assistente de nova fila sem pool livre.
5. Ajuste de textos e badges.
