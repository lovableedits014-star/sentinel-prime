# Security Baseline — Onda 1

> Snapshot somente leitura. Nenhuma alteração de código/dados foi feita.
> Fontes: `supabase--linter`, leitura do schema, mapa de Edge Functions e rotas.

## TL;DR

- **0 erros** no linter Supabase. **122 findings**, todos WARN/INFO.
- Postura de roles está correta (`user_roles` + `app_role` enum + `has_role()` + `is_super_admin()` SECURITY DEFINER).
- Padrão de RLS multi-tenant `is_super_admin() OR user_can_access_client(client_id)` já é dominante.
- Principais frentes a endurecer: padronização de auth/validação nas Edge Functions e revisão pontual do linter.

## Distribuição dos findings do linter

| Categoria | Qtd | Severidade | Comentário |
|---|---|---|---|
| Signed-in Users Can Execute SECURITY DEFINER Function (0029) | ~113 | WARN | Maioria são internos do `pgvector`/`unaccent` (vector_*, halfvec_*, sparsevec_*). Filtrar nossos próprios SECURITY DEFINER (~10) e revisar caso a caso. |
| Function Search Path Mutable (0011) | 3 | WARN | Adicionar `SET search_path = public` nas 3 funções listadas. |
| Extension in Public (0014) | 2 | WARN | `vector` e `unaccent` em `public`. Mover é arriscado (quebra índices) — aceitar e documentar. |
| RLS Policy Always True (0024) | 2 | WARN | Revisar as 2 policies (provavelmente UPDATE/DELETE com `USING (true)`). Onda 4. |
| Public Bucket Allows Listing (0025) | 5 | WARN | Buckets públicos permitem `LIST`. Onda 4 — restringir LIST mantendo GET público. |
| RLS Enabled No Policy (0008) | 1 | INFO | Tabela com RLS mas sem policies (= nega tudo). Verificar se é proposital. |
| Leaked Password Protection Disabled | 1 | WARN | Habilitar em Auth → Password Security (config de projeto, fora do código). |

> Reanalisar com `supabase--linter` após cada migration da Onda 4 e atualizar a tabela.

## Auth & Roles

- Tabela `user_roles (user_id, role)` com enum `app_role` ✅
- `public.has_role(_user_id uuid, _role app_role)` SECURITY DEFINER, `search_path = public` ✅
- `public.is_super_admin()` SECURITY DEFINER (compara email do auth) ✅
- `handle_new_user()` cria `profiles` + atribui role `client` no signup ✅

**Risco residual:** `is_super_admin()` é baseado em e-mail hardcoded (`lovableedits014@gmail.com`). Funciona, mas concentrar em uma role explícita `super_admin` em `user_roles` é mais robusto a longo prazo — fora desta onda (decisão prévia: não refatorar roles).

## Multi-tenant / RLS

Padrão observado nas migrations recentes:

```sql
USING (
  public.is_super_admin()
  OR public.user_can_access_client(client_id)
)
```

Tabelas críticas com policies dessa forma: `pessoas`, `supporters`, `eleicao_pessoas`, `funcionarios`, `whatsapp_instances`, `engagement_actions`, etc.

## Segredos / Front-end

Apenas chaves públicas em `VITE_*` (`URL`, `PUBLISHABLE_KEY`, `PROJECT_ID`). Nenhum segredo privado prefixado `VITE_`.

## Storage

5 buckets públicos com policy de listagem ampla. Decisão da Onda 4: manter GET público, restringir LIST a service role ou usuário do client_id correspondente.

## XSS / HTML

`dangerouslySetInnerHTML` aparece apenas em `src/components/ui/chart.tsx` (variáveis CSS do shadcn). Seguro.

## Itens fora de escopo desta onda

- Refatorar roles para usar `super_admin` em `user_roles` (decisão prévia).
- Adicionar checkout / payments (sistema não tem cobrança).
- Trocar `react-router-dom` por outro router.

## Próximos passos

1. **Onda 2** — `AuthGate` + `RequireRole` aditivos em rotas autenticadas e `/super-admin`.
2. **Onda 3** — Lotes de 5 Edge Functions para padronizar `requireAuth` + Zod (warn-only 48h, depois bloqueante).
3. **Onda 4** — Migrations dirigidas pelo linter (uma tabela/policy por migration).
4. **Onda 5** — Tabela `security_events` + hook `useSecurityLog`.
