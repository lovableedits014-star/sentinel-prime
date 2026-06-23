## Plano: tratar o status WhatsApp com mais segurança

O problema é que hoje a verificação aceita a resposta `connected/open` da ponte como suficiente. Mas, na prática, a ponte pode dizer “conectado” e só revelar que a sessão caiu quando tenta enviar. Vamos mudar o sistema para falhar de forma segura: se não conseguir comprovar que a instância está pronta, ela não deve aparecer como pronta para disparo.

### 1. Tornar a verificação de saúde mais rígida
- Atualizar a ação `dispatch_readiness` em `manage-whatsapp-instance` para não depender apenas de `instance_status`.
- Depois do status `connected/open`, executar uma checagem operacional leve na bridge, como `chats`, para validar que a sessão realmente responde como WhatsApp autenticado.
- Se `instance_status` disser conectado, mas a checagem operacional falhar com erro de sessão, marcar a instância como `disconnected` imediatamente.
- Se a ponte retornar resposta vazia, `connecting`, erro de rede ou status incerto, tratar como `not_ready`, não como conectado.

### 2. Bloquear disparo antes de criar/envoyer fila quando não houver instância realmente pronta
- No `Disparos`, manter a rechecagem antes de iniciar.
- Ajustar a resposta do servidor para explicar o motivo real: sessão operacional falhou, credencial ausente, falhas seguidas, health check antigo ou offline.
- O botão de envio continuará desabilitado quando não houver instância comprovadamente pronta.

### 3. Deixar o envio conservador durante o processamento
- Em `send-whatsapp-dispatch`, alterar o preflight: status `transient`, erro de status ou resposta vazia não deve seguir enviando.
- Para telefone individual: pausar o disparo como `pausado_sem_instancia` em vez de tentar enviar e gerar falha.
- Para grupos: tentar outra instância membro; se nenhuma passar na verificação rígida, marcar o item como falha com mensagem clara.
- Se uma tentativa de envio retornar erro de sessão, marcar a instância como desconectada imediatamente e remover ela da rotação.

### 4. Corrigir a seleção de instâncias saudáveis
- Ajustar as funções SQL de seleção (`pick_healthy_whatsapp_instance` e a seleção para grupos) para não escolher instâncias com health check antigo, falhas seguidas ou estado suspeito.
- Especialmente para grupos, aplicar a mesma regra de `last_health_check_at` que já existe no envio individual.

### 5. Melhorar a tela Status WhatsApp
- Quando clicar em “Verificar”, mostrar resultado honesto: “Conectado e operacional” ou “Status diz conectado, mas sessão não respondeu ao teste operacional”.
- Exibir badge/alerta para instância com status inconsistente.
- Atualizar a lista imediatamente depois da verificação para a tela de Disparos ficar sincronizada.

### 6. Sem reconexão automática agressiva
- Não adicionar auto-reconnect em massa.
- Reconexão continuará sendo ação manual, porque reconectar repetidamente pode aumentar risco de bloqueio/banimento do chip.

### Validação
- Testar o fluxo: verificar status → abrir Disparos → tentar enviar.
- Confirmar que uma instância falsa/instável não aparece mais como pronta.
- Confirmar que o disparo não começa quando a sessão não passou na verificação operacional.