
# Estabilização de instâncias WhatsApp — P1 + P2

Diagnóstico: a sessão caiu de verdade no celular (aparece só como "última sessão às 9:28"). Isso é típico de **reconexões/handshakes demais na mesma sessão** + **envios continuando para instância já morta**, o que faz a bridge/WhatsApp derrubar a sessão de vez. As auditorias apontaram os gatilhos exatos. Aplicaremos as correções **P1 (imediatas, risco de ban)** e **P2 (curto prazo)** — cirúrgico, sem tocar em nada que você pediu para preservar (modal de QR inline, cooldowns de envio dos modos Furtivo/Moderado/Agressivo, rotação/scoring, ramp-up já implantado).

## O que NÃO será tocado
- Modal de QR inline no Status
- Modos de disparo (Furtivo/Moderado/Agressivo) e delays entre mensagens
- Ramp-up e limites diários já implantados
- RPCs `pick_healthy_*` (foram revistas na fase anterior)
- UI de "Cota hoje" / botões de pausar/reativar

---

## P1 — Imediato (evita ban da sessão)

### P1-A · Reativar cooldown anti-ban de reconexão/criação
Arquivo: `supabase/functions/manage-whatsapp-instance/index.ts` (linhas 153-158)
- Restaurar a lógica real usando `CREATE_COOLDOWN_MS`, `RECONNECT_COOLDOWN_MS`, `MAX_RECONNECTS_PER_DAY` que já existem no arquivo e as colunas `last_reconnect_attempt_at`, `reconnect_attempts_today`, `reconnect_attempts_date`.
- **Exceção segura**: se a sessão está claramente morta (`status='disconnected'` + `last_disconnected_at` recente) ou nunca conectou (`status='connecting'` sem `phone_number`), permitir 1 reconexão sem esperar cooldown, para não travar o usuário quando o chip realmente caiu.
- UI já mostra `remainingMs` e `remainingAttempts` — nada a mudar no front.

### P1-B · Reduzir agressividade do polling de QR
Arquivos: `src/components/settings/WhatsAppInstanceCard.tsx` e `WhatsAppInstancePoolCard.tsx`
- `setInterval` de status durante scan de QR: **3s → 8s**.
- Parar o polling assim que `status='connected'` (já existe, apenas garantir cleanup imediato).
- Isso não é o modal do StatusWhatsApp (esse fica como está).

### P1-C · Aumentar pausa mínima entre re-invocações do dispatch
Arquivo: `supabase/functions/send-whatsapp-dispatch/index.ts` (linhas ~944-984)
- `paused_until` e `invokeResumeDispatch`: **5s → 30s**.
- Adicionar contador `resume_count` no payload já enviado (usar campo existente `resume_meta` ou adicionar `resume_count` no update de `whatsapp_dispatches`), e se atingir **250 resumes**, pausar como `pausado_limite_resumos` para intervenção manual.

### P1-D · Não punir instância quando bridge responde sucesso sem messageId
Arquivo: `supabase/functions/send-whatsapp-dispatch/index.ts` (`getSendFailure`, linhas 142-150)
- Se `res.ok && data.success !== false && data.delivered !== false`, tratar como **entrega válida** mesmo sem `messageId`. Sem `messageId`, marcar log com `delivery_confirmed=false` (informativo) mas **não incrementar `consecutive_failures`**. Isso remove um dos principais gatilhos do auto-suspect que adicionei na fase anterior.

---

## P2 — Curto prazo (estabilidade do pool)

### P2-A · Corrigir fallback "anyActive" que pega instância desconectada
Arquivo: `send-whatsapp-dispatch/index.ts` (linhas 1069-1088)
- Adicionar `.eq("status","connected")` no fallback e trocar `order("status", ascending: true)` por priorização explícita (`connected` primeiro).
- Se ainda assim nada, **pausar o dispatch** como `pausado_sem_instancia` em vez de usar chip morto.

