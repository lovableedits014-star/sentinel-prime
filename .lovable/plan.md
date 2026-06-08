## Problema

Após qualquer evento transitório de `disconnected` vindo do webhook da ponte, os envios ficam bloqueados por até 90 segundos mesmo quando a ponte já confirma `connected` ao vivo. A UI também segue mostrando "Desconectada" porque lê só o status armazenado no banco, sem revalidar ao vivo, e o campo `last_disconnected_at` nunca é zerado em reconexões bem-sucedidas.

Sintoma do usuário: "mostra desconectada, não envia; eu vou na aba Status, ela aparece conectada, e aí envia."

## Correções

### 1. `supabase/functions/manage-whatsapp-instance/index.ts`

**a) `syncInstanceHealth` (linhas ~240-253):** quando a ponte confirma `connected`, limpar `last_disconnected_at = null` no update. Isso encerra a "janela de quarentena" assim que a sessão é validada como viva.

**b) Pré-envio (linhas ~1140-1167):** se `syncInstanceHealth` retornou `status === "connected"` (resposta ao vivo da ponte), confiar nela e **ignorar** o `recentlyDropped`. O `recentlyDropped` continua valendo apenas como salvaguarda quando a checagem ao vivo NÃO conseguiu confirmar "connected". Hoje ele invalida até confirmações ao vivo, que é a raiz do bug.

**c) Branch do `action === "instance_status"` (linhas ~1284-1300):** quando o status normaliza para `connected`, também limpar `last_disconnected_at = null`. Isso garante consistência quando o usuário aciona "Reconectar"/"Status" pela UI.

### 2. `src/components/settings/WhatsAppInstancePoolCard.tsx`

A UI atualmente exibe "Desconectada"/"Conectada" com base em `instance.status` carregado pelo pai, sem revalidar ao vivo. Isso amplifica o falso negativo.

- No botão **Reconectar** (já existente), antes de chamar `create_instance`, primeiro chamar `instance_status`; se a ponte responder `connected`/`open`, apenas chamar `onChange()` (refresh) e mostrar toast "Já estava conectado" sem disparar novo QR. Evita ações desnecessárias na ponte (anti-ban).
- Não vou adicionar polling automático: manter o padrão "ações humanas" que combinamos no patch anti-ban.

### 3. (Opcional, baixo risco) Webhook `whatsapp-inbound-webhook`

Não alterar — ele continua refletindo eventos da ponte imediatamente. A correção é no consumidor: tratar `disconnected` como hipótese, não verdade absoluta, e deixar a checagem ao vivo no momento do envio ter a palavra final.

## Verificação após implementação

1. Build passa (`bun run build`).
2. Re-deploy do edge function `manage-whatsapp-instance`.
3. Smoke test manual: simular um `disconnected` no DB (`update whatsapp_instances set status='disconnected', last_disconnected_at=now()`), tentar enviar — agora deve funcionar se a ponte estiver realmente conectada, e o registro deve voltar para `status='connected'` com `last_disconnected_at=null`.

## Resumo do impacto

- Envios deixam de ser bloqueados por janela "fantasma" de 90s após eventos transitórios.
- `last_disconnected_at` passa a representar a verdade ("última vez que ficou offline e ainda não voltou"), não "última vez que algum evento sugeriu queda".
- Nenhuma chamada extra à ponte; nenhum polling novo (mantém política anti-ban).