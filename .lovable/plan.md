## Objetivo

Garantir que a aba **Contratados** sempre mostre uma mensagem clara quando não houver dados (em vez de espaço em branco ou spinner) e adicionar paginação client-side aos indicados, evitando travar a UI quando a lista crescer. Aplicar tudo de forma defensiva (sem assumir que `clientId`/listas existem).

## Mudanças

### 1. `src/pages/Contratados.tsx`

- **Empty state global** (após `loading`): se `clientId` for `null` (usuário sem cliente vinculado) → card central com ícone, título "Nenhum cliente vinculado" e botão "Tentar novamente" (chama `reload`). Não tentar renderizar Tabs/KPIs nesse caso.
- **Empty state de equipe**: quando `contratados.length === 0`, renderizar apenas o card "Nenhum contratado ainda" (já existe em `TeamTree`) e ocultar filtros (Search/Líder/Status) para reduzir ruído.
- **Paginação na aba Indicados**:
  - Adicionar `useState` para `indPage` (default 1) e constante `PAGE_SIZE = 20`.
  - Adicionar busca local `indSearch` (filtra por nome/telefone/cidade).
  - Filtro por status (`pendente`/`confirmado`/`falso`/`all`).
  - Slice da lista filtrada por página; controles "Anterior / Próximo" + indicador `página X de Y`.
  - Reset de `indPage` quando filtros mudam (`useEffect`).
  - Empty state diferenciado: "Nenhum indicado encontrado" (quando há filtro) vs "Nenhum indicado ainda" (lista vazia).
- **KPI defensivo**: garantir que `Object.keys(liderMap).length` e divisões por `totalContratados` não quebrem (já tratado, manter).

### 2. `src/components/contratados/TeamTree.tsx`

- Manter o empty state existente; adicionar mensagem específica quando `visibleLiderIds.length === 0 && noLeaderList.length === 0 && contratados.length > 0` (filtro elimina tudo) — já existe, mas simplificar a condição para evitar falsos negativos.
- Defensivo: envolver `indicadosOf` e `checkinStats[c.id]` em fallback (`|| []` / `|| { total:0, last:null }`) — já parcialmente feito.

### 3. Sem mudanças em `useContratadosData.ts`

A camada de dados já lida com sessão/timeout/erros. Apenas confirmar que `contratados`, `indicados`, `checkinStats` sempre são arrays/objetos (já são, inicializados como `[]`/`{}`).

## Detalhes técnicos

- Paginação puramente client-side (sem nova query) — o volume esperado é baixo e evita complexidade de RLS/cursors.
- Reset de página via `useEffect([indSearch, indStatusFilter])`.
- Nenhum acesso direto a `window`/`localStorage` novo.
- Sem alterações de schema, RLS ou rotas.

## Critério de aceitação

1. Usuário sem `client` vinculado vê card "Nenhum cliente vinculado" + botão de retry, sem Tabs vazios.
2. Cliente sem contratados vê card "Nenhum contratado ainda" e filtros ocultos.
3. Aba Indicados com 0 itens mostra empty state; com >20 mostra paginação funcional; busca/status filtram e resetam página.
4. Nenhum crash quando `liderMap`, `indicados` ou `checkinStats` estão vazios.
