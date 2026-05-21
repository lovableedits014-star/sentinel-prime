## Plano A — Parte 1 (revisado com contrato real da Ponte WhatsHub v2.12)

### O que mudou em relação à versão anterior

1. **Sem `sync_groups` próprio** — a action `groups` da Ponte já é a fonte da verdade. Removido passo de upsert via `manage-whatsapp-instance`.
2. **Sem nova action na edge `manage-whatsapp-instance`** — a edge `eleicao-check-grupo-membros` chama a Ponte direto.
3. **Quarto status novo:** `no_grupo_anonimo` — pessoas com `@lid` (privacidade WhatsApp 2024+) que aparecem no grupo mas sem telefone visível. Não tem como cruzar.
4. **Match simplificado:** `phone_e164` da Ponte já vem em dígitos puros (`5567999998888`). Compara direto com `eleicao_pessoas.telefone` (depois de aplicar `cleanPhoneForBridge` no cadastro).
5. **Throttle:** 500–800ms entre chamadas de grupo (motor já força 400ms; dobra no cliente pra não bater rate limit).
6. **Cron a cada 1–2h** (não 6h) — cache de 60s do motor protege contra spam.

### Por que funciona (confirmado)

- `POST /whatsapp-bridge` com `{ action: "groups" }` → lista todos os grupos da instância.
- `POST /whatsapp-bridge` com `{ action: "group_participants", group_jid }` → participantes com `phone_e164` já normalizado.
- Header `X-Api-Key: <chave da instância>` (mesma usada pra send hoje).

Limitação real assumida: **`@lid` mascara alguns membros**. Vamos contar quantos são e mostrar como "anônimos no grupo (N)" — sem workaround possível.

---

### Como vai ficar

#### 1. Banco — 2 tabelas + 1 coluna

```sql
-- 1.a Mapa região → group_jid
ALTER TABLE eleicao_notif_config
  ADD COLUMN grupos_jids jsonb NOT NULL DEFAULT '{}'::jsonb;
-- ex: { "norte": "120363xxx@g.us", "sul": "120363yyy@g.us" }

-- 1.b Snapshot dos participantes vistos
CREATE TABLE whatsapp_group_participants (
  id uuid PK,
  client_id uuid NOT NULL,
  instance_id uuid NOT NULL,
  group_jid text NOT NULL,
  phone_e164 text,                -- null quando é @lid
  raw_jid text NOT NULL,          -- 5567...@s.whatsapp.net OU 9876@lid
  is_lid_only boolean DEFAULT false,
  is_admin boolean DEFAULT false,
  first_seen_at timestamptz DEFAULT now(),
  last_seen_at  timestamptz DEFAULT now(),
  left_seen_at  timestamptz,
  UNIQUE (instance_id, group_jid, raw_jid)
);

-- 1.c Status por pessoa (cache pronto pra UI)
CREATE TABLE eleicao_pessoa_grupo_status (
  pessoa_id uuid PK REFERENCES eleicao_pessoas ON DELETE CASCADE,
  client_id uuid NOT NULL,
  group_jid text,
  status text NOT NULL,
  -- 'entrou' | 'pendente' | 'saiu' | 'sem_grupo' | 'sem_telefone'
  entrou_visto_em timestamptz,
  saiu_visto_em   timestamptz,
  verificado_em   timestamptz DEFAULT now()
);
```

RLS em ambas, escopadas por `client_id`.

#### 2. Edge — uma nova: `eleicao-check-grupo-membros`

Pseudo-código:

```ts
const cfg = await getNotifConfig(client_id);            // pega grupos_jids
const apiKey = await getInstanceApiKey(client_id);      // mesma já usada em send

for (const [regiao, group_jid] of Object.entries(cfg.grupos_jids)) {
  const r = await fetch(BRIDGE_URL, {
    method: "POST",
    headers: { "X-Api-Key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "group_participants", group_jid }),
  });
  const { participants = [] } = await r.json();

  // 1. upsert no whatsapp_group_participants (marca left_seen_at em quem sumiu)
  await upsertParticipants(group_jid, participants);

  // 2. throttle anti-rate-limit
  await sleep(600);
}

// Recalcula status por pessoa
for (const pessoa of pessoasDoCliente) {
  const regiao = resolveRegiao(pessoa);                 // parent_id chain
  const group_jid = cfg.grupos_jids[regiao];
  if (!group_jid)        => status='sem_grupo';
  else if (!pessoa.telefone) => status='sem_telefone';
  else {
    const hit = await findParticipant(group_jid, pessoa.telefone);
    status = hit ? 'entrou' : 'pendente';
    entrou_visto_em = hit?.first_seen_at;
  }
  upsertStatus(pessoa.id, { status, group_jid, ... });
}
```

