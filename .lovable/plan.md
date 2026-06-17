
## O que verifiquei

- **Integração Meta** do cliente está ativa (`meta_instagram_id` configurado, token `long_lived`).
- A função `fetch-meta-comments` **rodou hoje (17/06 às 12:53)** com sucesso: `IG media: 30`, `Post stubs saved - IG: 30`.
- No banco, **a postagem mais recente do Instagram salva é de 16/06 às 23:19** ("VEM AÍ UMA GRANDE FESTA…"). Nada do dia 17/06 apareceu — apesar de já existirem comentários novos sendo capturados em posts antigos.
- Os erros nos logs (`engagement_actions_supporter_id_fkey`) não bloqueiam a sincronização das postagens — são de outro fluxo (engajamento).

## Diagnóstico provável

O endpoint do Meta `/{ig_id}/media` está retornando 30 itens, mas o item mais novo é de 16/06. Isso normalmente acontece quando:

1. **Reels / Stories**: o `/media` padrão às vezes não devolve reels recém-publicados sem o campo `media_product_type`. Stories nunca aparecem nesse endpoint (precisa `/stories`).
2. **Posts publicados por outra conta/colaborador**: aparecem na grade do Instagram mas não no Graph API daquela conta business.
3. **Atraso de propagação**: posts muito recentes às vezes demoram para aparecer no Graph.

## Plano de ação

### 1. Diagnóstico ao vivo (sem mudar código ainda)
- Chamar o Graph API direto com o token salvo para listar exatamente o que o Instagram está retornando agora — incluindo `media_product_type`, `timestamp` e `owner` — e comparar com o que o usuário vê no app do Instagram.
- Isso identifica se é (a) reel filtrado, (b) story, ou (c) post realmente não retornado pelo Meta.

### 2. Ajustar `supabase/functions/fetch-meta-comments/index.ts`
- Acrescentar `media_product_type` e `owner` aos `fields` da chamada `/{ig}/media` para capturar reels e identificar se são da conta certa.
- Aumentar log: imprimir o `timestamp` do primeiro item retornado por IG, para deixar visível no painel se o Meta não está devolvendo o post mais novo.
- Opcional (se confirmarmos que são reels): adicionar uma segunda chamada explícita a `/{ig}/media?fields=...&media_product_type=REELS` como fallback.

### 3. Painel de diagnóstico no app
- Mostrar no card de integração Meta (em Configurações) a data do post IG mais recente que o Meta devolveu na última sincronização — assim o usuário enxerga rapidamente se o problema é o Meta ou o nosso código.

### 4. Se for story / post de outra conta
- Explicar ao usuário que stories não são sincronizadas pelo Meta API e indicar a conta correta de origem.

## Detalhes técnicos

- Arquivo principal: `supabase/functions/fetch-meta-comments/index.ts` (função `fetchInstagramMediaWithComments`, linhas 279–322).
- Card de status: `src/components/dashboard/MetaTokenStatusCard.tsx` — adicionar linha com "Último post IG capturado: …".
- Sem alterações no schema do banco.
- Sem mudança nas regras de RLS.
