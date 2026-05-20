## Problema

Quando você (super admin) entra em "Configurações" impersonando o cliente do Wellington e cria uma instância de WhatsApp, ela acaba não ficando visível/funcional para ele. Investigando o fluxo encontrei três causas que se reforçam:

### 1. A página `Settings.tsx` usa `resolveClientId()` direto, não o hook compartilhado

`src/pages/Settings.tsx` (linha 25) chama `resolveClientId()` no `useEffect` e guarda o resultado em estado local. Esse helper, quando o super admin **não** tem impersonação ativa naquele instante, cai no fallback `clients.user_id = seu_próprio_user_id` e devolve o **client_id do próprio super admin**.

Resultado: a instância é criada com `client_id` do super admin, não do Wellington. Quando o Wellington loga, o `list_instances` filtra por `client_id = wellington` e a instância simplesmente não aparece — ela existe, mas está pendurada no cliente errado.

Isso é agravado por:
- A página não escuta mudança da chave `lovable.super_admin.impersonate_client_id` (não usa `useActiveClientId`), então alternar o cliente no switcher não re-resolve.
- Não há indicação visual de "você está impersonando X" no card de instâncias.

### 2. O Edge Function `manage-whatsapp-instance` confia cegamente no `client_id` do body

Em `supabase/functions/manage-whatsapp-instance/index.ts` (linhas 494–622), todas as ações de pool (`create_instance_record`, `update_instance_record`, `set_primary_instance`, `delete_instance_record`, `create_instance`, `disconnect`, `set_webhook`, `sync_groups`) usam o `client_id` enviado pelo cliente sem verificar:

- se o usuário autenticado é dono daquele `clients.user_id`,
- ou é `team_member` ativo daquele cliente,
- ou é super admin.

Isso é problema duplo: (a) buraco de segurança — qualquer usuário autenticado pode passar um UUID de outro cliente, (b) impossibilita um log claro de "essa instância foi criada por super admin X em nome do cliente Y", o que dificulta auditar o problema atual.

### 3. Não há como reatribuir uma instância já criada ao client_id correto

Hoje, se a instância foi criada no cliente errado, a única saída é deletar e re-parear o QR Code — o que faz o Wellington perder a sessão WhatsApp que talvez já esteja conectada. Precisamos de uma ação administrativa de "mover instância para outro cliente".

---

## Plano

### Frente A — Corrigir a página Settings (raiz do bug)

1. Em `src/pages/Settings.tsx`, trocar o `useEffect + resolveClientId` por `useActiveClientId()`. Assim:
   - A impersonação é respeitada de verdade (cache compartilhado, invalidação ao trocar de cliente).
   - Enquanto `isLoading`, não renderiza `WhatsAppPoolManager` (evita race condition).
   - Se `needsClientSelection` (super admin sem cliente escolhido), mostra um aviso "Selecione um cliente no switcher antes de configurar instâncias".

2. Em `src/components/settings/WhatsAppPoolManager.tsx`, adicionar um **banner contextual no topo** quando `isImpersonating` for true:
   > "Você está configurando o WhatsApp em nome de **{nomeDoCliente}**. As instâncias criadas aqui ficarão vinculadas a esse cliente."

3. Em `AddInstanceDialog.tsx`, antes do POST, validar localmente que o `clientId` recebido como prop bate com `useActiveClientId().clientId`. Se divergir, abortar e pedir um refresh — evita criar instância contra um cliente "stale".

### Frente B — Autorização no Edge Function

Em `supabase/functions/manage-whatsapp-instance/index.ts`, criar um helper `assertCanActOnClient(adminClient, user, clientId)` que retorna OK se:

- `user.id == clients.user_id` (dono), OU
- existe `team_members` ativo do `user.id` para esse `client_id`, OU
- `has_role(user.id, 'super_admin')` é true (via RPC `is_super_admin` já existente).

Chamar esse helper imediatamente após resolver `resolvedClientId` (linha ~511), antes de qualquer ação de pool ou de bridge. Em caso de falha, retornar 403 com mensagem clara: `"Usuário não autorizado a operar nesse cliente"`.

Adicionar também, no `create_instance_record`, um log estruturado: `created_by_user_id`, `acting_as_super_admin: boolean`, salvo em coluna nova `created_by` (uuid) e `created_by_role` (text) na tabela `whatsapp_instances` — facilita auditar "quem criou".

### Frente C — Migration de suporte

Criar migration que:

1. Adiciona colunas `created_by uuid` e `created_by_role text` em `whatsapp_instances` (nullable, sem default).
2. Garante que `whatsapp_instances` tem RLS ativa com policies:
   - SELECT/UPDATE/DELETE: dono do cliente OU team_member ativo OU super admin.
   - INSERT: mesmo conjunto.
   (Mesmo a edge function usando service role, isso protege qualquer query direta feita pelo front.)

### Frente D — Ação de "mover instância para outro cliente"

Nova ação `reassign_instance` no edge function, restrita a super admin:

- Body: `{ action: "reassign_instance", instance_id, target_client_id }`.
- Verifica via RPC `is_super_admin`.
- Atualiza `whatsapp_instances.client_id` e `is_primary = false`.
- Re-registra o webhook na bridge apontando para `target_client_id` (chama `set_webhook` internamente).
- Retorna a instância atualizada.

Botão "Mover para outro cliente" no `WhatsAppInstancePoolCard`, visível **apenas** quando `useActiveClientId().isSuperAdmin` é true. Abre um dialog com busca de clientes (igual ao switcher).

Assim, a instância órfã que está hoje pendurada no seu super admin pode ser movida para o cliente do Wellington sem precisar refazer o QR.

### Frente E — Diagnóstico imediato

Antes ou junto com as mudanças acima, rodar uma query de diagnóstico para localizar a instância "perdida" do Wellington:

```sql
select wi.id, wi.apelido, wi.status, wi.client_id,
       c.name as cliente_atual, c.user_id as dono_atual
  from whatsapp_instances wi
  join clients c on c.id = wi.client_id
 where wi.created_at > now() - interval '7 days'
 order by wi.created_at desc;
```

Identificar a instância criada errada e, depois da Frente D estar pronta, movê-la para o cliente do Wellington — ou, como fix imediato manual via SQL, dar `update whatsapp_instances set client_id = '<id_wellington>' where id = '<id_da_instancia>';`.

---

## Resultado esperado

- Impossível criar instância no cliente errado (UI + edge function travam).
- Banner deixa claro em nome de quem você está atuando.
- Instâncias já mal-atribuídas podem ser corrigidas sem perder a sessão WhatsApp.
- Qualquer ação no pool é auditável (quem criou, em que papel).
- Wellington passa a ver e usar a instância normalmente após o reassign.

## Detalhes técnicos

- Arquivos tocados: `src/pages/Settings.tsx`, `src/components/settings/WhatsAppPoolManager.tsx`, `src/components/settings/AddInstanceDialog.tsx`, `src/components/settings/WhatsAppInstancePoolCard.tsx`, `supabase/functions/manage-whatsapp-instance/index.ts`, nova migration em `supabase/migrations/`.
- Nenhuma quebra de contrato com a Bridge WhatsHub — o `reassign_instance` reaproveita o `set_webhook` já existente.
- A coluna `created_by` é nullable, então linhas antigas continuam válidas.
