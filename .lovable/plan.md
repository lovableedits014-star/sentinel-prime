
# Plano (v2): Resiliência de Grupos + Onboarding Automático de Nova Instância

> Mantém integralmente as 6 frentes da versão anterior. Adiciona a **Frente 7**: assim que uma nova instância conecta, ela recebe automaticamente uma mensagem com **todos os links de grupo** que precisa entrar, por região, com checklist de progresso.

---

## Recap das 6 frentes anteriores (sem alteração)

1. Sincronizar grupos de todas as instâncias (não só principal).
2. Badge de redundância por grupo + KPI "% de grupos com backup".
3. Nova RPC `pick_healthy_instance_for_group` — dispatch escolhe instância membro do grupo.
4. Failover automático mid-dispatch entre instâncias membro.
5. Detecção de "linha provavelmente banida" + alerta.
6. Anti-ban preventivo reforçado (rotação obrigatória entre instâncias, teto diário, aviso para política agressiva em grupos).

---

## Frente 7 — Onboarding automático de nova instância

### Conceito
Quando uma nova instância termina de conectar (status passa para `connected`), o sistema dispara automaticamente **para o próprio número da instância** uma mensagem de boas-vindas contendo a lista de links de convite dos grupos de região que ela ainda **não** é membro, agrupados por região, com 1 clique para entrar em cada.

O usuário (você) abre o WhatsApp daquele chip e tem uma checklist clicável. Conforme entra nos grupos, a próxima sincronização atualiza a cobertura automaticamente.

### Fluxo
```text
┌──────────────────────┐
│ Usuário escaneia QR  │
│ da nova instância    │
└──────────┬───────────┘
           │ status: connecting → connected
           ▼
┌──────────────────────────────────────┐
│ Trigger no whatsapp_instances        │
│ (AFTER UPDATE status='connected')    │
│ + ainda não enviou onboarding        │
└──────────┬───────────────────────────┘
           │ enqueue
           ▼
┌──────────────────────────────────────┐
│ Edge function: onboard-whatsapp-     │
│ instance                             │
│  1. Lista regiões com link de grupo  │
│  2. Filtra grupos onde esta instância│
│     ainda NÃO é membro               │
│  3. Monta mensagem formatada         │
│  4. Envia para o próprio número      │
│     usando a própria instância       │
│  5. Marca onboarding_sent_at         │
└──────────┬───────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│ Você abre WhatsApp do chip novo,     │
│ clica em cada link, entra nos grupos │
│                                      │
│ Sincronização agendada (Frente 1)    │
│ detecta entrada, atualiza badge      │
│ de redundância (Frente 2)            │
└──────────────────────────────────────┘
```

### Mensagem (template)

> 👋 **Olá! Sou seu painel de campanha.**
>
> Esta linha (`+55 11 9XXXX-XXXX`) acaba de ser conectada como instância **backup** para os disparos.
>
> Para começar a funcionar como rede de segurança da linha principal, **entre nos grupos abaixo** clicando em cada link. Depois disso, é só me deixar trabalhar — não precisa fazer mais nada.
>
> **Grupos pendentes (12):**
>
> 📍 **Centro**
> → https://chat.whatsapp.com/abc123
>
> 📍 **Zona Norte**
> → https://chat.whatsapp.com/def456
>
> 📍 **Zona Sul**
> → https://chat.whatsapp.com/ghi789
>
> _(... lista completa por região, só os que faltam ...)_
>
> ✅ Já está nos grupos: 3 de 15
> ⏳ Faltam: 12 grupos
>
> 💡 **Dica:** depois de entrar em todos, peça ao admin de cada grupo para te promover a admin — assim, se a linha principal cair, você continua mandando mensagem normalmente.
>
> _Você pode reabrir esta lista a qualquer momento em: Central WhatsApp → Status WhatsApp → "Reenviar onboarding"._

### Onde os links de grupo vivem hoje
Já existem em Eleição (`EleicaoConfigPanel.tsx` linha 283 — campo `placeholder="https://chat.whatsapp.com/..."`) num jsonb tipo `{regiao_value: link}`. Vamos **reutilizar essa mesma fonte** — sem duplicar dados.

A nova função busca `eleicao_configs.links_grupo_regiao` (ou nome equivalente — vou confirmar na implementação) e cruza com `whatsapp_groups` (instance_id, group_jid) para descobrir os pendentes:

```sql
-- Pseudocódigo da query
SELECT regiao.value, regiao.label, links->>regiao.value AS link
FROM eleicao_regioes regiao
WHERE links->>regiao.value IS NOT NULL  -- só regiões com link cadastrado
  AND NOT EXISTS (
    SELECT 1 FROM whatsapp_groups wg
    WHERE wg.instance_id = :new_instance_id
      AND wg.client_id = :client_id
      -- match por nome do grupo OU por jid do grupo da principal
  )
ORDER BY regiao.ordem;
```

### Alterações de banco (1 migration)

```sql
ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS onboarding_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_last_pending_count INTEGER;

-- Trigger: ao conectar pela primeira vez, agendar onboarding
CREATE OR REPLACE FUNCTION public.queue_instance_onboarding()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'connected'
     AND (OLD.status IS DISTINCT FROM 'connected')
     AND NEW.onboarding_sent_at IS NULL
     AND NEW.is_primary IS NOT TRUE THEN
    PERFORM pg_notify('whatsapp_instance_connected', NEW.id::text);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_queue_instance_onboarding
  AFTER UPDATE ON public.whatsapp_instances
  FOR EACH ROW EXECUTE FUNCTION public.queue_instance_onboarding();
```