#### 3. UI

**3.a `EleicaoConfigPanel.tsx`** — em cada linha de região, **ao lado do campo de link** adicionar um `<Select>` "Grupo do WhatsApp" populado via `{ action: "groups" }`. Salva o JID em `grupos_jids[regiao]`. O link continua sendo o convite enviado na mensagem; o JID é o que rastreamos.

**3.b `src/pages/Eleicao.tsx`** — novo card **"Entrada no grupo"**:

```
┌─ Entrada no grupo da região ────────────────────────────────┐
│ [Sincronizar agora]   Última sync: há 12min                 │
│                                                             │
│ Região    Cadastrados  No grupo  Pendentes  Anônimos  %    │
│ Norte         42          38         4         3       90% │
│ Sul           31          22         9         1       71% │
│ Centro        18          18         0         0      100% │
│                                                             │
│ ▾ Ver pendentes (13)                                       │
│   ┌────────────────────────────────────────────────────┐   │
│   │ João Silva · cabo · Sul · cadastrado há 5d         │   │
│   │ 67 99999-8888  [Reenviar convite] [Abrir chat]     │   │
│   └────────────────────────────────────────────────────┘   │
│                                                             │
│ ℹ 4 pessoas no grupo Sul aparecem anônimas (privacidade    │
│   WhatsApp). Podem ser cadastrados ou não — não dá pra     │
│   identificar.                                              │
└─────────────────────────────────────────────────────────────┘
```

Botão "Sincronizar agora" invoca a edge `eleicao-check-grupo-membros`.

#### 4. Cron
`pg_cron` chamando a edge a cada **1h** (ajustável). Como só lê participantes (sem enviar nada), é seguro.

---

### Fluxo end-to-end

1. Você configura no painel: região **Sul** → grupo `120363yyy@g.us` (via Select).
2. Cadastra **Maria** como cabo da Sul, telefone `67 9 9999-8888` → mensagem com link já vai (fluxo atual).
3. Maria entra no grupo.
4. Próxima sync (manual ou cron de 1h):
   - Ponte devolve `phone_e164: "5567999998888"` na lista do grupo Sul.
   - Edge cruza com `eleicao_pessoas.telefone` → marca `status='entrou'`.
5. No painel: Maria sai de "Pendentes" e o contador da Sul sobe.
6. Se em 48h ela não entrou: fica destacada em "Pendentes" com botão pra cobrar.

---

### Detalhes técnicos

- **`BRIDGE_URL`**: `https://vxqvrsaxppbgxookyimz.supabase.co/functions/v1/whatsapp-bridge`
- **Auth**: `X-Api-Key` da mesma instância usada em `sendTo()` hoje.
- **Throttle**: 600ms entre `group_participants`. Pra 20 grupos = ~12s por ciclo.
- **`@lid`**: contados em coluna separada `Anônimos`. Não viram "entrou" nem "pendente".
- **Pessoa sem telefone**: `status='sem_telefone'` — aparece em aviso, não em pendentes (não dá pra cobrar).
- **Pessoa sem região mapeada**: `status='sem_grupo'` — aviso pra você configurar o grupo daquela região.

### Pré-requisitos do lado WhatsHub (já OK)
- Ponte v2.12 com actions `groups` e `group_participants` ativas ✅
- Instância conectada e (idealmente) **admin** dos grupos rastreados — sem admin ainda funciona, mas alguns metadados podem faltar.

### Ordem de execução depois de aprovado
1. Migração (tabelas + coluna `grupos_jids`).
2. Edge `eleicao-check-grupo-membros`.
3. Select de grupo no `EleicaoConfigPanel`.
4. Card "Entrada no grupo" no `Eleicao.tsx`.
5. Cron (opcional, no fim).
