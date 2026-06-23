## Diagnóstico

**1. Botão da setinha (perfil)**
No ranking de Militância Digital, a setinha chama `getSocialProfileUrl(platform, platform_user_id, null, author_name)` em `src/pages/Militancia.tsx:512`.

O `platform_user_id` que a Graph API devolve nos comentários do Facebook é um **PSID** (Page-Scoped ID) — um número que **não** resolve em `facebook.com/profile.php?id=...`. Por isso, em `src/lib/social-url.ts:27-34`, o código cai no fallback `facebook.com/search/people/?q=<nome>` — que é exatamente a tela de "vários com nome igual" que você está vendo.

Não há como transformar PSID em link de perfil real só com o ID. O caminho confiável é abrir **o próprio comentário no Facebook** (via `permalink_url` que já temos salvo, ou via `facebook.com/<comment_id>`). Lá você clica no nome e cai no perfil verdadeiro — e pode bloquear pelo próprio Facebook se quiser.

**2. Botão "Bloquear"**
Olhando `supabase/functions/manage-comment/index.ts:186-247`:
- **Facebook**: funciona de verdade. Chama `POST /{page-id}/blocked` com o PSID, oculta o comentário e grava em `blocked_users`. Requer permissão `pages_manage_engagement` no token da página.
- **Instagram**: **não bloqueia de verdade** — a Graph API do Instagram não expõe endpoint de bloqueio. Hoje só registra localmente em `blocked_users` e mostra a mensagem "bloqueie manualmente pelo app". A UI já desabilita parcialmente (toast em `Militancia.tsx:458`), mas o botão fica visível com o mesmo estilo, dando impressão errada.

## Plano de melhoria

### A. Setinha agora abre o autor de verdade (Facebook e Instagram)

Trocar o destino do link da setinha por uma cadeia de fallback, na ordem:

1. **`platform_username`** se já tivermos um handle/vanity (instagram quase sempre, facebook às vezes) → abre `instagram.com/<user>` ou `facebook.com/<user>` direto.
2. **`comment.permalink_url`** do comentário negativo mais recente desse autor (já está salvo em `comments.post_permalink_url` ou pode ser derivado de `comment_id`). Abre o comentário exato no Facebook/Instagram — daí basta clicar no nome para chegar no perfil real.
3. Último recurso: a busca por nome atual (mantida só como fallback final).

Implementação:
- Em `src/pages/Militancia.tsx` o ranking já tem acesso a `commentsByAuthor` — usar o comentário mais recente para pegar `permalink_url`/`comment_id`.
- Para autores sem comentário em cache, fazer uma busca rápida no clique (lazy) buscando o último `permalink_url` em `comments`.
- Trocar o ícone/label para "Abrir comentário" quando o link for um permalink, ou "Abrir perfil" quando for vanity — com tooltip explicando: *"O Facebook não permite link direto pelo ID interno. Abrimos o comentário; clique no nome para ver o perfil e bloquear."*
- Substituir `<a>` por `Button` maior com `target="_blank"` para ficar óbvio (hoje é só um ícone discreto ao lado do "Bloquear").

### B. Enriquecimento opcional: resolver vanity uma vez e guardar

Quando abrirmos o comentário pela primeira vez, disparar em background `resolve-social-link` passando `permalink_url`. Se voltar um handle (`userVanity` do Facebook), gravar em `social_militants.platform_username` (coluna nova, nullable). Próximas vezes, a setinha vira link direto de perfil sem precisar passar pelo comentário.

Migration necessária:
- `alter table social_militants add column platform_username text;` (grants já existem).

### C. Botão "Bloquear" — deixar o comportamento honesto

- **Facebook**: manter como está (funciona).
- **Instagram**: trocar o botão "Bloquear" por **"Marcar para bloquear no app"** com ícone diferente (ex.: `ExternalLink + Ban`), abrir o perfil/comentário do Instagram em nova aba e só então registrar localmente em `blocked_users`. Toast explica em uma linha que o Instagram não permite via API.
- Adicionar legenda fixa abaixo do ranking: *"Facebook: bloqueio automático via API. Instagram: bloqueio precisa ser feito manualmente pelo app — registramos aqui para histórico."* (já existe parecida no topo, mas reforçar perto dos botões.)

### D. Validação

1. Clicar na setinha de um hater do Facebook → abre o comentário dele na página → clique no nome leva ao perfil real.
2. Clicar na setinha de um hater do Instagram → abre o post/comentário no Instagram.
3. Botão "Bloquear" no Facebook → confirma sucesso, autor entra em `blocked_users` e não comenta mais.
4. Botão no Instagram → abre o app/web do Instagram + registra local + toast claro.

## Arquivos a editar

- `src/pages/Militancia.tsx` — lógica do botão setinha + texto do botão Instagram.
- `src/lib/social-url.ts` — helper novo `getBestProfileLink(militant, latestComment)` com a cadeia de fallback.
- `supabase/migrations/<novo>.sql` — `alter table social_militants add column platform_username text;`
- (opcional) chamada a `resolve-social-link` em background no clique, salvando o vanity descoberto em `social_militants`.

## Resposta direta às suas perguntas

- **A setinha não abre o perfil?** Correto — Facebook devolve um ID interno (PSID) que não vira URL de perfil. O fallback atual é busca por nome. Vou trocar para abrir o **comentário** do hater (link direto), de onde você clica no nome e bloqueia.
- **O botão "Bloquear" funciona?** Sim no **Facebook** (via Graph API). No **Instagram não funciona de verdade** — a Meta não expõe API de bloqueio para Instagram; hoje só registramos localmente. Vou deixar o botão do Instagram explícito ("Abrir e marcar para bloquear").