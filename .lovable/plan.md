# Corrigir parada em 15 envios e adicionar retomada robusta

## Diagnóstico

O disparo parou em 15 porque a única instância conectada bateu o **cap diário do estágio de aquecimento** (`ramp_up_stage`). Hoje, quando não há outra instância viva, o loop marca o disparo como `pausado_sem_instancia` e sai — e o botão "Retomar" só aparece se o disparo estiver `cancelado`.

Além disso, não existe controle por disparo de **quantas instâncias** você quer usar. O motor sempre tenta distribuir entre todas as saudáveis; com só uma conectada, ele respeita o cap dela e para.

## O que vai mudar

### 1. Configuração de instâncias por disparo (Disparos.tsx / wizard de criação)

No card de criação de disparo, adicionar um bloco "Instâncias":

- **Modo de distribuição** (radio):
  - `Automático` (padrão) — usa todas as instâncias conectadas saudáveis
  - `Fixo` — você escolhe quantas instâncias no máximo (1–N das conectadas)
- **Ignorar cap de aquecimento neste disparo** (checkbox, off por padrão, com aviso amarelo): "Envia até esgotar a fila mesmo se a instância estiver em fase 'novo/aquecendo'. Use só com instâncias maduras — pode acionar bloqueio da Meta."

Persistir em duas colunas novas em `whatsapp_dispatches`:
- `max_instances INT` (null = automático)
- `ignore_stage_cap BOOLEAN DEFAULT false`

### 2. Motor `send-whatsapp-dispatch` respeitando a config

- Ao selecionar instâncias saudáveis, aplicar `LIMIT max_instances` (ou usar todas se null).
- Em `effectiveCap()`, se `ignore_stage_cap` do dispatch atual for true, retornar `Infinity` (ou seja, cap ignorado — o `daily_send_limit` global da instância continua valendo como teto de segurança).
- Se sobrar apenas 1 instância viva e o cap dela já foi atingido **e** `ignore_stage_cap=false`, pausar como hoje (`pausado_sem_instancia`), mas registrar `pause_reason: "Cap diário atingido — retomar amanhã ou marcar 'ignorar cap'"` para dar contexto no card.

### 3. Botão "Retomar" universal

Trocar a condição atual (`status === "cancelado"`) por:

```
status ∈ {cancelado, pausado_timeout, pausado_janela, pausado_sem_instancia}
E (total_destinatarios - enviados - falhas) > 0
```

E ajustar `handleResumeDispatch`:
- Reativar itens com `status IN ('cancelado', 'pendente')` que ainda não foram enviados (hoje só pega `cancelado`).
- Se o disparo estava `pausado_sem_instancia` por cap, o resume só faz sentido se: (a) uma nova instância ficou saudável, **ou** (b) hoje é outro dia (contador zerou), **ou** (c) o usuário marcar "ignorar cap" ao retomar. Adicionar checkbox "Ignorar cap de aquecimento" no modal de retomar, que atualiza `ignore_stage_cap=true` no dispatch antes de invocar.
- Toast de erro claro quando não houver instância viva: "Nenhuma instância conectada. Conecte um chip em Status WhatsApp antes de retomar."

### 4. UX — mostrar por que parou

No card do histórico (`dispatches.map`), quando `status` começar com `pausado_`, exibir uma linha em amarelo com `pause_reason`. Já existe a coluna, só não está sendo mostrada.

## Detalhes técnicos

- Migration: adicionar `max_instances` e `ignore_stage_cap` em `whatsapp_dispatches` (nullable / default false). Sem RLS nova — herdam as políticas existentes.
- Arquivos:
  - `src/pages/Disparos.tsx` — bloco de config no wizard, insert do dispatch com os 2 campos novos, condição de resume ampliada, exibir `pause_reason`.
  - `supabase/functions/send-whatsapp-dispatch/index.ts` — ler `max_instances`/`ignore_stage_cap` do dispatch atual em memória, aplicar em `effectiveCap()` e na query de seleção de instâncias.
- Sem mudança no schema de itens; o motor continua puxando o próximo `pendente`.

## Fora do escopo

- Auto-promover ramp_up_stage após X envios sem falha (mecânica separada, não pedida).
- Rebalancear disparos entre instâncias em tempo real além do que já existe.

---

Confirma que posso implementar assim, ou quer ajustar o comportamento do "ignorar cap" (por exemplo, exigir confirmação em dois cliques)?
