## Diagnóstico — por que está quebrando depois do multiusuário

Mapeei como cada página descobre o `client_id` do usuário logado. Achei a causa raiz:

**O `client_id` é resolvido manualmente em ~30 páginas, cada uma com regras diferentes.** Só 6 lugares usam o helper centralizado `resolveClientId()` (que respeita a “impersonação” do super admin):

- Usam `resolveClientId()`: `Comments`, `Settings`, `Eleicao`, `InteligenciaEleitoral`, `InteligenciaConteudo`, `SugestoesPanel`.
- Fazem cópia/colagem do `getUser → clients → team_members`: `Dashboard`, `Pessoas`, `Disparos`, `Campanha`, `Funcionarios`, `Militancia`, `Territorial`, `MissoesIA`, `Engagement`, `ControlePresenca`, `CalendarioPolitico`, `Midia`, `StatusWhatsApp`, `Integrations`, `Recrutamento`, `Contratados`, `PessoaPerfil`, vários componentes de `inteligencia/*` etc.

Isso explica exatamente os sintomas:

1. **Super admin trocando de gerente só funciona em algumas abas.** Nas outras o `localStorage` da impersonação é ignorado → ele vê “sem dados” ou dados do cliente errado.
2. **Super admin sem gerente selecionado fica sem `clientId`** em quase todas as páginas → consultas com `client_id=null` retornam vazio (ou estouram em `clientId!`), parecendo “bug de renderização”.
3. **Filtros inconsistentes em `team_members`** entre páginas (umas filtram `status='active'`, outras não; umas pegam `maybeSingle()` sem ordenar). Usuário multi‑role pode cair no vínculo errado em uma aba e no certo em outra.
4. **Caches do React Query não invalidam juntos** quando o super admin troca de gerente — o switcher faz `window.location.reload()`, mas páginas que guardam `clientId` em `useState` (sem `useQuery` chaveado por ele) só atualizam no reload. Após uma navegação interna, o estado some e cada página refaz a descoberta sozinha → flicker, queries duplicadas, “não carrega”.
5. **Race condition**: queries disparam com `clientId=null` e depois reexecutam quando o id chega; algumas usam `clientId!` (non‑null assertion) e quebram em runtime quando o id é `null`.
6. **`useCurrentClientId` (hook em `src/hooks/ic/`) NÃO respeita a impersonação** — diverge do `resolveClientId()`. Quem usa esse hook fica fora de sincronia com quem usa o helper.
7. **Sem guarda para super admin sem cliente** — quando o switcher está em “Nenhum (Super Admin)” todas as páginas tentam carregar com `clientId=null` e mostram telas vazias/erros, sem nenhuma mensagem clara.

## Plano de correção

### 1) Fonte única da verdade para o `client_id`

Criar `src/hooks/useActiveClientId.ts` (React Query) que devolve `{ clientId, isLoading, isSuperAdmin, needsClientSelection }` e:

- Reaproveita a lógica do `resolveClientId()` (super admin com impersonação → owner em `clients` → `team_members` ativo).
- Tem **uma query key estável** (`["active-client-id"]`) para que o switcher invalide tudo de uma vez via `queryClient.invalidateQueries({ queryKey: ["active-client-id"] })` — sem `window.location.reload()`.
- Expõe `needsClientSelection = isSuperAdmin && !clientId` para a UI mostrar um aviso “Selecione um gerente para visualizar os dados”.

Substituir `useCurrentClientId` (em `src/hooks/ic/`) por um re‑export desse novo hook, mantendo o nome para não quebrar imports.

### 2) Atualizar o helper e o switcher

- `resolveClientId()` continua existindo (para chamadas fora de React, ex.: edge calls). Vai apenas chamar a mesma lógica internamente para ficar 1‑pra‑1 com o hook.
- `SuperAdminClientSwitcher` deixa de fazer `window.location.reload()` e passa a fazer só `queryClient.invalidateQueries()`. Mais rápido, e funciona em todas as abas.

