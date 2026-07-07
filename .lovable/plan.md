
# Diagnóstico rápido

O sistema **já suporta 10+ instâncias em rotação** — o núcleo (scoring por descanso + taxa de sucesso, failover de grupo com 5 tentativas, fila serializada por cliente, preflight ao vivo antes de cada envio, double-check antes de marcar offline) está sólido.

Porém existem **5 lacunas concretas** que precisam ser fechadas antes de você escalar para 10+ chips em produção de alto volume. Sem elas, o risco não é o sistema quebrar — é você **queimar chips**.

## Lacunas identificadas

| # | Lacuna | Impacto | Prioridade |
|---|---|---|---|
| 1 | `messages_sent_today` é contado mas **nunca verificado** como limite. Um chip pode passar de 1000+ msgs/dia sem sair do pool. | 🔴 Ban silencioso | Alta |
| 2 | Sem **ramp-up** para chip novo: entra no pool no mesmo minuto que conecta, elegível pra modo Agressivo. | 🔴 Ban de chip novo | Alta |
| 3 | `suspected_banned_at` **só é setado manualmente**. Se o WhatsApp derrubar silenciosamente (envios "somem"), sistema continua usando. | 🟡 Perda de mensagens | Alta |
| 4 | `dispatch_readiness` faz 3 fetches por instância (verify completo) — com 10 chips vira 20-30 requests + timeouts de 8s. Pode travar UI. | 🟡 UX lenta em escala | Média |
| 5 | Campo `whatsapp_rotation_strategy` existe no schema mas **é ignorado**. Não há como forçar round-robin, priorizar por região, ou pausar chip específico. | 🟢 Falta de controle fino | Média |

---

# Plano de correção

## Fase 1 — Limite diário por instância (crítico)

**Backend (migration):**
- Adicionar coluna `whatsapp_instances.daily_send_limit INTEGER DEFAULT 800` (WhatsApp Business tolera ~1000/dia em número aquecido; 800 dá margem).
- Adicionar coluna `whatsapp_instances.ramp_up_stage TEXT DEFAULT 'novo'` com valores `novo | aquecendo | maduro`.
- Trigger que promove `novo → aquecendo` após 3 dias com `connected_since` estável, e `aquecendo → maduro` após 7 dias.

**Atualizar os 2 RPCs de seleção** (`pick_healthy_whatsapp_instance` e `pick_healthy_instance_for_group`) para excluir instâncias que já bateram o limite diário:
```sql
AND (
  messages_sent_today_date IS NULL 
  OR messages_sent_today_date < CURRENT_DATE 
  OR messages_sent_today < daily_send_limit
)
```

**UI:** exibir em `StatusWhatsApp.tsx` uma barra de progresso `envios hoje / limite diário` por instância, verde/amarelo/vermelho.

## Fase 2 — Ramp-up automático (crítico)

**Backend (`send-whatsapp-dispatch/index.ts`):**
- Limite diário efetivo por estágio: `novo=100`, `aquecendo=400`, `maduro=daily_send_limit`.
- Bloquear modos "Moderado" e "Agressivo" para instâncias `novo` / `aquecendo` — se todas as elegíveis estiverem em ramp-up, forçar modo `Furtivo` no batch para essa instância (delay 25-90s, lote 5).
- Aplicar limite por-instância diário ANTES de escolher próxima instância no loop.

**UI (`Disparos.tsx`):**
- Badge visível no card de cada chip: 🟢 Maduro / 🟡 Aquecendo (X/400) / 🔴 Novo (X/100).
- Avisar ao operador quando a estratégia agressiva for rebaixada por causa de ramp-up.

## Fase 3 — Detecção automática de suspeita de ban

**Migration — trigger em `whatsapp_instance_send_log`:**
Após inserir falha, se a instância acumular `consecutive_failures >= 10` E `last_send_at` for recente (< 15min), setar `suspected_banned_at = now()` automaticamente e emitir `action_log` `whatsapp_auto_suspected_ban`.

**Segundo trigger** — reset: quando um envio for sucesso, se `suspected_banned_at IS NOT NULL` e passou > 24h desde a marcação, limpar (dá segunda chance).

**UI:** botão "Reativar chip" que limpa `suspected_banned_at` + zera `consecutive_failures`, com confirmação.

## Fase 4 — `dispatch_readiness` otimizado

**`manage-whatsapp-instance/index.ts`:**
- Fast path: se `last_health_check_at < 5 min` E `status = 'connected'` E `consecutive_failures = 0`, pular o `verifyWhatsAppOperationalSession` completo e retornar `ready: true` direto.
- Full verify só quando: forçado (`force: true`), health check antigo, ou instância marcada `not_ready`.
- Reduzir timeout de preflight de 8s → 5s.
- Circuit breaker: se `bridge_url` X falhar 3 vezes em 1min, marcar todas as instâncias daquela bridge como `not_ready` e não retentar por 1min.

## Fase 5 — Controle operacional (nice-to-have, mas útil pra 10+ chips)

**UI dedicada — nova aba "Pool de Instâncias"** dentro de `/whatsapp`:
- Tabela com todas as instâncias mostrando: apelido, telefone, estágio (novo/aquecendo/maduro), envios hoje / limite, taxa sucesso 24h, uptime, última falha, ações (pausar / retomar / reativar / limpar contador).
- Toggle "Pausar temporariamente" (nova coluna `paused_until TIMESTAMPTZ`) — RPC também exclui pausadas.
- Redistribuição de carga: gráfico simples de envios/hora por chip nas últimas 24h pra você identificar chip sub-utilizado.

**Uso de `whatsapp_rotation_strategy`:**
- Adicionar 3 estratégias reais: `balanced` (atual, scoring), `round_robin` (menor `messages_sent_today` sempre vence), `stealth` (força furtivo em todos).
- Selector no Disparos.tsx.

---

# Detalhes técnicos

**Ordem de execução recomendada:** Fase 1 → 3 → 2 → 4 → 5.
Motivo: limite diário + auto-suspeita são "airbags" que protegem contra os piores cenários; ramp-up é regra de negócio; otimização de readiness é UX; controle operacional é polish.

**Migrations envolvidas:** 3 arquivos (colunas + trigger de ramp-up, trigger de auto-suspeita, RPC atualizado). Já cobri em `<user-roles>`/RLS — não afeta políticas existentes.

**Edge functions afetadas:** `send-whatsapp-dispatch` (ramp-up + limite), `manage-whatsapp-instance` (fast path readiness + pause action).

**Frontend afetado:** `StatusWhatsApp.tsx` (badges de estágio + limite), `Disparos.tsx` (aviso de rebaixamento), novo componente `InstancePoolTable.tsx` (Fase 5).

**Nada será revertido** dos ajustes recentes (cooldown de QR desativado, modal inline de re-scan, verificação operacional real). Estas melhorias somam por cima.

**Compatibilidade:** todas as instâncias existentes ganham `daily_send_limit=800` e `ramp_up_stage='maduro'` (assumindo chips já em uso — não vamos punir seu chip atual). Novas conexões nascem em `novo`.

## Pergunta antes de eu implementar tudo

Prefere que eu:
- **(A)** Rode Fases 1+2+3 agora (o essencial de segurança) e deixe 4+5 pra próxima rodada; ou
- **(B)** Vá até o fim (as 5 fases) nesta implementação?

Marcar aprovação de qualquer forma implementa o plano — se não responder, faço **(B) completo**.
