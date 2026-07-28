# Plano — Missões rastreáveis por grupo (opt-in, sem quebrar o fluxo atual)

## 1. Como funciona hoje (leitura do código)

- **Tabela `portal_missions`** (`client_id`, `platform`, `post_url`, `title`, `description`, `is_active`, `display_order`). Uma missão = 1 publicação (FB ou IG). Não há link avulso separado nem vínculo com grupos.
- **Cadastro** em `src/components/engagement/PortalMissionsPanel.tsx` — cria/edita/pausa/exclui missões. FB, IG e URL manual são hoje 3 formas de escolher o `post_url` de missões separadas.
- **Consumo interno**: `src/pages/SupporterPortal.tsx`, `PortalFuncionario.tsx`, `PortalContratado.tsx` listam missões ativas e mostram os links.
- **Disparo para grupos WhatsApp** vive em `src/pages/Disparos.tsx` (`handleUseMissions`, linhas 362–379): monta uma mensagem concatenando `post_url` de cada missão ativa e envia via `send-whatsapp-dispatch` para `selectedGroupJids`. Não há hoje "envio de missão"; é um disparo genérico que usa os links das missões como texto.
- **Pessoas / telefone**: já existe `public.pessoas` (com `telefone`, `nome`, `client_id`) e utilidades de normalização em `src/lib/phone-utils.ts`.
- **Não existe hoje**: link intermediário, tabela de distribuições missão↔grupo, registro de acesso/clique, página pública de missão, cadastro leve por telefone.

Nada disso é destruído — a proposta adiciona uma trilha paralela ativada por um toggle **"Ativar identificação e rastreamento"** na missão.

## 2. Menor alteração possível — visão geral

1. Adicionar toggle `tracking_enabled` na missão e campos separados para `link_facebook`, `link_instagram`, `link_avulso` (opcionais). Quando o toggle está **off**, o comportamento atual não muda (usa `post_url`).
2. Ao selecionar grupos no disparo, gerar 1 **distribuição** por (missão × grupo) com um `short_code` aleatório e substituir os links externos do texto pelos links `/m/<mission>/d/<code>`.
3. Uma rota pública nova recebe o clique, identifica/cadastra o participante (nome + telefone), registra evento, e redireciona para o alvo (FB/IG/avulso) ou mostra a página intermediária com os botões.
4. Um relatório novo por missão consolida participantes, cliques e conclusões.

## 3. Banco de dados (uma migração)

Novas colunas em `portal_missions`:
- `tracking_enabled boolean not null default false`
- `link_facebook text`, `link_instagram text`, `link_avulso text`
- `instructions text` (instruções mostradas na página intermediária)

Mantém `post_url` e `platform` para retrocompatibilidade. Quando `tracking_enabled=false`, os portais internos continuam lendo `post_url` como hoje.

Novas tabelas (todas com GRANTs, RLS e trigger `updated_at`):

- **`mission_distributions`** — 1 linha por (missão × grupo WhatsApp × disparo).
  - `mission_id`, `client_id`, `group_jid` (nullable — permite futuro uso não-WA), `group_name_snapshot`, `dispatch_id` (nullable, FK `whatsapp_dispatches`), `short_code text unique not null`, `created_by`, timestamps.
  - RLS: leitura/escrita pelo cliente dono (mesmo padrão de `portal_missions`).
  - Índice único em `short_code`; índice em (`mission_id`, `group_jid`).

- **`mission_participants`** — pessoa identificada por telefone normalizado, por cliente.
  - `client_id`, `phone_e164 text not null`, `nome text not null`, `pessoa_id uuid nullable` (link opcional com `public.pessoas`), `first_seen_at`, `last_seen_at`, timestamps.
  - UNIQUE (`client_id`, `phone_e164`).
  - RLS: leitura pelo cliente dono; **inserção/atualização** feita apenas por server function (service role); nunca exposta ao anon direto.

