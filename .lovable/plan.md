## Diagnóstico encontrado

- A instância atual `Mayer` está no banco como `disconnected` desde `19/06 15:24:03`, com `last_health_check_at` no mesmo segundo.
- Não houve falha de envio registrada hoje: os últimos envios registrados foram ontem e estavam com `preflight_status=connected` e `success=true`.
- Isso indica que a queda mais recente provavelmente foi causada por uma verificação de status/health check, não por um disparo.
- Ainda existem fluxos que podem marcar a instância como `disconnected` com apenas uma confirmação da ponte, e dois fluxos eleitorais ainda podem tentar `reconnect` automaticamente.
- O webhook configurado para a bridge não inclui o token na URL; se a bridge não enviar o header secreto, o webhook rejeita eventos e o sistema perde sinais confiáveis de `connected/ready/open`.

## Plano de correção definitiva

1. **Parar de derrubar por uma única leitura ruim**
   - Alterar `syncInstanceHealth` e `instance_status` para não marcar `disconnected` imediatamente em uma única resposta terminal.
   - Exigir dupla confirmação: consultar a bridge, aguardar alguns segundos e consultar novamente antes de rebaixar a instância.
   - Se a segunda leitura vier `connected/open/connecting/vazia/erro temporário`, manter o status anterior e só atualizar `last_health_check_at`.

2. **Remover reconexões automáticas restantes**
   - Ajustar `eleicao-send-credentials` para não chamar `reconnect` após falha de envio.
   - Ajustar `eleicao-notify-novo-lider` para não chamar `reconnect` no preflight nem no retry.
   - Esses fluxos devem apenas registrar a falha e orientar reconexão manual, igual ao disparo principal.

3. **Proteger contra recriação acidental de sessão**
   - Revisar `create_instance` e `reconnect` para evitar `delete_instance`/recriação quando a sessão ainda tem credencial válida.
   - Reativar uma proteção mínima contra tentativas repetidas de QR/reconnect, porque múltiplos handshakes seguidos podem derrubar ou banir o número.

4. **Corrigir o webhook de status da bridge**
   - Incluir o token secreto na URL configurada em `set_webhook`, para garantir que eventos `connected`, `ready`, `open`, `logout` e `banned` sejam aceitos.
   - Quando chegar evento `connected/open/ready`, limpar `last_disconnected_at` e restaurar `connected_since`.

5. **Melhorar logs e diagnóstico no painel**
   - Registrar em `action_logs` quando uma instância for marcada offline, com motivo: health check, webhook, envio, reconexão manual ou criação de QR.
   - Isso permite saber exatamente quem derrubou o status caso aconteça de novo.

6. **Validação após aplicar**
   - Consultar a instância no banco antes/depois da verificação.
   - Rodar `instance_status`/`health_check_all` e confirmar que uma oscilação não muda o status para `disconnected`.
   - Implantar as Edge Functions alteradas: `manage-whatsapp-instance`, `whatsapp-inbound-webhook`, `eleicao-send-credentials` e `eleicao-notify-novo-lider`.

## Resultado esperado

- O sistema não deve mais derrubar a instância por oscilação curta da ponte.
- Nenhum fluxo deve forçar reconnect ou recriar QR sem ação explícita do usuário.
- Quando o WhatsApp estiver realmente conectado, o painel deve voltar a mostrar conectado assim que a bridge confirmar.
- Se cair de verdade, ficará registrado o motivo exato da queda.