(Em vez de `pg_notify` podemos usar uma flag `pending_onboarding=true` lida por um job de 1 min — mais simples e robusto. Decido na implementação.)

### Edge function nova: `onboard-whatsapp-instance`

- Input: `{ instance_id }`
- Pega `client_id`, `phone_number`, `bridge_url`, `bridge_api_key` da instância.
- Busca `links_grupo_regiao` do client.
- Busca `whatsapp_groups` da instância para saber em quais já está.
- Monta mensagem (template acima).
- Chama bridge para mandar mensagem **da própria instância para o próprio número** (`phone_number@s.whatsapp.net`).
- Atualiza `onboarding_sent_at = now()`, `onboarding_last_pending_count = N`.
- Loga em `dispatch_logs` para rastreabilidade.

### Reenvio manual (botão)
Em `StatusWhatsApp.tsx`, para cada instância (não-principal):
- Card mostra: "Onboarding enviado em DD/MM/YY · 8 grupos pendentes na última checagem".
- Botão **"Reenviar lista de grupos pendentes"** → chama a edge function de novo; recalcula pendentes em tempo real.
- Botão **"Ver lista agora"** → modal com a mesma lista renderizada, sem precisar mandar mensagem.

### Onde plugar no painel
Em `StatusWhatsApp.tsx`:
- Nova seção **"Onboarding de instâncias"** mostrando para cada instância backup: cobertura (X/Y grupos), botão de reenvio, último envio.
- Em `Disparos.tsx` aba grupos: o badge de redundância (Frente 2) ganha link "Entrar em N grupos faltantes" que abre a mesma lista.

---

## Edge cases e proteções

1. **Anti-loop:** só envia se `onboarding_sent_at IS NULL` ou se o botão de reenvio for clicado explicitamente. Nunca dispara automaticamente 2x.
2. **Instância principal:** nunca recebe onboarding (filtro `is_primary = false`).
3. **Sem links cadastrados:** se `links_grupo_regiao` está vazio, manda mensagem alternativa: "Nenhum link de grupo cadastrado ainda. Cadastre em Eleição → Configurações → Links de Grupo, e clique em Reenviar."
4. **Já é membro de tudo:** manda mensagem curta de parabéns: "✅ Esta linha já está em todos os grupos. Está pronta para o failover."
5. **Bridge offline na hora de mandar:** marca `onboarding_sent_at = NULL` e tenta de novo no próximo ciclo (job 1min).
6. **Link inválido / expirado:** o WhatsApp mostra erro ao clicar — não tem como detectar antes. Adicionar nota no painel de Eleição: "Renove os links a cada 90 dias para evitar expiração."
7. **Detecção de entrada nos grupos:** a sincronização automática (que já existe, hoje só na principal — Frente 1 estende para todas) detecta a nova membership. Sugiro agendar sync da nova instância **15 min depois do onboarding** e depois **a cada 6h** nas primeiras 48h, depois cai no ritmo normal.

---

## Arquivos afetados (somatório com plano anterior)

**Banco (2 migrations totais — já contando a v1):**
- v1: RPC `pick_healthy_instance_for_group`, (opcional) coluna `suspected_banned_at`.
- **v2 (nova):** colunas `onboarding_sent_at`, `onboarding_last_pending_count`, trigger `queue_instance_onboarding`.

**Edge functions:**
- `send-whatsapp-dispatch` (v1).
- **Nova: `onboard-whatsapp-instance`** (v2).
- Job periódico (existente `data-sources-health` ou novo) processa fila de onboarding e detecção de ban.

**Frontend:**
- `Disparos.tsx` aba grupos (v1) + link "Entrar em N grupos faltantes" (v2).
- `StatusWhatsApp.tsx` (v1 alerta de ban) + **nova seção "Onboarding de instâncias"** (v2).
- `useWhatsAppGroups.ts` agrega cobertura por instância.

---

## Garantias (mantidas)
- Nada altera dados em Eleição. Apenas **lê** `links_grupo_regiao` e `eleicao_regioes`.
- Onboarding nunca dispara para a instância principal.
- Toda mensagem de onboarding é logada em `dispatch_logs`.
- Reenvio é opt-in (botão), nunca automático após o primeiro envio.

---

## Pergunta antes de implementar

Confirma se o fluxo te serve assim:
- **Mensagem enviada da nova instância para ela mesma** (você abre o WhatsApp do chip novo e vê na sua própria conversa "Mensagens para mim") — é o padrão mais limpo e não usa outro número.
- **Alternativa:** enviar da instância **principal** para o número da nova instância. Vantagem: chega como conversa nova destacada. Desvantagem: gasta cota de envio da principal e parece "mensagem de outra pessoa".

Eu recomendo a primeira (auto-mensagem) — mais limpo, sem custo na principal, e o WhatsApp permite normalmente. Topa?

E sobre a coluna `suspected_banned_at` da v1, prefere criar coluna nova ou reusar `last_disconnected_at + consecutive_failures`?
