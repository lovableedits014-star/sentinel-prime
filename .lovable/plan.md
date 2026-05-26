## Garantia

**Nada em Eleição é alterado.** Nenhum arquivo de Eleição é tocado, nenhuma migração de banco é feita, e **nenhuma escrita** acontece em `eleicao_pessoas` (nem renomear cidade/bairro, nem preencher cidade padrão). A Territorial passa a **apenas ler** as colunas que já existem em `eleicao_pessoas` (`bairro`, `regiao`, `rua`, `numero`, `tipo`).

## Diagnóstico

A Territorial já consulta `eleicao_pessoas` (linhas 444–466 de `src/pages/Territorial.tsx`), mas os cadastros de Eleição quase não aparecem. Causas confirmadas no banco (30 registros atuais):

- **1 tem `cidade`**, **30 têm `bairro`**, **29 têm `regiao`**.
- A Territorial usa só `cidade` + parser do `endereco` para deduzir bairro, ignorando as colunas dedicadas `bairro` e `regiao`.
- Os diálogos de detalhe e mesclagem da Territorial não conhecem `eleicao_pessoas`.

## Plano (somente leitura sobre Eleição)

### 1. Ler os campos certos de `eleicao_pessoas`
Em `src/pages/Territorial.tsx`, no `useQuery` `territorial-eleicao`, incluir no `select`: `bairro, rua, numero, regiao, tipo` (somam-se aos já lidos: `id, nome, telefone, cidade, endereco, email, created_at`). Apenas SELECT.

### 2. Mapear corretamente para o `GeoEntry`
No `forEach` de `eleicaoRows` (linha 508):
- `neighborhood` = `e.bairro` (cai para `extractBairroFromEndereco(e.endereco)` só se `bairro` vier vazio);
- `city` continua sendo `e.cidade` (sem fallback automático — quem está vazio cai no card "Sem localização", como já funciona hoje);
- novo campo `region` no `GeoEntry`, vindo de `e.regiao`;
- novo campo `source: 'eleicao'` para o filtro do passo 5.

### 3. Nova dimensão "Região" na Territorial
Adicionar uma seção/aba **Região** ao lado de UF → Cidade → Bairro:
- KPI "Pessoas por região" + total;
- lista colapsável reaproveitando o visual do `CityGroupedList`, com bairros aninhados dentro de cada região;
- drill-down por região (similar ao `selectedCity`);
- cruzar com `eleicao_regioes` (read-only) para exibir o `label` bonito em vez do slug e respeitar a `ordem` configurada.

Hoje só Eleição preenche `regiao`, então a seção fica naturalmente útil para esses cadastros sem precisar mudar nada na origem.

### 4. Drill-down: incluir Eleição no diálogo de detalhes
Em `src/components/territorial/LocalityDetailDialog.tsx`:
- adicionar `eleicao_pessoas` ao array `TABLES` e ao tipo `Origin` (label "Eleição", badge própria);
- buscar `id, nome, telefone, cidade, bairro, regiao, tipo` (SELECT) e aplicar o mesmo match canônico de cidade/bairro das demais origens;
- mostrar badge da `regiao` quando presente.

### 5. Filtro por origem no topo da Territorial
Chips de filtro: **Todos / CRM / Apoiadores / Contratados / Indicados / Eleição**, usando o `source` adicionado no passo 2. Não refaz queries, só filtra em memória.

### 6. Aviso visual (apenas leitura, sem botão de ação)
Card informativo: "X cadastros de Eleição estão sem cidade definida — eles aparecem na seção Região e no card 'Sem localização'." Sem nenhum botão que escreva no banco.

### 7. Verificação do botão "Recarregar"
O `handleReload` (linha 344) já invalida `territorial-eleicao`. Apenas conferir após as mudanças. Sem alteração.

## Arquivos afetados (frontend apenas)

- `src/pages/Territorial.tsx` — passos 1, 2, 3, 5, 6
- `src/components/territorial/LocalityDetailDialog.tsx` — passo 4

## Explicitamente fora de escopo

- **Nada** em `src/pages/Eleicao.tsx`, `src/components/eleicao/*`, `src/hooks/useRegioesEleicao.ts`, edge functions de Eleição.
- **Nenhuma** migração de banco.
- **Nenhum** `UPDATE`/`DELETE`/`INSERT` em `eleicao_pessoas` ou `eleicao_regioes`.
- **Não** incluir `eleicao_pessoas` no `MergeLocalitiesDialog` (a mesclagem da Territorial continua atuando só nas tabelas atuais — Eleição fica imune mesmo se você clicar em mesclar).
