## Diagnóstico

Nos logs do `fetch-meta-comments` (sync mais recente):

```
Client: ... | Posts limit: 6
[IG] Newest from Meta: 2026-06-16T23:19:13+0000 | types: { REELS: 5, FEED: 1 }
FB posts: 6, IG media: 6
```

A causa raiz é que o **Instagram busca exatamente N itens (limit=6)** vindos da UI (o seletor "últimos N posts" da página Comentários manda `n=6`). O Facebook também recebe `limit=6`, mas o FB **pagina** se faltar — o IG não. Resultado:

- Se o candidato publica muitos Reels (5 dos 6 últimos foram Reels), um post de Feed do meio do dia pode cair para fora da janela de 6.
- O FB mostra esse mesmo post porque o crossposting publicou lá e o seletor do FB pega tudo da janela.
- Postagem do Instagram que aparece só no FB pode ser também um **Story crossposted como post no FB** (a Graph API do IG não devolve Stories no `/media`), mas o caso mais provável aqui é o limite curto cortando o IG.

## Plano de correção

1. **Desacoplar o limite do IG da UI e sempre paginar até pegar as últimas postagens reais.**
   - Em `fetchInstagramMediaWithComments` (`supabase/functions/fetch-meta-comments/index.ts`):
     - Buscar com `limit=25` por página, paginar via `paging.next` até atingir `max(postsLimit, 25)` itens **ou** até a janela de tempo (ex: últimos 7 dias) — o que vier primeiro.
     - Garantir que `media_type` inclua todas as variantes (`IMAGE`, `VIDEO`, `CAROUSEL_ALBUM`, `REELS` via `media_product_type`).
     - Ordenar por `timestamp` desc antes de cortar — para nunca perder o mais recente.
   - Aplicar a mesma lógica de "mínimo de 25 + janela de 7 dias" no FB para manter paridade.

2. **Diagnóstico imediato do post sumido (sem alterar código de produção primeiro):**
   - Rodar uma chamada direta na Graph API com o token salvo: `GET /{ig_id}/media?fields=id,caption,media_type,media_product_type,timestamp,permalink&limit=25` e comparar com o post que apareceu no FB no dia 16/06 à tarde.
   - Se ele estiver na lista do IG → confirma que era só problema de limite curto (correção #1 resolve).
   - Se não estiver → é Story do IG (API não devolve) ou foi publicado apenas no FB. Documentar no card de status para o usuário entender.

3. **Tornar visível no dashboard quando a janela do IG ficar atrás do FB:**
   - No `MetaTokenStatusCard.tsx`, comparar a data do último post FB com a do último IG. Se IG estiver >6h atrás do FB, mostrar aviso: *"O Instagram pode estar atrás — clique em Sincronizar novamente ou aumente o número de posts no seletor"*.

4. **Aumentar o teto do seletor da página de Comentários** de 6 para 30 (default 25) — usuário não precisa pensar "tenho que aumentar manualmente": os últimos sempre entram.

5. **Validação:**
   - Após deploy, rodar sync e checar logs: `[IG] Pages fetched: X | Newest: <timestamp>` precisa bater com a postagem do meio da tarde.
   - Confirmar via SQL que o `comment_created_time` do stub IG mais recente é igual à hora do post real.

## Detalhes técnicos

- Função afetada: `supabase/functions/fetch-meta-comments/index.ts` (linhas 279-337 e cabeçalho `RequestSchema` se eu alterar o teto).
- UI afetada: `src/pages/Comments.tsx` (seletor `n`) e `src/components/dashboard/MetaTokenStatusCard.tsx` (aviso de lag IG vs FB).
- Sem mudança de schema/banco.
- Custo Graph API: paginação extra adiciona ~1-2 chamadas; bem dentro do limite.

Quer que eu aplique direto a correção #1 + #4 (essenciais) e o diagnóstico #2 em paralelo, ou prefere ver o #2 primeiro antes de eu mexer no código?