## Levantamento — o que existe hoje de Telemarketing

### 1. Fluxo do operador (público, sem login do Supabase)
- **Página `/telemarketing/:clientId`** (`src/pages/Telemarketing.tsx`, 511 linhas):
  - Tela de login do operador (nome + senha) validada por RPC `verify_telemarketing_operador`.
  - Carrega contatos via RPC `tele_list_contatos` (líderes, liderados de `contratados` + `contratado_indicados`).
  - Filtra apenas pendentes, mostra um por vez com click-to-call (`tel:`).
  - Formulário registra resultado via RPC `tele_registrar_ligacao`: status (atendeu / não atendeu / recusou), cidade/bairro, intenção de voto (sim/não/indeciso), candidato alternativo.
  - Filtros por tipo (todos / líder / liderado / indicado) e avanço automático para o próximo pendente.
- Link público gerado em `TelemarketingSettingsCard` (em Configurações).

### 2. Cadastro de operadores
- **`src/components/settings/TelemarketingSettingsCard.tsx`** (em `/settings`):
  - CRUD de operadores (`telemarketing_operadores`: nome, senha, ativo).
  - Toggle ativo/inativo, redefinição de senha, exclusão.
  - Exibe o link público do telemarketing.

### 3. Resultados e relatórios (espalhados)
- **`TelemarketingResultsPanel`** — usado em `Contratados` (aba interna). Lista com filtros (busca, status, voto, operador) + cards de KPI e desempenho por operador.
- **`TelemarketingReportsPanel`** — usado em **`/contratados/relatorios`** (`ContratadosRelatorios.tsx`). Gráficos (pizza intenção + status), barras por líder, ranking de candidatos alternativos, tabela detalhada, export CSV.
- **Dashboard `SuggestedActions`** — sugere "Indicados aguardando contato" linkando para `/telemarketing` (rota só existe com `:clientId`, então o link quebra).

### 4. Dados no banco
- `telemarketing_operadores` (id, client_id, nome, senha, ativo).
- Campos de chamada distribuídos em **`contratados`** e **`contratado_indicados`**: `ligacao_status`, `vota_candidato`, `candidato_alternativo`, `operador_nome`, `ligacao_em`.
- RPCs SECURITY DEFINER: `verify_telemarketing_operador`, `tele_list_contatos`, `tele_registrar_ligacao`.
- Hoje: **1 operador cadastrado, 0 ligações registradas**.

### 5. Lacunas e problemas atuais
1. **Sem área administrativa centralizada** — operadores em Settings, resultados em Contratados, relatórios em ContratadosRelatorios. Não há "Telemarketing" no sidebar.
2. `eleicao_indicados` (indicações públicas eleitorais) **não entra na fila** — só `contratado_indicados`.
3. Histórico imutável: ao re-ligar, a chamada anterior é sobrescrita (sem auditoria).
4. Sem **fila inteligente**: não distribui contatos entre operadores, não evita 2 operadores no mesmo contato, sem retomada/agendamento ("ligar de novo às 18h").
5. Sem **timer/sessão de operador** (tempo logado, ligações/hora, taxa de conversão real).
6. Sem **scripts de atendimento** configuráveis (perguntas-padrão, objeções).
7. Sem **listas/campanhas** (segmentar quem ligar primeiro: bairro X, líder Y, só indecisos da rodada anterior).
8. Sem **importação de mailing externo** (CSV avulso fora dos contratados/indicados).
9. Sem **export PDF**, sem agendamento de relatório, sem comparativo entre rodadas.
10. Link público acessível por qualquer um com o `clientId` — senha de operador é a única barreira; sem rate limit / bloqueio após X tentativas, sem expiração de senha.
11. Sem **tags/observações livres** por contato (objeção, motivo da recusa em texto).
12. Dashboard `SuggestedActions` link `/telemarketing` está quebrado (faltam `:clientId`).

---

## Plano de melhoria — Telemarketing como módulo dedicado

### Fase 1 — Centralização (UI / navegação) ⭐ prioridade
**Criar item "Telemarketing" no sidebar** (grupo "Mobilização" ou "Operacional", ícone `Headphones`), apontando para `/telemarketing-admin` (rota nova, autenticada — distinta da `/telemarketing/:clientId` que continua sendo o operador público).

Página `TelemarketingAdmin.tsx` com sub-abas (padrão `ContratadosSubNav`):

```text
/telemarketing-admin                  → Visão geral (KPIs + ações rápidas)
/telemarketing-admin/fila             → Fila ao vivo / contatos pendentes
/telemarketing-admin/resultados       → Lista detalhada (move TelemarketingResultsPanel)
/telemarketing-admin/relatorios       → Gráficos (move TelemarketingReportsPanel)
/telemarketing-admin/operadores       → CRUD (move TelemarketingSettingsCard)
/telemarketing-admin/campanhas        → (Fase 3) listas segmentadas
/telemarketing-admin/configuracoes    → Link público, script de atendimento, regras
```

Manter os panels existentes onde estão (Contratados/Settings) como atalhos OU removê-los de lá para evitar duplicação — sugestão: **remover de Settings e ContratadosRelatorios** e deixar tudo concentrado no novo módulo.

Corrigir link quebrado em `SuggestedActions` para `/telemarketing-admin/fila`.

### Fase 2 — Visão geral + monitor ao vivo
Aba **Visão geral** mostra:
- KPIs do dia: ligações feitas, taxa atendimento, % vota sim, operadores ativos agora.
- Top operadores (24h / 7d).
- Heatmap por hora (quando atendem mais).
- Lista de "operadores online" (última atividade < 5min) baseada em `ligacao_em` mais recente por `operador_nome`.

