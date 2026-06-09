## Objetivo

Saber, em uma tela só, **quais coordenadores e líderes trazem mais resultado** — para que você direcione esforço, premiação e conversa com quem performa, e ajuste quem está abaixo da meta.

## Estrutura que vamos usar

Já existe na base:

- `eleicao_pessoas` com `tipo ∈ {coordenador, lider}` e `parent_id` (líder → coordenador).
- `eleicao_indicados.indicador_id` aponta para a pessoa que indicou (`indicador_tipo` diz se foi líder ou coordenador).
- Cada indicado tem `vota_candidato` (`sim`/`nao`/`indeciso`) e `ultimo_status_ligacao` vindos do telemarketing.
- Mesma lógica em `contratados` (`lider_id`/`is_lider`) + `contratado_indicados`.

## Tela nova: "Ranking de coordenadores e líderes"

Submenu novo dentro de Telemarketing Admin: **Ranking**. Estrutura:

### 1) Visão "Coordenadores"
Tabela rankeada por confirmados, com:

| Coordenador | Cidade | Líderes | Indicados totais | Ligados | Confirmados | Indecisos | Rejeitados | % conversão | Meta | Δ vs meta |

- **Indicados totais** = próprios + de todos os líderes sob ele (rollup pelo `parent_id`).
- **% conversão** = confirmados ÷ ligados.
- **Meta** = soma das `quota_indicados` dos líderes filhos (configurável no futuro; usa default 10 hoje).
- Linha clicável → drawer com os líderes daquele coordenador (visão 2 filtrada).

### 2) Visão "Líderes"
Mesma tabela, mas por líder, com a coluna extra **Coordenador**. Filtro rápido "ver só os meus" quando aberto via drawer.

### 3) Filtros no topo
Campanha (fila) · Período (data início/fim das ligações) · Cidade/Bairro · Apenas com indicados · Toggle **Eleição** vs **Contratados** (mesma lógica nos dois universos).

### 4) Cards de destaque (acima da tabela)
- 🥇 Top 3 coordenadores por confirmados.
- 🥈 Top 3 líderes por taxa de conversão (mín. 5 indicados — evita inflar com pouca amostra).
- 🚨 Coordenadores sem nenhum indicado nos últimos 7 dias (alerta).

### 5) Export
Botão "Exportar CSV" e "PDF" reaproveitando os utilitários já existentes (`TelemarketingReportsPanel` faz isso hoje).

## Como mensuramos cada métrica

```text
Pessoa P (coordenador ou líder)
├── indicados_diretos      = indicados onde indicador_id = P.id
├── indicados_rollup       = indicados_diretos + indicados de cada líder cujo parent_id = P.id
├── ligados                = indicados_rollup com ultimo_status_ligacao IS NOT NULL
├── confirmados            = ligados com vota_candidato = 'sim'
├── indecisos              = ligados com vota_candidato = 'indeciso'
├── rejeitados             = ligados com vota_candidato = 'nao'
├── pendentes              = indicados_rollup - ligados
├── taxa_conversao         = confirmados / NULLIF(ligados, 0)
└── ultima_atividade       = max(ultima_ligacao_em) entre os indicados
```

Tudo agregado em uma única RPC para a tabela carregar rápido mesmo com 1000+ pessoas.

## Entregáveis técnicos

1. **Migration**: RPC `tele_ranking_indicadores(_client_id, _campanha_id, _data_de, _data_ate, _universo)` (`SECURITY DEFINER`, restrita a admin do cliente). Retorna uma linha por pessoa com todos os agregados acima + `coordenador_id`/`coordenador_nome`. Universo = `eleicao` ou `contratados`. Índice em `eleicao_indicados(indicador_id, ultima_ligacao_em)`.
2. **`src/pages/TelemarketingAdminRanking.tsx`** + entrada no `TelemarketingSubNav`.
3. **`src/components/telemarketing/RankingTable.tsx`** (tabela ordenável, com drawer para drill-down).
4. **`src/components/telemarketing/RankingHighlights.tsx`** (cards Top 3 / alertas).
5. **Export CSV/PDF** reaproveitando `eleicao-export-pdf.ts`.
6. **Validação**: criar 2 coordenadores, 4 líderes, 20 indicados → conferir totais batem com a soma manual.

## O que NÃO muda

- Estrutura das tabelas, fluxo do operador, painéis Resultados/Relatórios/Filas existentes.
- Distribuição automática de ligações (já feita na rodada anterior).
