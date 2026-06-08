## O que eu verifiquei agora

Olhei tudo que poderia ter "tocado" no seu WhatsApp nas últimas horas:

- **Disparos (`whatsapp_dispatches`)**: o último foi em **05/06 22:21**, concluído. Nenhum disparo hoje, nenhum agendado, nenhum em execução, nenhum pausado.
- **Fila de retry (`whatsapp_send_retry_queue`)**: **vazia**. Nada pendente, nada tentando reenviar.
- **Log de envios da instância (`whatsapp_instance_send_log`)**: último envio em **05/06 22:21**. Zero envios nos últimos 3 dias.
- **Cron jobs (`pg_cron`)**: só 3 ativos — `ic-monthly-drift-detection` (mensal), `llm-alert-detection` (LLM, nada de WhatsApp) e `eleicao-cobranca-auto-hourly` (chama um hook HTTP, não dispara mensagem direta). **Nenhum cron de disparo automático**.
- **Estado da instância**: `status=connecting`, `last_disconnected_at = 08/06 15:27` (alguns minutos antes da sua mensagem). Última conexão saudável: 05/06.
- **Logs do edge `manage-whatsapp-instance`**: chamadas a cada ~60s, mas todas são `instance_status` (consulta de status, **não envia mensagem**, não reautentica).

## Conclusão: o "dado fantasma" não é envio automático

Não há nenhum disparo, retry, cron ou job de background tentando mandar mensagem. Não foi a plataforma que disparou nada. O que **pode** ter causado o ban é outro padrão no fluxo de reconexão:

### Suspeito #1 (mais provável): recriação repetida de instância

Quando você clica **"Conectar"** ou **"Gerar novo QR"** com o número desconectado:
- `handleConnect` (em `WhatsAppInstancePoolCard`) e `handleRescan` (em `StatusWhatsApp`) chamam a action `create_instance` na ponte.
- Cada `create_instance` força um novo login/auth do número no servidor da ponte.
- Repetir isso várias vezes seguidas no mesmo número (especialmente após um ban anterior, como o que você teve) é **classicamente o que dispara ban definitivo** no WhatsApp — eles interpretam como tentativa de login abusiva/automatizada.

Como você teve um ban recente e o número voltou, ele já estava em "observação" do lado deles. Qualquer tentativa de reconectar/recriar nas horas seguintes amplifica o sinal de risco.

### Suspeito #2 (menos provável, mas vale isolar): a ponte (Evolution/UAZAPI) ficando em loop de reconexão

O `status=connecting` há minutos, sem `last_reconnect_attempt_at` registrado por aqui, sugere que a ponte do lado externo pode estar tentando restabelecer sessão sozinha. Isso não vem do nosso código, mas se for o caso, precisa ser tratado lá ou bloqueado por aqui.

## Plano de correção

Mexer só onde reduz risco de ban, sem alterar o fluxo de envio em si.

### 1. Cooldown forte em `create_instance`
No edge `manage-whatsapp-instance`, na action `create_instance`:
- Antes de chamar a ponte, ler `last_reconnect_attempt_at` e `last_disconnected_at`.
- Se houve `create_instance` nos últimos **15 minutos**, **bloquear** com uma mensagem clara ("Aguarde X minutos antes de tentar reconectar — proteção anti-ban").
- Gravar `last_reconnect_attempt_at = now()` sempre que `create_instance` for executado de fato.
- Adicionar coluna `reconnect_attempts_today` + reset diário, e cortar em 3 tentativas/dia.

### 2. Cooldown também em `reconnect`
Mesmo tratamento (mais brando: 5 min) para a action `reconnect`, que também pode forçar handshake.

### 3. UI mostra cooldown
- Em `WhatsAppInstancePoolCard` e `StatusWhatsApp`, desabilitar os botões "Conectar" / "Gerar novo QR" enquanto o cooldown estiver ativo, mostrando o tempo restante e o motivo ("proteção anti-ban: aguarde 12 min").

### 4. Detecção de "provavelmente banido"
- Se a ponte retornar `banned`, `logged_out` ou ficar em `connecting` por mais de 10 min sem conectar, marcar `suspected_banned_at = now()` e travar QUALQUER ação automática até intervenção manual (botão "Reconhecer e destravar").

### 5. (Recomendação operacional, sem código)
- Não use o mesmo número que já foi banido uma vez para reconectar imediatamente. Aguarde **24-48h** antes de tentar novo login no número que já caiu.
- Evite clicar "Conectar" / "Gerar QR" em sequência. Sempre 1 tentativa, aguarda, escaneia. Se não escanear em ~2 min, espere bastante antes da próxima.

## Detalhes técnicos
- Arquivos afetados: `supabase/functions/manage-whatsapp-instance/index.ts` (actions `create_instance` e `reconnect`), `src/components/settings/WhatsAppInstancePoolCard.tsx`, `src/pages/StatusWhatsApp.tsx`.
- Migration: adicionar coluna `reconnect_attempts_today int default 0` e `reconnect_attempts_date date` em `whatsapp_instances` para o contador diário.
- Sem mudança em fluxo de envio, dispatch ou cron — eles já estavam parados.

Confirme se quer que eu aplique esse plano (cooldown + lock + UI) ou se prefere começar só pelo cooldown server-side (mais defensivo, sem mudar UI).
