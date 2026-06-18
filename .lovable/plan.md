## Diagnóstico inicial

A instância principal está no banco como `connecting`, com `connected_since` vazio, `last_disconnected_at` recente e 2 tentativas de reconexão hoje. O envio mais recente completou 27/30, mas houve falhas de mídia e números inválidos. O ponto mais perigoso encontrado é que ainda existem fluxos fora do disparo que podem forçar `reconnect`/`create_instance` ou marcar a instância como instável quando a bridge retorna `connecting`, mesmo se o celular aparenta conectado.

## Plano de correção

1. **Tornar o monitoramento menos agressivo**
   - Ajustar `manage-whatsapp-instance` para que `instance_status`/`health_check_all` não rebaixem uma instância previamente conectada para `connecting` por respostas transitórias.
   - Só marcar `disconnected` quando a bridge confirmar estado terminal (`disconnected`, `offline`, `closed`, `logged_out`, `logout`, `banned`) ou erro real de envio “instance not connected”.

2. **Remover reconexão automática em fluxo de envio/teste**
   - Em `manage-whatsapp-instance`, quando `send`/`send_media` detectar erro de instância, não chamar `tryReconnectInstance` automaticamente.
   - Registrar a falha e orientar reconexão manual, evitando loops que recriam sessão/QR e derrubam o WhatsApp.

3. **Corrigir o `ensure_connected`**
   - Transformar `ensure_connected` em verificação não invasiva: consulta saúde e retorna o status, sem chamar `reconnect` automaticamente.
   - Isso evita que algum painel ou rotina force handshake sem ação explícita do usuário.

4. **Endurecer o webhook contra falso “disconnected”**
   - Quando chegar evento `disconnected`, tratar `connected`, `open`, `connecting`, resposta vazia ou erro temporário como oscilação, não como queda confirmada.
   - Marcar `disconnected` apenas em `logout`/`banned` ou confirmação terminal após rechecagem.

5. **Reativar sessão já pareada quando a bridge indicar estabilidade**
   - Quando `instance_status` retornar `connected/open`, limpar `last_disconnected_at`, preencher `connected_since` e atualizar `last_health_check_at`.
   - Se hoje a linha estiver `connecting`, ela volta para `connected` assim que a bridge confirmar.

6. **Validar após aplicar**
   - Consultar novamente `whatsapp_instances` para confirmar que o status não fica oscilando para `connecting/disconnected` sem motivo.
   - Verificar logs/contadores de reconexão para garantir que não há reconexões automáticas em sequência.

## Resultado esperado

- A instância deixa de “cair” por checagens automáticas ou reconexões repetidas.
- O sistema para de recriar sessão/QR sem ação manual.
- O status no painel fica mais fiel ao estado real: conectado quando a sessão ainda está utilizável, desconectado só quando confirmado.
- Disparos continuam pausando com segurança em queda real, mas não derrubam a conexão durante oscilações curtas.