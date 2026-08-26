# Publicações e Ranking: painel profissional de desempenho da equipe

## O que está acontecendo hoje (confirmado no banco)

- Existem **5 publicações/missões** cadastradas, mas apenas **1 está marcada como "monitorada"** e com regra vinculada.
- A aba "Publicações e ranking" só conta o que virou **obrigação** dessa única publicação monitorada. Por isso aparece "Publicações monitoradas: 1" e "Cumprimento 0,2%".
- As missões que você cumpriu de verdade estão registradas em outro lugar: **48 confirmações ("cumpri a missão") e 199 aberturas de link** distribuídas em 4 missões, mais 69 check-ins. Nada disso é lido por esta aba.

Resumo: não é erro de contagem, são **duas bases separadas**. A aba de ranking ignora o cumprimento vindo dos links/check-in e ignora publicações que ninguém marcou como monitoradas.

## Objetivo

Uma única página que responda, para qualquer período:

1. Quantas publicações a equipe recebeu.
2. Quantas pessoas eram obrigadas em cada publicação.
3. Quantas cumpriram, quantas só abriram, quantas ignoraram.
4. Quem está puxando o time e quem está travando — pessoa por pessoa, publicação por publicação.

## Fonte única de verdade do cumprimento

Uma pessoa conta como **cumpriu** uma publicação se qualquer uma destas provas existir:

- **E1 — Comprovado**: comentário/curtida capturado pela API do Facebook/Instagram, ou clique no link rastreado da rede.
- **E2 — Declarado**: apertou "cumpri a missão" no portal, ou check-in na missão.
- **E3 — Anexado**: evidência enviada e validada.
- Estados intermediários explícitos: **"abriu e não confirmou"** e **"não abriu"**.

Toda publicação ativa entra automaticamente na medição (sem depender de alguém ligar a chave "monitorada"). O público obrigado vem da lista de obrigados (audiência) ou da regra padrão; quem não é obrigado aparece separado como "engajamento extra".

## A página reformulada

**Topo — KPIs do período** (7/30/90 dias, comparação com período anterior):
- Publicações no período
- Pessoas obrigadas
- Cumprimentos (e cumprimentos por publicação)
- Adesão média %
- Abriram e não confirmaram (oportunidade de cobrança)
- Nunca engajaram no período

**Gráficos:**
- Evolução da adesão por publicação (linha, ordem cronológica)
- Cumprimento por tipo de prova (E1/E2/E3) — mostra o quanto você depende de declaração
- Adesão por cargo e por região (barras)
- Funil: obrigados → abriram → cumpriram

**Aba "Publicações"** — uma linha por publicação: título, plataforma, data, obrigados, cumpriram, abriram sem confirmar, faltaram, adesão %, e ação "cobrar quem faltou" (abre lista com WhatsApp).

**Aba "Ranking da equipe"** — uma linha por pessoa: cargo, região, publicações no período, cumpridas, faltas, % de cumprimento, prova predominante, índice, faixa, evolução vs. período anterior, última atividade. Filtros: cargo, região, faixa, lista de obrigados, "só quem tem contrato", "só voluntários", busca por nome/telefone.

**Aba "Matriz"** — grade pessoa × publicação com marcação de cumprido / abriu / faltou. É a visão que mostra num relance quem cumpre sempre e quem nunca cumpre.

**Drill-down da pessoa** — histórico publicação por publicação com a prova de cada uma, e cobrança por WhatsApp.

**Exports** — Excel e PDF de cada aba, com o período e os filtros aplicados no cabeçalho.

## Detalhes técnicos

Novas funções de banco (SQL, `SECURITY DEFINER`, escopo por `client_id`):

- `engagement_publicacoes_overview(p_client_id, p_dias, p_audience_id)` — por publicação: obrigados, cumpridas, abriu_sem_confirmar, faltas, adesão. Une `portal_missions` + `mission_events` + `mission_checkins` + `engagement_obrigacoes` + `comments`.
- `engagement_equipe_desempenho(p_client_id, p_dias, p_audience_id, p_cargo, p_regiao)` — por pessoa, com contagens do período, quebra por nível de prova, índice, faixa, variação vs. período anterior.
- `engagement_matriz(p_client_id, p_dias, p_audience_id, p_limit)` — pares pessoa × publicação com status resolvido.
- `engagement_kpis_periodo(p_client_id, p_dias, p_audience_id)` — números do topo, período atual e anterior.

Ajustes:
- Publicação nova passa a entrar na medição por padrão (audiência/regra padrão do cliente), sem perder o modo manual.
- `engagement_casar_interacoes` passa a também aceitar confirmação do portal e check-in como prova (E2), gravando o nível de evidência.
- Backfill: gerar obrigações retroativas para as publicações já existentes e reconciliar os 48 cumprimentos e 199 aberturas já registrados, para o histórico não nascer vazio.

Frontend:
- `MonitoramentoTab.tsx` reescrito como casca de abas (KPIs + gráficos no topo).
- Novos componentes: `PublicacoesDesempenhoPanel.tsx`, `EquipeRankingPanel.tsx`, `MatrizCumprimentoPanel.tsx`, `MonitorKpisHeader.tsx`, `MonitorCharts.tsx` (Recharts).
- Acesso via `src/lib/engagement-monitor.ts` com tipos das novas RPCs; exports Excel/PDF reaproveitando o padrão atual.