### 3) Migrar todas as páginas para o hook

Para cada arquivo da lista “fazem cópia/colagem”, remover o bloco manual de `getUser → clients/team_members` e usar:

```tsx
const { data: clientId, isLoading: loadingClient } = useActiveClientId();
```

E gatear toda `useQuery`/efeito de fetch com `enabled: !!clientId`. Substituir `clientId!` por verificações reais.

Arquivos a tocar (sem mudar a UI nem regras de negócio):
`Dashboard`, `Pessoas`, `Disparos`, `Campanha`, `Funcionarios`, `Militancia`, `Territorial`, `MissoesIA`, `Engagement`, `ControlePresenca`, `CalendarioPolitico`, `Midia`, `StatusWhatsApp`, `Integrations`, `Recrutamento`, `Contratados`, `PessoaPerfil`, `components/engagement/AIMissionsPanel`, `components/inteligencia/narrativa/NarrativaPolitica`, `components/inteligencia/PulsoPolitico`, `components/pessoas/TimelinePolitica`, `components/pessoas/InteracoesTimeline`, `components/calendario/PromptArteButton`, `components/inteligencia-conteudo/IngestDocumentDialog`.

### 4) Guarda visual para super admin sem cliente

Num componente compartilhado (ex.: `RequireClient`) usado dentro do `DashboardLayout` em volta do `<Outlet/>`:

- Se `needsClientSelection`, renderiza um card amigável: “Você é Super Admin. Selecione um gerente no topo da barra lateral para visualizar os dados deste módulo.”
- Para usuários comuns sem `clientId` (caso raro), mostra mensagem de “sem vínculo ativo”.

Isso elimina as telas em branco e os erros silenciosos.

### 5) Padronizar query keys

Toda `useQuery` de dados do cliente deve incluir `clientId` na key (ex.: `["pessoas", clientId]`). Assim o switch de gerente refetcha automaticamente em todas as abas abertas e o cache do gerente anterior fica isolado (não “vaza” quando volta).

### 6) Corrigir consultas a `team_members` em todo lugar

Padronizar:
```ts
.from("team_members").select("client_id")
.eq("user_id", uid).eq("status", "active")
.order("created_at", { ascending: false })
.limit(1).maybeSingle()
```
Isso resolve o caso de membros com mais de uma associação ou com vínculos antigos inativos pegando precedência.

### 7) Verificação

Após aplicar:
- Login como super admin: trocar gerente no switcher → todas as abas atualizam sem reload.
- Login como gerente comum (owner em `clients`): tudo funciona como hoje.
- Login como `team_member` com `allowed_paths` parciais: páginas permitidas carregam; bloqueadas redirecionam com toast (já está no `DashboardLayout`).
- Super admin sem gerente selecionado: vê o aviso “Selecione um gerente”, sem telas em branco.

## Detalhes técnicos (para referência)

- `src/lib/resolveClientId.ts` continua, mas vira um wrapper de uma função pura (`resolveClientIdFor(userId)`) reutilizada pelo `useActiveClientId`.
- `useActiveClientId` usa `staleTime: 5 * 60_000` e `gcTime: 30 * 60_000`; é invalidado por: (a) switcher do super admin, (b) `onAuthStateChange` quando o `user.id` muda.
- Páginas hoje guardam `clientId` em `useState` + `useEffect`; vão passar a derivar do hook (sem `useEffect` próprio para isso).
- Não tocaremos em RLS nem em edge functions neste passo — o problema é puramente de resolução do `client_id` no frontend.

## Fora do escopo

- Mudanças no menu/permissões granulares (continua igual).
- Refatorar lógica de negócio das páginas; só troco como elas obtêm o `client_id`.
- Edge functions (já recebem `client_id` via body/JWT, e isso não é o que está quebrando).
