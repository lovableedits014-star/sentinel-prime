## Objetivo

Trazer para a aba **Bloqueados** todos os perfis que já foram bloqueados na página do Facebook — inclusive os que foram bloqueados manualmente pelo gestor antes do sistema existir.

## Como funciona

O Facebook expõe o endpoint `GET /{page-id}/blocked` que lista todos os perfis bloqueados da página. Vamos consumir esse endpoint, paginar até o fim e inserir/atualizar cada registro na tabela `blocked_users`.

Para Instagram não há API equivalente, então essa sincronização cobre apenas Facebook (o Instagram continua sendo registro manual).

## O que será feito

1. **Nova edge function `sync-blocked-users`**
   - Recebe `clientId`.
   - Busca o token da página em `integrations`.
   - Chama `GET /{page-id}/blocked?fields=id,name,picture&limit=100` e segue a paginação (`paging.next`) até trazer todos.
   - Faz `upsert` na tabela `blocked_users` (chave `client_id + platform + platform_user_id`), com `platform = 'facebook'` e `reason = 'facebook_synced'`.
   - Detecta bloqueios que existem localmente mas sumiram do Facebook (foram desbloqueados fora do sistema) e remove esses registros locais — para a lista refletir a realidade.
   - Retorna `{ added, updated, removed, total }`.

2. **Botão "Sincronizar do Facebook" na aba Bloqueados**
   - Posicionado ao lado do campo de busca.
   - Mostra spinner enquanto roda.
   - Ao concluir, exibe toast (`X bloqueados sincronizados, Y removidos`) e invalida a query da lista.

3. **Sincronização automática na primeira abertura**
   - Quando o usuário entra na aba Bloqueados pela primeira vez na sessão e a tabela está vazia (ou tem só registros do Instagram), dispara a sync automaticamente uma vez — para a aba já vir populada sem o usuário precisar clicar.

## Pontos de atenção

- **Permissões Meta**: o endpoint `/blocked` exige `pages_manage_engagement` (que a integração já usa para bloquear). Se faltar permissão, a função retorna erro claro: *"Reconecte a página com a permissão pages_manage_engagement"*.
- **Avatar**: o campo `picture` do Graph API retorna o avatar do bloqueado — vamos guardar em `avatar_url`.
- **Não duplica**: o `upsert` garante que rodar a sync várias vezes é seguro.
- **Não afeta Instagram**: registros manuais de IG na tabela permanecem intactos.

## Detalhes técnicos

```text
sync-blocked-users (edge function)
 ├─ valida auth + acesso ao cliente
 ├─ pega meta_access_token + meta_page_id
 ├─ deriva page access token
 ├─ loop paginado em /{page_id}/blocked?fields=id,name,picture
 ├─ upsert em blocked_users
 ├─ delete registros FB locais ausentes na resposta
 └─ retorna contagens
```

Frontend (`BlockedUsersTab` em `src/pages/Militancia.tsx`):
- nova mutation `useMutation` chamando `supabase.functions.invoke('sync-blocked-users')`
- botão `<Button variant="outline">` com ícone `RefreshCw`
- efeito `useEffect` que dispara a sync uma vez quando a tab monta e ainda não foi sincronizada
