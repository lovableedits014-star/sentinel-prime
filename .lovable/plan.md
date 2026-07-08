## Objetivo
Voltar a tratar a instância como uma sessão persistente: não recriar/destruir a conexão à toa, corrigir o webhook que hoje não encontra a instância certa, e adicionar uma rotina agressiva de manutenção para manter o WhatsApp vivo.

Importante: nenhum sistema consegue garantir 100% se o próprio WhatsApp derrubar/logoutar e exigir QR novamente. O plano abaixo torna o app autocorretivo sempre que a sessão ainda puder ser recuperada pela ponte.

## O problema encontrado
Nos logs, a ponte enviou:

```text
instance_id: 4cf4e412-8230-4e62-b590-1f0780c7a34a
client_id: 6879803f-fd2e-4a43-8d0d-4417e1b1fe15
reason: vps_reported_disconnected
```

Mas no banco a instância do cliente é:

```text
id: 9824d79a-b6c5-4410-a29a-b8ccbaf21a85
apelido: Mayer
status: connecting
phone: 556792773931
```

Ou seja: o webhook está recebendo o ID interno da ponte, não o ID da linha no banco. Ele registra `instance/client mismatch`, não consegue amarrar o evento na instância correta, e o app passa a ficar com estado inconsistente.

## Plano de correção

### 1. Persistir o ID real da ponte
- Adicionar/usar um campo para guardar o `bridge_instance_id` retornado pela ponte quando cria/reconecta a sessão.
- Em `create_instance`, `reconnect`, `instance_status` e `syncInstanceHealth`, salvar esse ID sempre que a ponte devolver `instance_id`, `instance.id`, `id` ou equivalente.
- Para a instância atual “Mayer”, fazer uma migração/ajuste seguro preenchendo esse vínculo quando possível pelo status atual da ponte ou pelo nome/telefone.

### 2. Corrigir o webhook de status
- No `whatsapp-inbound-webhook`, localizar a instância por esta ordem:
  1. `whatsapp_instances.id` igual ao ID recebido;
  2. `bridge_instance_id` igual ao ID recebido;
  3. fallback por `client_id + instance_name/apelido`, quando houver apenas uma instância compatível.
- Só depois disso atualizar `connected`, `connecting` ou `disconnected`.
- Logar claramente quando o evento foi associado por fallback, para auditar se a ponte mudou o formato.

### 3. Reativar “manter conectado” de forma agressiva
- Alterar `health_check_all` para ter modo agressivo por padrão:
  - verificar instâncias ativas com credencial a cada ciclo;
  - se a ponte responder `connected/open`, manter como conectado;
  - se responder `connecting`, não derrubar imediatamente;
  - se responder `disconnected/offline` duas vezes seguidas, tentar `reconnect` com a mesma API key;
  - se voltar `connected`, limpar `last_disconnected_at` e manter a linha operacional;
  - se voltar QR, marcar como `awaiting_qr/connecting` e exibir no painel.
- Não usar `delete_instance` automaticamente. Recriação/destruição só por botão explícito, porque isso troca a sessão e costuma quebrar mais.

### 4. Criar rotina automática de keepalive
- Usar o endpoint já existente `health_check_all` com token seguro.
- Configurar uma chamada periódica curta para todas as instâncias ativas do cliente:
  - intervalo alvo: 2 a 5 minutos;
  - sem enviar mensagem para ninguém;
  - apenas checar sessão, reamarrar webhook e tentar recuperar conexão se a ponte permitir.
- Registrar resultado em `action_logs` para saber exatamente quando caiu, quando reconectou e por quê.

### 5. Reamarrar webhook automaticamente
- Sempre que `instance_status`, `reconnect`, `create_instance` ou `health_check_all` confirmar uma instância, chamar `set_webhook` novamente apontando para:

```text
whatsapp-inbound-webhook?client_id=<client_id>&instance_id=<db_instance_id>&token=<token>
```

- Mesmo se a ponte enviar o ID interno dela, o banco já terá o `bridge_instance_id` para associar.

### 6. Melhorar o painel para operação real
- Na tela Status WhatsApp, mostrar:
  - “Mantendo conectado” quando a rotina automática está ativa;
  - último keepalive;
  - última tentativa de recuperação;
  - motivo real da queda (`vps_reported_disconnected`, logout, offline etc.);
  - botão “Forçar manter conectado agora” para rodar o keepalive imediatamente.

### 7. Validar na sua instância atual
- Depois da implementação, rodar uma checagem manual da instância Mayer.
- Confirmar que o webhook não mostra mais `instance/client mismatch`.
- Confirmar que a instância sai de `connecting/disconnected` para `connected` quando a ponte estiver viva.
- Sincronizar grupos novamente usando a mesma instância, sem exigir criar outro número.

## Arquivos/áreas que serão alterados
- `supabase/functions/manage-whatsapp-instance/index.ts`
- `supabase/functions/whatsapp-inbound-webhook/index.ts`
- painel de Status WhatsApp / cards de instância
- banco: campo de vínculo com ID interno da ponte e, se necessário, configuração do keepalive

## Resultado esperado
A sessão deixa de depender de estado manual quebradiço: o app reconhece corretamente a instância da ponte, reamarra webhook, checa periodicamente e tenta recuperar automaticamente sem recriar a instância. Se o WhatsApp exigir QR de novo, o painel mostra isso imediatamente em vez de deixar a linha perdida em `connecting`.