### P2-B · Reduzir cache de preflight
Arquivo: `send-whatsapp-dispatch/index.ts` (linha ~1134)
- Cache de preflight: **20s → 5s**.
- Invalidar cache imediatamente quando um envio falha com erro de desconexão (já temos o hook de erro, só limpar entrada do Map).

### P2-C · `syncInstanceHealth` mais defensivo antes de marcar offline
Arquivo: `manage-whatsapp-instance/index.ts` (linhas ~302-322, `syncInstanceHealth`)
- Só marcar `status='disconnected'` no banco se **duas checagens consecutivas** (com 3s de intervalo, já existe uma) retornarem offline — hoje uma única resposta ruim já pode derrubar (com fallback para tolerar oscilação, mas ainda propenso).
- Sempre limpar `last_disconnected_at` e `consecutive_failures` quando `status='connected'` for confirmado ao vivo (já existe no caminho principal — replicar no caminho do webhook).

### P2-D · Webhook mais rigoroso ao aceitar `disconnected`
Arquivo: `supabase/functions/whatsapp-inbound-webhook/index.ts`
- Antes de aplicar um evento `disconnected`, fazer um recheck (`instance_status` na bridge) — se voltar `connected`, ignorar o evento como oscilação e logar em `action_logs`.
- Rejeitar payloads sem `instance_id` (já rejeita em parte, formalizar para eventos `connected`/`disconnected` também).

### P2-E · `send-birthday-messages` com preflight, janela e validação de entrega
Arquivo: `supabase/functions/send-birthday-messages/index.ts`
- Janela horária padrão **08:00–20:00** (config em `whatsapp_birthday_config` se já existir; se não, hardcode inicial).
- Antes de enviar, chamar preflight (reutilizar helper `preflightInstance` — extrair para módulo compartilhado ou duplicar de forma mínima).
- Aceitar como enviado só se resposta tiver `messageId`/`id`/`delivered:true` (mesma regra de `getSendFailure` já corrigida em P1-D).

### P2-F · Cooldown no `onboard-whatsapp-instance`
Arquivo: `supabase/functions/onboard-whatsapp-instance/index.ts`
- Se `onboarding_sent_at` < 10 min atrás, retornar 429 com mensagem "Aguarde X min".
- Se coluna `onboarding_sent_at` não existir em `whatsapp_instances`, adicionar via migration mínima (uma única coluna `timestamptz`).

---

## Ordem de execução

1. **P1-A → P1-B → P1-C → P1-D** (edge functions + 2 UI cards). Deploy imediato.
2. **P2-A → P2-B → P2-C → P2-D** (edge functions do dispatch e webhook).
3. **P2-E → P2-F** (funções auxiliares — birthday e onboard). Se `onboarding_sent_at` precisar de coluna nova, roda 1 migration só.

## Como vamos validar

- Conectar 1 chip novo e observar por 30 min no StatusWhatsApp: `consecutive_failures` deve permanecer 0 se não houver falha real; `status` não deve oscilar sem motivo real.
- Enviar disparo pequeno (10-20 destinos) e conferir logs: nenhuma marcação falsa de falha para respostas sem `messageId`.
- Tentar clicar em "Reconectar" duas vezes seguidas: segunda deve mostrar cooldown (a menos que a exceção segura se aplique).

## Detalhes técnicos (arquivos afetados)

- `supabase/functions/manage-whatsapp-instance/index.ts`
- `supabase/functions/send-whatsapp-dispatch/index.ts`
- `supabase/functions/whatsapp-inbound-webhook/index.ts`
- `supabase/functions/send-birthday-messages/index.ts`
- `supabase/functions/onboard-whatsapp-instance/index.ts`
- `src/components/settings/WhatsAppInstanceCard.tsx`
- `src/components/settings/WhatsAppInstancePoolCard.tsx`
- Possível migration (só se `onboarding_sent_at` faltar): 1 `ALTER TABLE whatsapp_instances ADD COLUMN onboarding_sent_at timestamptz`.
