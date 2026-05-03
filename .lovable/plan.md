## Objetivo

Adicionar retry automático com backoff exponencial e um botão claro de "Recarregar" quando o carregamento da aba Contratados falhar ou der timeout, mantendo a UI sempre responsiva.

## Mudanças

### 1. `src/components/contratados/useContratadosData.ts`

- Adicionar constantes `MAX_RETRIES = 3` e helper `sleep`.
- Novo estado `retryAttempt` (número da tentativa atual, 0 = primeira).
- `useRef` `retryTimerRef` para o `setTimeout` agendado, com `clearRetryTimer` chamado no início de cada `load`, em `reload` e no `cleanup` do `useEffect`.
- Refatorar `load(attempt = 0)`:
  - Rastrear `hadFailure` (qualquer query rejeitada/erro) e `fatalError` (erro fatal do try/catch).
  - Manter o comportamento atual de `Promise.allSettled` — falhas parciais agora também marcam `hadFailure`.
  - Após o `finally`, se `hadFailure && attempt < MAX_RETRIES && seq === loadSeq.current`:
    - Calcular `delay = min(4000, 1000 * 2^attempt)` (1s, 2s, 4s).
    - Atualizar `loadError` com mensagem informativa: `"<motivo> — tentando novamente (n/3) em Xs..."`.
    - Agendar `retryTimerRef.current = setTimeout(() => load(attempt+1), delay)`.
  - Não fazer retry quando o erro for "sessão ausente" ou "cliente não vinculado" (esses retornam antes de marcar `hadFailure`).
- `reload` exposto: limpa timer e chama `load(0)` (reinicia contagem de tentativas).
- Retornar `retryAttempt` no objeto do hook.

### 2. `src/pages/Contratados.tsx`

- Consumir `retryAttempt` do hook.
- Banner de erro existente: ao lado da mensagem, mostrar:
  - Spinner pequeno + texto "Tentando novamente..." quando `retryAttempt > 0 && loading`.
  - Botão "Recarregar agora" (chama `reload`) sempre visível enquanto houver erro, mesmo durante o retry agendado (dispara imediatamente, cancelando o timer pendente via `reload`).
- No empty state "Nenhum cliente vinculado", botão já chama `reload` — apenas adicionar indicação de tentativa atual quando `retryAttempt > 0`.

### 3. Sem mudanças em `TeamTree.tsx` ou outros arquivos.

## Detalhes técnicos

- Backoff exponencial: 1s, 2s, 4s (total ~7s de espera distribuída).
- `loadSeq` continua garantindo que retries antigos não sobrescrevam um `reload` manual mais recente.
- Cleanup do `useEffect` cancela qualquer timer pendente ao desmontar.
- Erros não-recuperáveis (sem sessão, sem cliente) não disparam retry — eles retornam cedo sem setar `hadFailure`.

## Critério de aceitação

1. Quando uma query falha/timeout, a aba tenta novamente sozinha até 3 vezes com backoff (1s/2s/4s).
2. Mensagem de erro mostra contagem de tentativas e tempo até o próximo retry.
3. Botão "Recarregar agora" cancela o retry agendado e reinicia o ciclo do zero.
4. Ao sair da página, nenhum timer fica pendurado.
5. Falhas "sem cliente" / "sem sessão" não entram no loop de retry (mostram empty state com botão manual).