### Fase 3 — Fila inteligente ✅ entregue
- Tabela `telemarketing_call_log` (histórico imutável, append-only).
- Tabela `telemarketing_call_assignments` (trava de 5 min por operador/contato).
- Novos campos em `contratados`/`contratado_indicados`: `proxima_tentativa_em`, `tentativas_count`, `observacao_tele`.
- RPCs: `tele_claim_contato`, `tele_release_contato`, `tele_get_contato_log`. `tele_registrar_ligacao` agora aceita observação + reagendamento e grava no log. `tele_list_contatos` retorna lock atual + tentativas + reagendamento.
- UI do operador (`Telemarketing.tsx`): aviso visual quando contato está em atendimento por outro operador, botão "Reagendar" + data/hora, campo de observação livre, exibição do histórico de tentativas e observação anterior.
- Pendente: incluir `eleicao_indicados` na fila (toggle por campanha) → fica na Fase 4.

### Fase 4 — Campanhas / mailing avulso ✅ entregue
- Tabelas `telemarketing_campanhas` (CRUD com ativo/inativo) e `telemarketing_contatos_avulsos` (mailing importado, com vínculo opcional a campanha).
- RPC `tele_import_contato_avulso_batch` (admin) faz import em lote a partir de JSON parseado de CSV.
- `tele_list_contatos` agora inclui contatos avulsos ativos como `tipo='avulso'` / `tabela='contatos_avulsos'`.
- `tele_registrar_ligacao` aceita também `contatos_avulsos`.
- Nova página admin `/telemarketing-admin/campanhas`: criar/desativar/remover campanhas, importar CSV (vírgula/;/tab, com ou sem cabeçalho), listar contatos importados com status.
- Operador (`Telemarketing.tsx`): novo filtro "Mailing" e badge "Mailing" para contatos avulsos.

### Fase 5 — Script + qualificação rica ✅ entregue
- Campos `script_intro`, `script_perguntas` (jsonb) e `tags_rapidas` (jsonb) em `telemarketing_campanhas`.
- Diálogo de edição de roteiro no admin de Campanhas (intro, perguntas linha-a-linha, tags rápidas).
- RPC `tele_list_campanhas_scripts` (operator-authenticated) carregada no login do operador.
- Operador (`Telemarketing.tsx`) mostra painel "Script da campanha" quando o contato pertence a uma campanha com roteiro, com chips de tags rápidas que adicionam à observação.

### Fase 6 — Relatórios avançados ✅ entregue
- Export **PDF** no painel de relatórios (resumo + bairros + alternativos + lista) via jspdf + autotable.
- Gráfico **Top bairros** (vota sim/não/indeciso/pendente) no painel de relatórios.
- Tabela `telemarketing_relatorio_snapshots` (rodadas) + RPC `tele_capture_snapshot` agregando contratados + indicados + avulsos.
- Novo componente `TelemarketingSnapshotsPanel` no `/telemarketing-admin/relatorios`: capturar snapshot, listar histórico, comparar rodadas (Δ vota sim) e **alerta automático** quando a taxa "vota sim" cai ≥ 5 pontos percentuais entre a última e a anterior.

### Fase 7 — Segurança / anti-abuso ✅ entregue
- Novos campos em `telemarketing_operadores`: `failed_attempts`, `locked_until`, `last_login_at`, `password_updated_at`.
- `verify_telemarketing_operador` agora bloqueia por 15 min após 5 tentativas erradas, reseta no sucesso e registra login.
- Helper interno `_tele_assert_operador` aplicado a todos os RPCs do operador (claim/release/list/registrar), garantindo que contas bloqueadas não consigam usar a fila.
- Tabela `telemarketing_operador_audit` (login ok / falha / bloqueio / troca de senha / desbloqueio).
- RPCs admin: `tele_change_operador_password` (com auditoria) e `tele_unlock_operador`.
- Painel admin em `/telemarketing-admin/operadores`: mostra tentativas erradas, último login, data da senha, botão de desbloquear, troca de senha e log de auditoria recente.
- Mensagem no login do operador diferencia "credenciais inválidas" de "conta bloqueada".

---

## Recomendação de execução agora

Confirmar **Fase 1 + Fase 2** como primeira entrega:

1. Criar `src/pages/TelemarketingAdmin.tsx` + `src/components/telemarketing/TelemarketingSubNav.tsx`.
2. Criar subpáginas que reaproveitam os componentes já existentes (`TelemarketingResultsPanel`, `TelemarketingReportsPanel`, `TelemarketingSettingsCard`).
3. Adicionar nova aba **Visão geral** com KPIs do dia + top operadores + heatmap por hora.
4. Adicionar item "Telemarketing" no `DashboardLayout` (grupo "Mobilização", ícone `Headphones`).
5. Adicionar rotas em `App.tsx` (`/telemarketing-admin/*`) com `AuthGate`.
6. Corrigir link `/telemarketing` em `SuggestedActions` → `/telemarketing-admin/fila`.
7. Remover duplicações: tirar `TelemarketingSettingsCard` de `Settings.tsx` e o painel de tele de `ContratadosRelatorios` (deixar apenas atalhos com link para o novo módulo).

Fases 3–7 entram em entregas seguintes conforme prioridade.

## Perguntas antes de implementar
1. Posso **remover** o card de telemarketing de `Settings` e a aba telemarketing de `ContratadosRelatorios`, ou prefere **manter as duas localizações** + a nova (atalhos)?
2. Quer já incluir `eleicao_indicados` na fila do operador nesta primeira fase, ou deixar para a Fase 3?
3. Avanço com Fase 1 + Fase 2 agora?
