## Contexto da auditoria (já levantado)

- **Sem pagamentos:** não há Stripe/Mercado Pago. A seção "Blindagem de Pagamentos" do material **não se aplica** — ignorar para não introduzir risco desnecessário.
- **Roles OK:** `user_roles` + `app_role` enum + `has_role()` + `is_super_admin()` SECURITY DEFINER já seguem o padrão recomendado. **Não vamos refatorar.**
- **Gate Super Admin OK:** `SuperAdmin.tsx` já valida via `supabase.rpc("is_super_admin")` no servidor.
- **Sem segredos em VITE_:** apenas URL/PUBLISHABLE_KEY/PROJECT_ID.
- **RLS:** padrão `is_super_admin() OR user_can_access_client(client_id)` já adotado nas migrations recentes.
- **`dangerouslySetInnerHTML`:** só em `ui/chart.tsx` (shadcn, seguro).

O que precisa endurecer de verdade:
1. **77 Edge Functions** sem garantia uniforme de auth + validação Zod.
2. Rotas autenticadas dependem só do `DashboardLayout` (sem `ProtectedRoute` explícito).
3. Tabelas que o linter pode acusar de RLS frouxa/ausente.
4. Falta telemetria de eventos sensíveis (mudança de role, acesso negado).

## Princípio inegociável: zero quebra

- Toda onda é **aditiva** (adiciona guardas, não remove).
- Antes de cada commit: `bun run test` + `bun run test:coverage` precisam continuar verdes.
- Mudanças em RLS: **uma tabela por migration**, com rollback SQL no comentário.
- Edge Functions: novo Zod entra em **modo warn-only** por 48h antes de virar 400 bloqueante.
- Nada de renomear env var, deletar tabela ou mudar contrato de Edge Function existente.

---

## Onda 1 — Auditoria (zero risco, somente leitura)

Gerar em `docs/security/`:
- `security-baseline.md` — saída de `supabase--run_security_scan` + `supabase--linter` + `get_table_schema`, com cada tabela classificada (owner-scoped / multi-tenant / pública intencional).
- `edge-functions-audit.csv` — uma linha por função em `supabase/functions/*`: `auth_required`, `validates_input`, `uses_service_role`, `returns_pii`, `risco`.
- `routes-audit.md` — cada rota em `src/App.tsx` classificada (pública / autenticada / admin / portal-por-token) e qual gate a protege hoje.

Saída: nenhum arquivo do app é alterado. Resultado é a lista priorizada para as ondas seguintes.

## Onda 2 — Defesa em profundidade nas rotas (frontend, aditivo)

- Criar `src/components/AuthGate.tsx` e `src/components/RequireRole.tsx` (novos, não removem nada).
- Envolver `/super-admin` com `<RequireRole role="admin">` **em paralelo** ao gate existente.
- Ocultar o item de menu `/super-admin` no `DashboardLayout` via consulta a `is_super_admin` reaproveitando `useActiveClientId.isSuperAdmin` (sem novo RPC).
- Validar: suíte Vitest + troca manual de perfil no preview.

Risco: baixíssimo (só reforça).

## Onda 3 — Padronizar Edge Functions

1. Em `supabase/functions/_shared/`: adicionar `validate.ts` (Zod helper que devolve 400 genérico) e `auth.ts` (`requireAuth(req)` validando JWT via `supabaseAdmin.auth.getUser(token)`). Reaproveitar o que já existir em `_shared/`.
2. Aplicar em **lotes de 5 funções**, priorizadas pelo CSV da Onda 1 (maior risco primeiro: `manage-platform-user`, `create-team-user`, `eleicao-create-account`, `manage-whatsapp-instance`, `register-*`).
3. **Modo warn-only por 48h** em cada lote: schema valida e loga `console.warn`, não bloqueia. Após 48h sem warns → ativar 400.
4. Funções intencionalmente públicas (portais por `clientId`, `whatsapp-inbound-webhook`) recebem comentário no topo marcando como pública e validação de assinatura/HMAC quando aplicável.

Risco: médio, mitigado pelo warn-only e lotes pequenos.

## Onda 4 — RLS hardening dirigido pelo linter

- Rodar `supabase--linter` + reler `security-baseline.md`.
- Cada finding **error** → migration nominada via `supabase--migration` (uma tabela por migration).
- Tabelas sem RLS que deveriam ter → habilitar RLS + policy padrão `is_super_admin() OR user_can_access_client(client_id)`.
- Tabelas intencionalmente públicas → manter + registrar em `security--update_memory` para o scanner parar de acusar.
- Antes de cada migration: SELECT representativo no preview + suíte E2E Playwright (já criada) como sanity check.

Risco: este é o ponto mais sensível. Mitigação: uma tabela por vez + rollback SQL incluso.

## Onda 5 — Telemetria e segredos

- Tabela `security_events` (insert-only, RLS deny-all exceto service role) com `event_type`, `user_id`, `metadata`, `at`. Funções sensíveis gravam `role_changed`, `permission_denied`, `admin_action`.
- Hook `useSecurityLog` (complemento client-side, não substitui auditoria server-side).
- `fetch_secrets` para confirmar que nenhuma chave privada está prefixada `VITE_`. Se encontrar, migrar para segredo runtime **antes** de remover do client.

## Critérios de aceitação

- `bun run test` continua verde (27/27 atuais + novos testes de role/gate).
- `bun run test:coverage` ≥ thresholds atuais.
- `supabase--linter` retorna **0 errors**.
- Nenhuma rota autenticada renderiza sem checagem server-side.
- 100% das Edge Functions com Zod + auth explícita (ou marcação "público intencional" com verificação de assinatura).
- `docs/security/security-baseline.md` versionado.

## O que **não** vamos fazer

- Não vamos adicionar checkout/Stripe (sistema não tem cobrança).
- Não vamos trocar `react-router-dom` por TanStack Router só por segurança.
- Não vamos refatorar `user_roles`/`is_super_admin` (já correto).
- Não vamos esconder rotas via code-splitting "para esconder do navegador" (segurança por obscuridade — o gate server-side é o controle real).

---

**Plano de execução proposto:** começar pela Onda 1 (zero risco) para gerar a baseline. Cada onda seguinte só inicia após sua revisão da anterior.