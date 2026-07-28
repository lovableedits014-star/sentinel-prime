
## Objetivo

Refinar 3 pontos do fluxo público de Missões:

1. **Login único por cliente** — a pessoa se identifica UMA vez e vale para todas as missões daquele candidato (hoje precisa se cadastrar de novo a cada missão).
2. **Dashboard separado** — mover o relatório para uma aba independente ("Relatórios de Missões") em Central WhatsApp, que sobrevive à exclusão/troca da missão.
3. **Atribuição de grupo confiável** — garantir que o grupo do WhatsApp de onde a pessoa veio seja sempre identificado no relatório.

---

## 1. Login único por cliente (não por missão)

### Frontend (`src/pages/MissaoPublica.tsx`)
- Trocar a chave do localStorage de `sm_missao_token_<missionId>` para `sm_client_token_<clientId>`.
- Buscar `clientId` no primeiro `GET /config` (já retornado no payload).
- Ao carregar a página, tentar o token do cliente; se válido, pular o formulário.

### Backend (RPC `public_mission_identify` e `public_mission_config`)
- `mission_visitor_tokens` passa a ter escopo por **cliente** (não por missão): adicionar `client_id uuid` e índice único `(client_id, phone_e164)`.
- Na função identify: `UPSERT` por `(client_id, phone_e164)` — reutiliza o token e o participante existente entre missões do mesmo cliente.
- `mission_participants` também precisa ser desacoplado da missão: renomear/refatorar para `client_participants` (id, client_id, nome, phone_e164, first_seen_at). Manter tabela antiga como view/compat ou migrar dados existentes.
- `mission_events` mantém FK para o participante (agora global do cliente) — todos os eventos existentes continuam funcionando.

### Migração de dados
- Copiar `mission_participants` distintos por (client_id, phone) para a nova tabela unificada.
- Atualizar `mission_events.participant_id` para o id unificado.

---

## 2. Dashboard separado (persistente)

### Nova aba "Relatórios" em Central WhatsApp
- Adicionar tab ao lado de "Missões do Portal" e "Disparos".
- Lista TODAS as missões (ativas + arquivadas + excluídas) com: título, status, período, aberturas únicas, cliques, concluíram, grupos.
- Botões: "Abrir relatório detalhado" (reusa `MissionReport`), "Exportar CSV consolidado".

### Preservar dados históricos
- Adicionar coluna `archived_at` em `portal_missions` e trocar exclusão "hard" pelo arquivamento (soft delete). O botão de excluir passa a arquivar.
- Adicionar em `mission_events` snapshot do `mission_title` no momento do evento (coluna `mission_title_snapshot`) — assim mesmo que a missão suma, o histórico permanece legível.
- Trigger em `mission_events` para preencher o snapshot automaticamente no insert.

### Visão consolidada por participante
- Nova sub-aba "Pessoas" no dashboard: lista todos os `client_participants` do cliente com quantas missões abriu/concluiu, último acesso, grupos.
- Ajuda a gerenciar a base independentemente da missão vigente.

---

## 3. Atribuição de grupo confiável

**Sintoma:** ao entrar por um grupo específico o relatório não mostrou o grupo de origem.

**Causas possíveis identificadas:**
- Em `src/pages/Disparos.tsx` a substituição do link só acontece quando a string `${origin}/missao/${id}` bate exatamente. Se o texto tem outra base (ex.: URL pública configurada diferente do origin atual) ou variantes com `https://`/sem `https://`, a substituição falha e o destinatário recebe o link direto `/missao/<id>` sem `?d=<code>`.
- Se o link chegar sem `d=`, o servidor não sabe de qual grupo veio — nenhum evento carrega `distribution_id`.

**Correções:**
1. **Substituição robusta no Disparos**: normalizar o texto — trocar QUALQUER ocorrência de `/missao/<uuid>` (regex, independente de origin/protocolo) pelo short link `/api/public/m/<uuid>/d/<code>` do grupo em questão.
2. **Fallback server-side**: quando a página `/missao/<id>` é aberta sem `?d=`, tentar recuperar a última `distribution` daquele participante (por telefone reconhecido) ou marcar como "origem desconhecida" explicitamente no relatório em vez de silenciosamente perder.
3. **Stamp permanente no participante**: no identify, gravar `mission_participants.first_distribution_id` (já existe) e propagar para eventos futuros da mesma sessão via token (RPC event lê `distribution_id` do token se o request não trouxer `code`).
4. **Log de diagnóstico**: em `mission_events`, se `distribution_id IS NULL` mas o token tem distribuição associada, preencher automaticamente.

---

## Detalhes técnicos

**Migração (uma só):**
- `ALTER TABLE mission_visitor_tokens ADD COLUMN client_id uuid`; backfill; índice único `(client_id, phone_e164)`.
- Criar `client_participants` (ou renomear `mission_participants` e remover `mission_id`).
- `ALTER TABLE portal_missions ADD COLUMN archived_at timestamptz`.
- `ALTER TABLE mission_events ADD COLUMN mission_title_snapshot text`; trigger `BEFORE INSERT` que copia `portal_missions.title`.
- Reescrever RPCs `public_mission_config`, `public_mission_identify`, `public_mission_event`, `public_mission_switch` para o novo escopo por cliente.

**Frontend:**
- `MissaoPublica.tsx` — nova chave localStorage + fluxo de reconhecimento por cliente.
- `Disparos.tsx` — regex robusta para substituir links + garantir short link sempre.
- Novo componente `MissionsDashboard.tsx` (aba em Central WhatsApp) — lista consolidada + drill-down.
- Ajustar botão excluir de `PortalMissionsPanel.tsx` para arquivar em vez de deletar.

**Compatibilidade:**
- Tokens antigos (`sm_missao_token_*`) ficam órfãos no localStorage — inofensivo; opcionalmente fazer cleanup no primeiro carregamento.
- Participantes já existentes são migrados via UPSERT por `(client_id, phone)`.

---

## Não incluído

- Não mexer no motor de disparo (spintax/cadence/sticky routing).
- Não mudar visual das páginas existentes além da nova aba.
- Não alterar edge functions de WhatsApp.
