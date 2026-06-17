## Diagnóstico

O problema não parece ser só “falso desconectado” na tela. A instância também está perdendo sessão durante o disparo porque o sistema está chamando `instance_status` e `reconnect` repetidamente enquanto envia.

Hoje, quando a ponte retorna `connecting` ou resposta vazia, o código tenta reconectar imediatamente. Fazer isso várias vezes durante um disparo pode reiniciar/forçar handshake da sessão e acabar derrubando a instância de verdade, mesmo que no celular pareça conectada por alguns instantes.

Também há outro ponto perigoso: o webhook marca a instância como `disconnected` imediatamente ao receber evento de desconexão, sem confirmar se foi uma queda real ou uma oscilação curta.

## Plano de correção

### 1. Parar de reconectar automaticamente durante envio

Em `supabase/functions/send-whatsapp-dispatch/index.ts`:

- O preflight do disparo vai consultar o status, mas não deve chamar `reconnect` automaticamente a cada destinatário.
- Status `connecting`, vazio, `unknown` ou erro temporário será tratado como `transient`, não como desconectado.
- Com `transient`, o envio continua normalmente; só se o envio real retornar erro explícito de instância offline é que o sistema marca como desconectada.
- Isso evita que o próprio disparador fique derrubando a sessão com reconexões repetidas.

### 2. Só marcar `disconnected` quando for queda confirmada

Ainda em `send-whatsapp-dispatch`:

- Não atualizar `whatsapp_instances.status = disconnected` apenas porque `instance_status` retornou `connecting` ou vazio.
- Marcar como `disconnected` somente quando a resposta for claramente terminal: `disconnected`, `offline`, `closed`, `logged_out`, `logout`, `banned`, ou quando o envio retornar erro explícito de instância desconectada.

### 3. Melhorar cache do preflight

- Cachear status por alguns segundos por instância durante o disparo.
- Evitar consultar a ponte antes de cada mensagem quando a mesma instância acabou de ser verificada.
- Isso reduz chamadas na bridge e diminui chance de instabilidade depois de 7, 10, 20 envios.

### 4. Proteger o webhook contra eventos falsos/curtos de desconexão

Em `supabase/functions/whatsapp-inbound-webhook/index.ts`:

- Quando chegar evento `disconnected`, não marcar offline de imediato.
- Primeiro consultar `instance_status` na ponte, com pequena espera/rechecagem.
- Se continuar realmente offline, aí sim marcar `disconnected`.
- Se voltar `connected/open/connecting`, registrar apenas health check e manter a instância ativa.

### 5. Ajustar funções auxiliares que também mexem na sessão

Em funções de envio auxiliar, como `supabase/functions/eleicao-send-credentials/index.ts`:

- Aplicar a mesma regra: não chamar `reconnect` automaticamente em status transitório durante envio.
- Não transformar `connecting` em `disconnected`.

### 6. Retomar fila sem travar no 7

- Se o disparo já estiver `pausado_sem_instancia`, quando uma instância voltar para `connected`, o sistema deve retomar automaticamente.
- Confirmar que o fluxo de resume já inclui `pausado_sem_instancia`; se necessário, ajustar para reativar esses disparos.

## Resultado esperado

- O disparo não deve mais parar no 7 por oscilação de status.
- A instância não deve mais ser forçada a reconectar várias vezes durante o envio.
- O banco não deve marcar `disconnected` enquanto a ponte estiver apenas em `connecting`.
- Quedas reais continuam sendo detectadas e pausam o disparo com segurança.

## Validação

1. Fazer um disparo de teste com mais de 20 destinatários.
2. Verificar nos logs que não há sequência repetida de `Tentando reconectar...` durante o disparo.
3. Confirmar que `whatsapp_instances.status` permanece `connected` ou no máximo `connecting/transient`, sem virar `disconnected` por resposta vazia.
4. Confirmar que a fila continua enviando após o 7º contato.
5. Se a instância cair de verdade, confirmar que o disparo pausa e retoma quando reconectar.