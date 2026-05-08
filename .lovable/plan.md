## Objetivo
Permitir que, ao criar um disparo, você selecione **grupos de WhatsApp** da sua instância principal como destinatários — sem precisar copiar o link e colar manualmente. A mensagem será enviada direto para o grupo (texto e mídia, exatamente como o envio para pessoas).

## Como vai funcionar (visão do usuário)

1. Em **Configurações → WhatsApp**, no card da instância **Principal**, aparece um botão novo: **"Sincronizar grupos"**.
   - Ao clicar, puxamos da Uazapi todos os grupos que aquele número participa (nome, foto, nº de participantes, se é admin) e salvamos no banco.
   - Mostra a data da última sincronização.

2. Em **Disparos**, ao lado do seletor de pessoas/segmentos, ganha uma nova aba/seção: **"Grupos"**.
   - Lista os grupos sincronizados, com busca por nome e checkbox para selecionar vários.
   - Mostra contagem ("3 grupos selecionados · ~840 membros impactados").
   - Você pode misturar: enviar para pessoas **e** grupos no mesmo disparo, ou só grupos.

3. O envio reaproveita todo o motor atual de campanha (fila, pausa, retomada, **cancelamento**, log) — cada grupo vira um item da campanha igual a um contato.

## O que muda tecnicamente

### Banco (1 tabela nova)
- `whatsapp_groups`: `client_id`, `instance_id`, `group_jid` (`xxxx@g.us`), `name`, `picture_url`, `participants_count`, `is_admin`, `is_announcement` (só admins postam), `last_synced_at`.
  - Único por (`instance_id`, `group_jid`).
  - RLS: somente membros do client veem.

### Pequena extensão na tabela existente
- `whatsapp_dispatch_items`: adicionar coluna opcional `group_jid` (texto). Quando preenchida, o item representa um envio para grupo em vez de contato. `phone` fica nulo nesses casos.

### Edge function `manage-whatsapp-instance`
- Nova action `sync_groups`: chama o endpoint de listagem de grupos da Uazapi para a instância principal, faz upsert em `whatsapp_groups` e marca os que sumiram como removidos.

### Edge function `send-whatsapp-dispatch`
- No loop de envio, se o item tem `group_jid`, envia para o JID do grupo (mesma rota de mensagem da Uazapi, só muda o destinatário). Se tem `phone`, segue o fluxo atual.
- Respeita "grupo só admins" (`is_announcement` + `is_admin=false`) → marca como `pulado_sem_permissao` em vez de tentar e falhar.

### Frontend
- `WhatsAppInstancePoolCard.tsx` (instância principal): botão **Sincronizar grupos** + badge "X grupos · sincronizado há Y".
- `Disparos.tsx`: nova aba **Grupos** no seletor de destinatários, com busca, seleção múltipla e contagem. No envio, mandar a lista de `group_jids` junto com a lista de contatos para a edge function.
- Hook novo `useWhatsAppGroups(clientId)` para listar/sincronizar.

## Fora do escopo (deixar para depois, se você quiser)
- Sincronização automática periódica (por enquanto só botão manual).
- Listar grupos das **outras** instâncias do pool (só a principal).
- Tags/categorias por grupo, estatísticas detalhadas por grupo, segmentação por bairro.
- Criar/sair/administrar grupos pelo painel.

## Riscos e cuidados
- **Anti-ban**: enviar para muitos grupos rápido aumenta risco. Vamos reusar o intervalo configurável que já existe no disparo (mesmo throttle dos envios para pessoas).
- **Grupos só-admin**: detectados na sincronização e tratados sem erro.
- **Grupos antigos/saídos**: marcados como inativos quando deixam de aparecer na sincronização — não são exibidos no seletor.
