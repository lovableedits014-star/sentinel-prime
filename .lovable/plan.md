## Objetivo

Adicionar diagnóstico passo-a-passo (sessão → cliente → contratados → indicados → check-ins) com logs no console e um banner expansível na aba Contratados, para identificar exatamente qual etapa trava ou falha.

## Mudanças

### 1. `src/components/contratados/useContratadosData.ts`

- Exportar tipos `DiagStatus = "pending" | "ok" | "error" | "skipped"` e `DiagStep { key, label, status, durationMs?, detail? }`.
- Novo estado `diagnostics: DiagStep[]` exposto pelo hook.
- Helpers internos `startStep(key, label)` e `finishStep(step, status, detail)` que:
  - Atualizam o array `steps` e chamam `setDiagnostics([...steps])` (somente se `seq` ainda é o atual).
  - Marcam `durationMs` relativo a `t0 = performance.now()`.
- Instrumentar cada etapa do `load()`:
  1. **Sessão** — registrar fonte (`localStorage(token+user)` / `localStorage(user)` / `supabase.auth.getSession`) e `userId` truncado.
  2. **Cliente** — registrar se veio via `supabase-js` ou via `REST fallback`; detalhar quando não há vínculo.
  3. **Contratados / Indicados / Check-ins** — uma `DiagStep` para cada query, status `ok` com contagem de linhas ou `error` com `result.reason.message` / `result.value.error.message`.
- Adicionar `console.info` / `console.warn` / `console.error` prefixados com `[Contratados]` em cada transição (início, sucesso, falha, fim com tempo total).
- Erros agora incluem o `detail` na `loadError` (ex.: `"Não foi possível carregar contratados: timeout..."`).
- Em caso de erro fatal no `catch`, adicionar uma `DiagStep "fatal"`.

### 2. `src/pages/Contratados.tsx`

- Consumir `diagnostics` do hook.
- Componente local `DiagnosticsPanel` (collapsible com `<details>`) renderizado dentro do banner de erro existente:
  - Cabeçalho: "Ver diagnóstico detalhado".
  - Lista vertical de steps: ícone por status (`CheckCircle2` verde, `AlertCircle` vermelho, `Loader2` girando, `Circle` cinza), label, tempo decorrido, e `detail` em texto pequeno mono.
  - Botão "Copiar diagnóstico" que serializa `diagnostics` + `loadError` + `retryAttempt` + `userAgent` em JSON e chama `navigator.clipboard.writeText`, com `toast.success("Diagnóstico copiado")`.
- O painel também é mostrado no estado vazio "Nenhum cliente vinculado" e no banner do fluxo principal.

### 3. Sem mudanças em outros arquivos.

## Detalhes técnicos

- `diagnostics` é resetado a cada `load(attempt)` (novo array começa vazio).
- `flush()` só atualiza estado quando `seq === loadSeq.current` para evitar overwrite por chamadas antigas.
- O painel é colapsado por padrão para não poluir a UI; abre sob demanda.
- Logs no console usam ▶ / ✓ / ✗ / ◼ para facilitar leitura.

## Critério de aceitação

1. Console mostra cada etapa com status e tempo total.
2. Banner de erro tem um "Ver diagnóstico detalhado" que lista todas as etapas com ícone, duração e mensagem.
3. Botão "Copiar diagnóstico" copia um JSON pronto para colar.
4. Erro de uma query específica (ex.: indicados) aparece com a mensagem real do PostgREST/Supabase, não mais como genérico.
