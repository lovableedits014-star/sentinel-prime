# Check-in de Missões — listas de obrigados + filtros e medição

Objetivo: parar de depender do "público automático" atual (que hoje está errado: como quase todo mundo tem valor de contratação zerado, o sistema trata os 628 cadastros como se tivessem contrato) e passar a ter **listas de obrigados** reutilizáveis, aplicáveis a cada missão do dia, com filtros e medição de quem cumpre e quem não cumpre.

## 1. Listas de obrigados (nova aba "Listas de obrigados")

Aba separada dentro de Missões Check-in, para montar e manter as listas sem mexer no dashboard.

- Criar lista com nome e descrição (ex.: "Contratados + voluntários", "Só coordenadores").
- **Seleção por grupo, automática**: chaves para incluir grupos inteiros — Coordenadores, Líderes, Cabos, Voluntários, Contratados (contrato vigente), Funcionários. Ao ligar um grupo, a lista passa a puxar sozinha todo mundo daquele grupo, inclusive quem for cadastrado depois.
- **Contrato vigente** = valor de contratação maior que zero; quando a pessoa tiver datas de vigência preenchidas, também exige que hoje esteja dentro do período. Quem tem valor zerado não entra como contratado (só entra se estiver em outro grupo escolhido).
- **Filtros da regra automática**: região/cidade, indicador e escopo (Campo Grande / interior).
- **Ajustes manuais por cima da regra**: adicionar pessoa específica (busca por nome/telefone) e dispensar pessoa específica (fica fora das métricas com motivo opcional).
- Prévia ao vivo: "esta lista tem X pessoas — Y contratados, Z voluntários, W sem telefone" antes de salvar.
- Cada missão passa a ter uma lista aplicada. Como serão missões quase diárias, a última lista usada vira a padrão da próxima missão, e é possível trocar num clique no seletor do dashboard.

## 2. Dashboard: filtros e medição

- Seletor de lista no topo do dashboard: todos os números (cumpriram, abriram sem confirmar, nunca abriram, adesão) passam a ser calculados **somente sobre a lista**.
- Novos filtros: contrato vigente (sim/não), voluntário (sim/não), grupo/cargo (multiseleção), região, indicador, com/sem telefone válido, e faixa de reincidência ("faltou nas últimas 3 missões").
- Medição por pessoa acumulada: colunas "missões cobradas", "cumpridas", "% de cumprimento" e trilha das últimas missões — para separar quem sempre cumpre de quem nunca cumpre.
- Ranking por região, por indicador e por cargo, com % de adesão.
- Aba **"Não obrigados"**: quem entrou no link mas não está na lista (inclui cadastros novos vindos do link), com botão de 1 clique para adicionar à lista.
- Exportações Excel/PDF respeitando lista + filtros, incluindo as colunas de cumprimento acumulado.

## 3. Consistência

- Pessoa dispensada nunca entra na adesão, mas o registro dela é preservado.
- Mudança de cargo (cabo → líder) reclassifica automaticamente nas listas por grupo, sem perder o histórico.
- Quem sai da vigência do contrato deixa de ser puxado como contratado nas missões seguintes, mantendo o histórico das anteriores.

## Detalhes técnicos

- Banco: `mission_audiences` (lista: nome, descrição, regra em JSONB com grupos/filtros ligados, client_id) e `mission_audience_members` (ajustes manuais: `origem`, `ref_id`, `modo` = incluido/dispensado, motivo). `portal_missions` recebe `audience_id`. GRANTs para `authenticated`/`service_role` + RLS por `is_client_member(client_id)`.
- RPCs `SECURITY DEFINER`: `mission_audience_preview(regra)` para a prévia, `mission_audience_resolve(p_audience_id)` materializando a regra em pessoas, e reescrita de `mission_checkin_dashboard` para receber `p_audience_id` e devolver `obrigado`, `tem_contrato_vigente` (valor > 0 + vigência), `missoes_cobradas`, `missoes_cumpridas`, `pct_cumprimento`. Nova `mission_checkin_nao_obrigados(p_client_id, p_mission_id, p_audience_id)`.
- Front: nova `MissionAudiencesTab.tsx` + `MissionAudienceDialog.tsx` em `src/components/engagement/`, nova aba em `MissionCheckinTab.tsx`, refatoração de `MissionCheckinDashboard.tsx` (seletor de lista, filtros novos, aba "Não obrigados", colunas de cumprimento) reaproveitando `MissionCheckinCharts.tsx`, `MissionCheckinAlerts.tsx` e as exportações já existentes.

## Ordem de execução

1. Banco (listas, membros, vínculo com missão, definição de contrato vigente).
2. Aba de listas com seleção por grupo e prévia.
3. Dashboard ligado à lista + filtros e colunas de cumprimento.
4. Aba "Não obrigados" e exportações atualizadas.
