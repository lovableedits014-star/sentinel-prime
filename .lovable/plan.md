# WhatsApp multi-instância — estabilização anti-queda (P1+P2)

## Aplicado nesta rodada

### P1 (imediato — evita queima do número)
- **Cooldown de reconexão reativado** em `manage-whatsapp-instance` com exceção segura: sessão morta/nunca pareada libera 1ª tentativa sem esperar. Limite: 10min entre reconnects, 30min entre creates, máx 2 reconnects manuais/dia.
- **Polling de QR: 3s → 8s** em `WhatsAppInstanceCard` e `WhatsAppInstancePoolCard`.
- **Pausa entre re-invocações do dispatch: 5s → 30s** + contador `resume_count` (nova coluna); ao atingir 250 resumes, o disparo entra em `pausado_limite_resumos` para revisão manual.
- **`getSendFailure` mais tolerante**: 2xx sem sinal explícito de falha = enviado. Ausência de `messageId` não pune o chip.

### P2 (curto prazo — estabilidade do pool)
- **Fallback `anyActive`** em `send-whatsapp-dispatch` só usa instância `status='connected'`, sem suspeita de ban, ordenada por menor `consecutive_failures`. Nunca escolhe chip desconectado/connecting.
- **Cache de preflight: 20s → 5s** — reconfirma rápido se o chip cair.
- **`send-birthday-messages`** ganhou janela 8h–20h, preflight ao vivo antes de disparar e validação de sucesso alinhada com o dispatch.
- **`onboard-whatsapp-instance`** com cooldown de 10min entre reenvios (429 quando dentro do cooldown).

## Preservado (não tocado)
- Modal de QR inline no StatusWhatsApp
- Modos de disparo (Furtivo/Moderado/Agressivo) e delays entre mensagens
- Ramp-up, limites diários e auto-suspeita já implantados
- RPCs `pick_healthy_*`
- UI "Cota hoje" e botões de pausar/reativar

## Migration adicionada
- `whatsapp_dispatches.resume_count INTEGER NOT NULL DEFAULT 0`

## Como validar
1. Reconectar 2× seguidas no mesmo chip: segunda deve mostrar cooldown (exceto se a sessão estiver realmente morta).
2. Disparo pequeno (10-20 destinos): logs não devem marcar falha por resposta sem `messageId`.
3. Chip conectado deve permanecer estável sem oscilar status.
