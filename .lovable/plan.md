## Diagnóstico

A tela "Something went wrong" é o `DefaultErrorComponent` do TanStack Router (`src/router.tsx`). Ela é acionada quando qualquer componente da árvore React (`src/App.tsx`, com react-router-dom) lança um erro não tratado durante o render.

Dois problemas se somam e produzem o comportamento que o usuário descreve:

1. **O boundary nunca se reseta sozinho.** Quando o usuário clica em um item do menu, o react-router-dom muda a URL, mas o boundary do TanStack continua "preso" — só sai com o botão "Try again". Por isso a sensação de que aparece "em toda navegação".
2. **Algum componente está realmente quebrando** para o usuário novo. Como ele foi criado via *Equipe* (sem ser dono de `clients`, sem ser super admin), várias páginas assumem a existência de um `clientId` resolvido e quebram quando `resolveClientId()` retorna `null` ou quando uma query Supabase falha por RLS. Hoje esse erro fica engolido pelo boundary — não há log nem telemetria.

## O que vamos fazer

### 1. Boundary que se auto-reseta na navegação (corrige o sintoma)
Substituir o `DefaultErrorComponent` por um componente que:
- Escuta mudanças de URL via `window.history` / `popstate` / `pushState` patch e chama `reset()` automaticamente quando o pathname muda.
- Loga o erro completo no console (`console.error(error)` com stack) e em `window.__lastRenderError` para inspeção.
- Mostra a mesma UI atual, mas com um botão extra "Recarregar página" e, em DEV, a mensagem do erro.

Resultado: mesmo se algo lançar, ao clicar em qualquer item do menu o boundary limpa sozinho — o usuário não fica preso.

### 2. ErrorBoundary interno do react-router-dom (defesa em profundidade)
Adicionar um `<ErrorBoundary>` (classe React) dentro de `App.tsx`, envolvendo `<Routes>`. Esse boundary:
- Captura o erro no nível da SPA antes de subir ao TanStack.
- Reseta automaticamente em `location.pathname` change (via `useLocation` + `key`).
- Mostra fallback amigável com botão "Voltar ao dashboard".
- Loga `error` + `errorInfo.componentStack` no console.

Com isso, erros de página não derrubam o app todo nem mostram a tela genérica.

### 3. Hardening do `DashboardLayout` para usuário novo
Já existe um modo "otimista" no catch, mas o fluxo principal pode lançar em três pontos:
- `is_super_admin` RPC indisponível;
- `clients`/`team_members` retornando erro de RLS;
- `team_members` existindo mas com `role` inválido para `getRoleLabels`.

Vamos:
- Tratar `superAdminRes.error`, `clientRes.error`, `teamRes.error` como "sem permissão" (não como exception).
- Garantir default de `accessProfile` quando `role` é desconhecido (não quebrar UI da sidebar).
- Adicionar log estruturado quando cair no caminho "sem permissão" para o usuário pedir suporte.

### 4. Telemetria mínima do erro
Em `src/lib/client-telemetry.ts` adicionar evento `render_error` capturando: pathname, mensagem, primeiras 5 linhas do stack, e `user_id` (se disponível). Isso já fica em `window.__clientTelemetry` para o usuário copiar e mandar.

## Arquivos afetados
- `src/router.tsx` — novo `DefaultErrorComponent` com auto-reset por navegação + log.
- `src/App.tsx` — adicionar `RouteErrorBoundary` (classe) ao redor de `<Routes>`, com `key={location.pathname}` para reset automático.
- `src/components/RouteErrorBoundary.tsx` — novo componente (class component) com `componentDidCatch` que loga e oferece fallback.
- `src/components/DashboardLayout.tsx` — endurecer o `checkUser()` para não lançar em erros de RPC/select.
- `src/lib/client-telemetry.ts` — novo tipo de evento `render_error`.

## Resultado esperado
- Usuário novo navega normalmente; se uma página específica ainda tiver bug, só aquela página mostra fallback amigável (com botão "Voltar"), sem travar o resto da sessão.
- No console (F12) o erro real aparece com stack — na próxima vez que reproduzir, conseguimos identificar a página culpada com precisão.
- A tela genérica do TanStack vira último recurso e some sozinha ao navegar.

Quer que eu implemente já? Se sim, aprovo e executo na sequência.