- **`mission_visitor_tokens`** — token opaco salvo no browser (cookie httpOnly + fallback localStorage).
  - `token text primary key` (aleatório 32B), `participant_id`, `client_id`, `user_agent`, `device_hint`, `created_at`, `last_used_at`, `revoked_at`.

- **`mission_events`** — 1 linha por interação.
  - `mission_id`, `distribution_id` (nullable, resolvido pelo short_code), `participant_id` (nullable — permite log anônimo antes do cadastro), `client_id`, `event_type` enum (`open`, `click_facebook`, `click_instagram`, `click_avulso`, `declared_done`), `ip_hash`, `user_agent`, `device_category`, `created_at`.
  - Índices por (`mission_id`, `event_type`) e (`participant_id`, `created_at`).

- **VIEW `mission_report_by_participant`** — agrega events por (missão, participante, distribuição) para o relatório.

Enum `mission_event_type`. Nada é adicionado em tabelas existentes além das colunas de `portal_missions`.

## 4. Novas rotas e telas

**Server routes públicas** (`src/routes/api/public/`, sem auth, com rate-limit por IP e validação Zod):

- `GET /api/public/m/:missionId/d/:code` — resolve distribuição, seta cookie visitante se ausente, registra `open`, redireciona para `/missao/:missionId?d=<code>` (rota do app).
- `POST /api/public/missao/identify` — body `{ token?, nome, phone, missionId, code }`. Normaliza telefone (reusa `phone-utils`), upserta participante, cria/atualiza token, associa ao evento `open` anterior.
- `POST /api/public/missao/event` — body `{ token, missionId, code, type }`. Registra clique/conclusão. Chamado antes de `window.location = <url externa>`; usa `navigator.sendBeacon` como fallback para não perder o registro quando a aba muda para o FB/IG.
- `POST /api/public/missao/switch` — invalida o token atual ("Não é Maria?").

**Rota pública do app** (`src/routes/missao.$missionId.tsx` ou `src/pages/MissaoPublica.tsx` no wildcard):
- Se não há token válido → formulário simples (nome + telefone com máscara BR).
- Se há token → saudação "Olá, {nome}. Sua participação nesta missão será registrada." + link "Não é você? Trocar participante".
- Depois exibe: título, instruções, botões visíveis apenas quando o campo correspondente existe:
  - Facebook (`link_facebook`)
  - Instagram (`link_instagram`)
  - Link avulso (`link_avulso`)
  - "Já realizei esta missão" (`declared_done`)
- Cada botão dispara `POST /event` **antes** do `window.open`/`location.href`. Usa HTTPS puro (nada de `fb://`).

## 5. Mudanças no admin (mínimas)

**`PortalMissionsPanel.tsx`**:
- Dialog de criar/editar ganha:
  - Toggle "Ativar identificação e rastreamento".
  - Quando ligado: campos `link_facebook`, `link_instagram`, `link_avulso`, `instructions`. Quando desligado: mantém a UI atual com `post_url` único.
- Botão "Ver relatório" em cada missão rastreada → abre drawer/tela do relatório.

**`Disparos.tsx` → `handleUseMissions`**:
- Se toda missão selecionada tem `tracking_enabled=false` **ou** `tipoDisparo !== "grupos"` → comportamento atual (não mexe).
- Se `tipoDisparo === "grupos"` e há missões rastreadas: no envio, para cada grupo alvo, chama uma nova server function `create-mission-distributions` que cria as linhas e devolve `{groupJid → shortCode}` por missão. A mensagem é montada substituindo os links externos por `https://<host>/api/public/m/<missionId>/d/<shortCode>`. O `dispatch_id` gerado é gravado nas distribuições depois que `whatsapp_dispatches` existir (patch pós-insert).

## 6. Relatório

Novo componente `MissionReport.tsx` (acessível pelo painel de missões e por deep link):
- Totais: participantes que abriram, participantes únicos, total de acessos, cliques por tipo, conclusões declaradas.
- Quebra por grupo (usa `mission_distributions.group_name_snapshot`).
- Tabela por participante: nome, telefone, grupo de origem, abriu, cliques (3 colunas), declarou conclusão, primeiro/último acesso.
- Filtros: missão, grupo, participante (busca), período, tipo de evento.
- Export CSV.

