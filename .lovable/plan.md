## Contexto

Hoje em `Eleicao.tsx > handleExport()` (linhas 541-582) a exportação respeita só os filtros já ativos na tela (busca, tipo, região). O usuário quer:

1. **Filtros explícitos no momento da exportação** — escolher só Coordenadores, só Líderes ou só Cabos, sem precisar mexer no filtro principal da página.
2. **Exportação "Raiz" (hierárquica)** — agrupar por Coordenador, mostrando dentro de cada um seus Líderes e, abaixo de cada Líder, seus Cabos. Útil para auditar a estrutura completa de uma equipe.

## Plano

### 1. Dialog único de exportação (`ExportEleicaoDialog`)
Substituir o atual `DropdownMenu` "Exportar" por um botão que abre um dialog com as opções:

- **Tipo de exportação** (radio):
  - "Lista simples" — comportamento atual (tabela única).
  - "Raiz / Hierárquica (agrupada por Coordenador)" — novo formato em árvore.
- **Filtrar por tipo** (checkboxes, multi-seleção, padrão = todos):
  - Coordenadores, Líderes, Cabos.
- **Filtrar por coordenador específico** (select opcional, só aparece se "Líderes" ou "Cabos" estiverem marcados): "Todos" ou nome de um coordenador da região atual. Quando escolhido, traz **apenas a equipe daquele coordenador** (ele + líderes dele + cabos dos líderes dele).
- **Incluir avulsos?** (switch, default ligado) — só faz sentido se "Líderes" marcado; quando ligado adiciona uma seção/grupo "AVULSOS" no fim.
- **Formato**: PDF / Imprimir / CSV (botões finais).

Esses filtros são aplicados **em cima** dos filtros já ativos da tela (escopo, busca, região), nunca os ignoram.

### 2. Lista simples (existente, com filtros novos)
- Aplicar o filtro de tipos (1-3 opções) e o filtro de coordenador antes de montar `ExportPessoa[]`.
- O PDF/CSV continuam usando o agrupamento por tipo que já existe em `eleicao-export-pdf.ts`.

### 3. Modo "Raiz" (novo) — `exportEleicaoPdfRaiz()` e `exportEleicaoCsvRaiz()`
Novos helpers em `src/lib/eleicao-export-pdf.ts`:

- **Entrada**: lista de pessoas + flag `incluirAvulsos`.
- **Estrutura montada em memória**:

```text
Coordenador A — Região X · Tel · R$ valor
  ├─ Líder A1 — Bairro · Tel · R$ valor
  │   ├─ Cabo A1a — Tel · R$ valor
  │   └─ Cabo A1b — Tel · R$ valor
  └─ Líder A2 ...
Coordenador B ...
[AVULSOS]
  ├─ Líder X (sem coord) — Tel · R$ valor
  │   └─ Cabo X1 ...
```

- **PDF**: para cada coordenador, um bloco com header destacado + sub-tabela de líderes (com cabos aninhados em coluna "Cabos" ou listados logo abaixo recuados). Mostrar totais por coordenador (qtd líderes, qtd cabos, R$ total da equipe) e total geral no rodapé.
- **CSV**: linhas planas com coluna extra `nivel` (coordenador/lider/cabo) + colunas `coordenador_raiz` e `lider_raiz` preenchidas em cada linha para permitir pivotar no Excel. Ordenação: coord → líder → cabo, mantendo a hierarquia ao ler de cima pra baixo.
- Para um filtro "só Coordenadores": modo raiz vira lista de coordenadores com totais agregados da equipe (sem listar nominalmente líderes/cabos).
- Para um filtro com coordenador específico: gera o PDF/CSV apenas daquela equipe — nome do arquivo `equipe-{slug-do-coord}.pdf`.

### 4. Ajustes em `handleExport`
Reescrever para receber um `ExportConfig`:

```ts
type ExportConfig = {
  formato: "pdf" | "csv" | "print";
  modo: "lista" | "raiz";
  tipos: Set<"coordenador" | "lider" | "cabo">;
  coordenadorId?: string | null; // null = todos
  incluirAvulsos: boolean;
};
```

Aplica os filtros, monta `items`, chama o helper certo (`exportEleicaoPdf` / `exportEleicaoPdfRaiz` ou variante CSV).

### 5. Toast e nome de arquivo
Mensagem mostra modo e contagem: `"PDF raiz exportado · 3 coordenadores · 27 pessoas"`. Slug do arquivo inclui `-raiz` ou `-{tipo}` para diferenciar.

## Arquivos afetados

- `src/pages/Eleicao.tsx` — novo dialog, novo `handleExport`.
- `src/components/eleicao/ExportEleicaoDialog.tsx` — **novo** componente.
- `src/lib/eleicao-export-pdf.ts` — adicionar `exportEleicaoPdfRaiz` e `exportEleicaoCsvRaiz`; ajustar tipos de opções.

Sem mudanças de banco de dados.
