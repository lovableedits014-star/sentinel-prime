# Refino do Telemarketing — import de listas, atribuição e multi-campanha

Hoje o sistema já tem campanhas, mailing avulso e link do operador por fila. Falta 3 coisas: **subir arquivo de verdade** (XLSX/CSV com mapeamento de colunas), **designar contatos a operadores específicos** e o **operador enxergar/alternar entre várias campanhas** no portal dele. Nada do envio existente é quebrado.

## O que muda para o usuário

### 1. Importar lista externa (arquivo)
Dentro de **Telemarketing → Campanhas** (e no wizard "Nova fila"), substitui o "cole CSV" por um botão **"Importar arquivo"** que:
- aceita `.xlsx`, `.xls`, `.csv` (mesmo motor do `ConverterListaExternaDialog`);
- detecta colunas automaticamente e deixa mapear (Nome*, Telefone*, Cidade, Bairro, TAG opcional);
- mostra preview + quantos válidos/ignorados antes de confirmar;
- vincula a lista importada a **uma campanha** (nova ou existente), então cada campanha continua sendo "uma lista de ligação" independente;
- o "colar CSV" continua funcionando como atalho, mas fica secundário.

### 2. Designar contatos por operador
Nova aba **"Designações"** na Campanha:
- Lista os contatos daquela campanha com filtros (pendentes, ligados, cidade/bairro, sem operador designado).
- Ações em lote: selecionar N contatos → **"Atribuir a…"** operador X, ou **"Distribuir igualmente"** entre operadores marcados (round-robin server-side).
- Botão **"Liberar"** volta o contato pro pool livre (sem dono).
- Cada operador vê no card da campanha "X pendentes atribuídos a mim / Y no pool livre".

Regra de acesso na fila do operador:
- Se o contato tem `assigned_operador_id`, só aquele operador puxa.
- Se está sem dono, qualquer operador da campanha pode puxar (mantém compatível com o comportamento atual).
- Nada trava chamadas em andamento — a designação só afeta quem consegue reservar o próximo.

### 3. Operador com várias campanhas
Ao logar em `/telemarketing/:clientId`, se o link não trouxer `?campanha=...`, o operador cai numa **tela de seleção de campanha** listando só as campanhas com contatos disponíveis pra ele (atribuídos + livres). Cada card mostra: nome da campanha, pendentes meus, pendentes no pool, próximo contato. Ele escolhe e entra na fila daquela campanha. Botão "Trocar de campanha" fica sempre visível no header.

Isso permite um mesmo operador atender várias campanhas com o mesmo login, sem precisar de link diferente pra cada uma (o link direto continua funcionando quando o admin quer forçar).

### 4. Ajustes menores
- Card da campanha na tela de admin mostra: total, pendentes livres, pendentes atribuídos, operadores com trabalho pendente.
- Log de designação (quem atribuiu, quando, quantos) num painel simples de auditoria por campanha.
- Ao remover um operador, os contatos dele voltam automaticamente pro pool livre.

## Detalhes técnicos

**Migração (schema):**
- `telemarketing_contatos_avulsos`: nova coluna `assigned_operador_id uuid NULL` (FK → `telemarketing_operadores.id ON DELETE SET NULL`) + índice `(client_id, campanha_id, assigned_operador_id, ligacao_status)`.
- Nova tabela `telemarketing_assignment_log(id, client_id, campanha_id, operador_id, contatos_count, criado_por, criado_em)` com RLS por `client_id` + `has_role`, GRANTs padrão.
- Trigger `AFTER DELETE` em `telemarketing_operadores` limpando `assigned_operador_id` dos contatos daquele operador (backup do ON DELETE SET NULL para o caso de deletes via RPC).

**RPCs novas (SECURITY DEFINER, checam papel admin do client via `has_role`):**
- `tele_assign_contatos(_client_id, _campanha_id, _contato_ids uuid[], _operador_id uuid)` — atualiza em lote, registra log.
- `tele_distribute_contatos(_client_id, _campanha_id, _contato_ids uuid[], _operador_ids uuid[])` — round-robin server-side entre operadores dados.
- `tele_release_contatos(_client_id, _campanha_id, _contato_ids uuid[])` — zera `assigned_operador_id`.
- `tele_operador_campanhas(_operador_id)` — retorna campanhas ativas do client com counts (pendentes_meus, pendentes_livres, total) para a tela de seleção.
- `tele_import_contato_avulso_batch` (existente) ganha aceitação de `_assigned_operador_id` opcional pra já atribuir na hora do import.

**RPCs alteradas:**
- Função que serve o "próximo contato" da fila (a que usa `telemarketing_call_assignments`) passa a filtrar `assigned_operador_id IS NULL OR assigned_operador_id = _operador_id`.
- `tele_fila_summary` devolve também `atribuidos` e `livres` além de pendentes.

**Frontend:**
- Novo `ImportContatosAvulsosDialog.tsx` reaproveitando parser XLSX/CSV do `ConverterListaExternaDialog` (só a leitura + mapeamento; grava via RPC de import existente).
- `TelemarketingAdminCampanhas.tsx`: aba "Designações" com tabela + seleção múltipla + menu "Atribuir/Distribuir/Liberar" (usa shadcn `DataTable`-like já disponível no projeto).
- `NovaFilaWizard.tsx`: passo CSV vira "Importar arquivo" (mesmo componente) com fallback pra colar texto.
- `Telemarketing.tsx` (portal do operador): quando não há `?campanha=` no link, renderiza `CampanhaPickerScreen` (nova) que chama `tele_operador_campanhas`. Botão "Trocar de campanha" no header preserva sessão do operador (localStorage do nome/senha atual já existe).
- `TelemarketingSettingsCard.tsx`: ao deletar operador, mostra aviso "X contatos designados vão voltar pro pool" (backend já cuida disso).

**Compatibilidade:**
- Contatos existentes ficam com `assigned_operador_id = NULL` → aparecem como pool livre pra todos os operadores da campanha (comportamento atual).
- Link direto `/telemarketing/:clientId?campanha=...` continua entrando direto na campanha, sem picker.
- Nada muda no fluxo de ligar/registrar resultado.

## Passos de implementação
1. Migração (schema + RPCs + índice + trigger).
2. Dialog de import por arquivo + integração no `TelemarketingAdminCampanhas` e no wizard.
3. Aba "Designações" com atribuir/distribuir/liberar + card resumido com counts.
4. Picker de campanha no portal do operador + botão "Trocar de campanha".
5. Ajuste do "próximo contato" pra respeitar `assigned_operador_id`.
6. Smoke test manual: importa XLSX → distribui entre 2 operadores → cada operador loga, vê só o que é dele + pool livre → confirma que operador sem atribuição ainda pega do pool.
