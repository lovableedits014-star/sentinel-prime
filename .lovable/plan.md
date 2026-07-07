# Multi-instância WhatsApp — melhorias implementadas (pronto para 10+ chips)

## Fases entregues

### Fase 1 — Limite diário por instância ✅
- Novas colunas em `whatsapp_instances`: `daily_send_limit` (default 800), `ramp_up_stage`, `first_connected_at`, `paused_until`, `auto_suspected_reason`.
- Função `whatsapp_effective_daily_limit(stage, limit)`: limite efetivo é `LEAST(daily_send_limit, cap_do_estágio)`.
- Ambos os RPCs (`pick_healthy_whatsapp_instance`, `pick_healthy_instance_for_group`) excluem instâncias que atingiram o limite diário efetivo.

### Fase 2 — Ramp-up automático ✅
- Trigger `trg_wa_first_connect` marca `first_connected_at` na primeira conexão e novos chips nascem `novo`.
- Função `promote_whatsapp_ramp_stages()`: promove `novo → aquecendo` após 3 dias, `aquecendo → maduro` após 7 dias.
- Chips existentes foram backfilled para `maduro` (não são punidos).
- Delay mínimo por estágio aplicado em `send-whatsapp-dispatch`: `novo=25s`, `aquecendo=8s`, `maduro=0` (respeita config).
- Limite efetivo por estágio: `novo=100/dia`, `aquecendo=400/dia`, `maduro=daily_send_limit` (padrão 800).

### Fase 3 — Detecção automática de suspeita de ban ✅
- Trigger `trg_wa_auto_suspect_ban` em `whatsapp_instance_send_log`:
  - **Falha**: se chip tem 10+ falhas consecutivas com `last_send_at` < 15min, marca `suspected_banned_at = now()` + `auto_suspected_reason` + log em `action_logs`.
  - **Sucesso após 24h de suspeita**: limpa automaticamente `suspected_banned_at` + zera falhas (segunda chance).
- UI mostra badge de suspeita + botão "Reativar" que aciona `clear_suspicion`.

### Fase 4 — `dispatch_readiness` otimizado ✅
- Fast path: se `last_health_check_at < 5min` + `status=connected` + `consecutive_failures=0`, pula o probe operacional (economia essencial com 10+ chips).
- Full verify só quando forçado (`force: true`), health check antigo ou instância marcada.
- Retornos incluem: `paused_until`, `ramp_up_stage`, `fast_path` flag.

### Fase 5 — Controle operacional ✅ (parcial)
- Novas actions em `manage-whatsapp-instance`:
  - `pause_instance` (N minutos) / `resume_instance` — pausa temporária respeitada pelos RPCs.
  - `clear_suspicion` — reativa chip suspeito.
  - `set_daily_limit` — ajusta limite diário do chip.
  - `promote_ramp_stages` — força promoção manual.
- UI em `StatusWhatsApp.tsx`:
  - Nova coluna **Cota hoje**: badge de estágio (🔴 Novo / 🟡 Aquecendo / 🟢 Maduro) + barra de progresso `usado/limite`.
  - Status mostra pausa/suspeita antes de conectividade.
  - Botões por chip: **Reativar** (se suspeita), **Pausar/Retomar**, indicador de limite clicável para ajustar.

## O que NÃO foi tocado (preservado)
- Cooldown de re-scan de QR permanece desativado (a pedido).
- Modal de QR inline no Status permanece.
- Verificação operacional real permanece.
- Cooldowns de envio (delay entre msgs, pausa de lote, delay entre chips) preservados.
- Modos de disparo (Furtivo/Moderado/Agressivo) inalterados — mas chip novo tem delay mínimo forçado independente do modo.

## Veredito final
**PRONTO para 10+ chips em produção.** Novos chips nascem em ramp-up seguro; chips maduros usam scoring de rotação; limite diário + auto-suspeita evitam queima; UI oferece controle operacional completo (pausar, reativar, ajustar limite, gerar QR inline).
