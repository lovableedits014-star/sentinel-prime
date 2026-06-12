## Diagnóstico — o que tem hoje na aba "Visão Brasil (macro)"

A aba acumulou 6 seções verticais que se sobrepõem. Mapeamento:

| # | Seção | Problema |
|---|---|---|
| 1 | Filtro de origem (chips) | OK — manter |
| 2 | Aviso "X cadastros sem cidade" | Alerta isolado, perdido no meio |
| 3 | **Crescimento da Base** (KPIs total/hoje/7d/30d + chart diário + origem) | Não é visão geográfica — é Dashboard. Duplica métricas que já existem lá. |
| 4 | **Mapa de Influência** | 5 KPIs + BrazilMap + Por Região BR + Top 10 Estados + drill-down cidades + drill-down bairros + chart "Top Cidades Brasil" + busca + cold zones + CityGroupedList completo |
| 5 | **Por Região** (microzonas da campanha) | Conflita com a aba "Cobertura da Cidade" (que já mostra microzonas no mapa) e usa o mesmo título "Por Região" do item 4 — confusão |
| 6 | **Últimos Cadastros** (tabela) | Operacional, não macro. Já existe no Dashboard. |

Dentro do item 4 sozinho, **a mesma informação geográfica é exibida 4 vezes**: Top 10 Estados (lista), chart "Top Cidades/Bairros Brasil", cards "Cidades em UF", e `CityGroupedList` no rodapé.

## Princípio do refino

A aba "Visão Brasil" deveria responder **uma pergunta só**: *onde minha base está no país?* Com drill-down Brasil → Estado → Cidade → Bairro e nada mais.

Tudo que for crescimento/origem/últimos cadastros sai. Tudo que duplica drill-down sai. Cold zones e variantes viram um painel único de "oportunidades".

## Nova estrutura

```text
┌───────────────────────────────────────────────────────────────┐
│  [Filtro origem: Todos · CRM · Apoiadores · Indicados · Eleição]  │
│  [🔍 Busca cidade/bairro em todo o Brasil ____________]        │
├───────────────────────────────────────────────────────────────┤
│  KPIs nacionais (4 cards)                                     │
│  Estados ativos · Cidades · Pessoas localizadas · Sem cidade  │
├───────────────────────────────────────────────────────────────┤
│  ⚠ Oportunidades & Qualidade  (só aparece se houver algo)     │
│  • N zonas frias  • M sem cidade  • K variantes p/ mesclar    │
├───────────────────────────────┬───────────────────────────────┤
│  Mapa do Brasil (interativo)  │  Por Região (Norte/NE/CO/...) │
│  clique para drill-down       │  Top 10 Estados (clicável)    │
├───────────────────────────────┴───────────────────────────────┤
│  Breadcrumb: Brasil / SP / São Paulo   [✕ limpar]             │
├───────────────────────────────────────────────────────────────┤
│  ↓ aparece quando UF selecionado:                             │
│    Cidades em <UF> — cards com barra + checkbox mesclar       │
│  ↓ aparece quando Cidade selecionada:                         │
│    Bairros em <Cidade> — cards com barra + checkbox mesclar   │
└───────────────────────────────────────────────────────────────┘
```

## O que entra, sai e muda

### Removido (corta redundância)
- **Bloco inteiro "Crescimento da Base"** (KPIs + chart diário + chart origem). Pertence ao Dashboard, polui a visão geográfica.
- **Bloco "Por Região" (microzonas da campanha)** com seus 4 KPIs e collapsibles. Microzonas já são tratadas na aba "Cobertura da Cidade" no mapa real e em Eleição → Configurações.
- **Bloco "Últimos Cadastros"** (tabela). Operacional, não macro.
- **Chart "Top Cidades/Bairros — Brasil"** (BarChart vertical) — duplica o drill-down.
- **`CityGroupedList`** no rodapé — duplica o drill-down Cidades/Bairros que já está acima.
- **Card KPI "Crescimento 30d"** (5º card dos KPIs nacionais) — vira ruído nessa aba.

### Consolidado
- **Painel único "Oportunidades & Qualidade"** logo abaixo dos KPIs, com 3 linhas curtas (só renderiza as que tiverem valor):
  - `⚠ N regiões com poucos apoiadores (zonas frias)` — antigo cold zones
  - `📍 M cadastros sem cidade definida` — antigo aviso eleicaoSemCidade, expandido pra incluir todos os tipos
  - `🔀 K cidades/bairros com variantes para mesclar` — novo, conta `variantCount > 1` agregado, com botão "Revisar"
- **Busca** sobe pro topo (junto do filtro de origem) — hoje fica perdida no rodapé.

### Mantido
- Filtro de origem (chips).
- KPIs nacionais reduzidos a 4: Estados ativos / Cidades / Pessoas localizadas / Sem cidade.
- BrazilMap interativo + sidebar Por Região + Top 10 Estados.
- Breadcrumb de drill-down.
- Cards de Cidades (com checkbox mesclar) e cards de Bairros (com checkbox mesclar) aparecendo conforme drill-down.
- Dialogs `LocalityDetailDialog` e `MergeLocalitiesDialog`.

### Renomeado
- Aba "Visão Brasil (macro)" → **"Visão Brasil"** (o "(macro)" virou ruído; o nome da aba já entrega).
- Heading "Mapa de Influência" → removido (a aba já é o mapa; vira título de seção implícito).

## Detalhes técnicos

- Arquivo único: `src/pages/Territorial.tsx`. Edição cirúrgica dentro do `<TabsContent value="brasil">`.
- Deletar blocos: linhas ~1000-1066 (Crescimento), ~1390-1415 (chart Top Brasil), ~1418-1421 (busca atual), ~1424-1434 (cold zones isolado), ~1436-1477 (filtered + CityGroupedList), ~1480-1573 (Por Região microzonas), ~1575-1629 (Últimos cadastros).
- Adicionar novo componente inline `OportunidadesPanel` (3 chips condicionais) no lugar do aviso atual.
- Mover `<Input>` de busca pra dentro do mesmo Card do filtro de origem (mesma linha, lado direito).
- Reduzir o grid de KPI nacional de 5 → 4 colunas (remover o card de Crescimento 30d).
- Verificar e remover do imports tudo que ficou órfão: `BarChart`, `CartesianGrid`, `XAxis`, `YAxis`, `Cell`, `ChartContainer`, `ChartTooltip`, `ChartTooltipContent`, `CityGroupedList`, `Collapsible*`, `ChevronDown`, `Clock`, `tipoLabels`, `recentPessoas`, `regionGroups`, `selectedRegion`, `growthStats`, `dailyChartData`, `origemData`, `recruitMetrics`, `maxDailyChart` — qualquer um que não seja mais referenciado.
- `filtered`, `selectedLocationKeys`, `openSelectedLocationsMerge`, `coldZones` ainda são usados pelo painel de oportunidades — verificar caso a caso.
- Sem mudanças em queries / banco / edge function.

## Validação
1. Build limpa sem warnings de imports não usados.
2. Clicar num estado no BrazilMap mostra cards de Cidades.
3. Clicar numa cidade mostra cards de Bairros.
4. Breadcrumb "Limpar" reseta tudo.
5. Mesclar 2 cidades dispara o mesmo dialog atual e atualiza a lista.
6. Painel "Oportunidades" some quando não tem cold zones nem sem-cidade nem variantes.