## 7. Compatibilidade e preservação

- Missões existentes ficam com `tracking_enabled=false` — `SupporterPortal`, `PortalFuncionario`, `PortalContratado` e a montagem de mensagem em `Disparos` continuam iguais.
- Novo comportamento só liga por toggle explícito na missão.
- Nada é removido de `portal_missions`. `post_url`/`platform` permanecem obrigatórios como hoje.

## 8. Riscos técnicos e mitigação

- **Perder o clique quando o FB/IG toma a aba** → `navigator.sendBeacon` no `POST /event` + fallback `fetch(..., {keepalive:true})` antes do redirect.
- **Duplicidade de participante** (formatos de telefone) → normalizar para E.164 BR (`+55DDDNNNNNNNNN`) via helper existente antes do upsert; UNIQUE `(client_id, phone_e164)`.
- **Token perdido** (navegador limpo, WA in-app fecha) → identidade é reconquistada informando o mesmo telefone; participante é reusado (upsert por telefone).
- **Encaminhamento do link** → o `short_code` mantém o grupo de origem mesmo se o link for repassado; documentar no relatório como "grupo de origem".
- **Bot/preview crawlers** (WhatsApp/Facebook link preview) inflando `open` → detectar user-agent conhecido e marcar evento como `bot` (não conta no relatório) ou ignorar.
- **Rate-limit** em `/api/public/missao/*` → limitar por IP + short_code para evitar spam de eventos.
- **Privacidade** → não expor nome/telefone na URL; página pública só mostra o próprio nome quando o cookie/token bate.
- **Grupo sem nome sincronizado** → `group_name_snapshot` capturado na hora do disparo evita "grupo fantasma" no relatório.
- **Deep link `fb://`/`instagram://`** — não usar; HTTPS abre no in-app quando o app está instalado.

## 9. Casos de teste

1. Missão sem tracking → mensagem enviada aos grupos é idêntica à atual.
2. Missão com tracking + 3 grupos → 3 short_codes distintos; link do grupo A não vira "origem grupo B" quando repassado.
3. Primeiro acesso pelo WA in-app do iPhone → formulário aparece, telefone `(67) 9 8888-7777` é normalizado, token setado, `open` registrado.
4. Segundo acesso do mesmo device → mostra "Olá, Maria", sem formulário.
5. "Trocar participante" → token revogado, próxima abertura pede cadastro; participante antigo permanece no banco.
6. Clique em Facebook → `click_facebook` registrado mesmo que a pessoa não volte ao Sentinelle.
7. Duas pessoas no mesmo aparelho (compartilhado) → segunda usa "Trocar participante"; eventos ficam separados por token/participante.
8. Aba anônima → não persiste token; cada abertura cria participante novo se telefone diferente; mesmo telefone deduplica no upsert.
9. Missão rastreada exibida no portal interno (`SupporterPortal`) → continua abrindo os links externos diretamente (o rastreio é para o público de grupos, não para o portal logado).
10. Relatório: totais coerentes com eventos; filtro por grupo isola corretamente.

## 10. Etapas de implementação (pequenas)

1. **Migração** (colunas em `portal_missions`, novas tabelas, enum, view, RLS/GRANTs).
2. **Server functions** públicas: `identify`, `event`, `switch`, `resolve` (`/m/:id/d/:code`), + helper `create-mission-distributions`.
3. **Rota pública `/missao/:id`** + formulário e página intermediária.
4. **Ajuste em `PortalMissionsPanel`** (toggle + 3 campos de link + instruções).
5. **Ajuste em `Disparos.tsx` `handleUseMissions`** para substituir links quando `tipoDisparo="grupos"` e a missão tem tracking.
6. **Tela de relatório** + export CSV.
7. **Hardening**: rate-limit, filtro de bots, `sendBeacon`, testes manuais dos 10 casos.

Cada etapa é isolada — nenhuma quebra o fluxo antigo enquanto o toggle permanece desligado.
