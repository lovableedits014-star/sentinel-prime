# Implementação Híbrida Groq + Gemini — Execução Rigorosa

## Princípios de execução

- **Zero breaking change**: clientes com apenas `llm_provider` + `llm_api_key` + `llm_model` continuam funcionando idênticos a hoje.
- **Incremental**: cada fase é deployável e testável isoladamente. Não avanço para a próxima sem validação.
- **Defensivo**: nenhum fallback silencioso entre tenants. Erro de config = erro explícito com `request_id`.
- **Isolamento total**: nenhuma estrutura compartilhada (cache, contexto, instância) entre `client_id` diferentes.

---

## Fase 0 — Auditoria prévia (READ-ONLY, sem alterar nada)

1. Listar as 27 edge functions em `supabase/functions/` e produzir planilha `docs/security/llm-functions-audit.csv` com colunas:
   `function | usa_llm | usa_transcribe | chama_getClientLLMConfig | valida_user_has_client_access | tier_alvo | risco`
2. Confirmar contrato atual de `getClientLLMConfig()` e `callLLM()` em `_shared/llm-router.ts` (não modificar ainda).
3. Confirmar existência e assinatura de `user_has_client_access(_client_id, _user_id)` no banco.
4. Confirmar RLS de `integrations` (já filtra por `client_id`).
5. Mapear callers de `transcribe-router.ts`.

**Entrega**: CSV de auditoria + relatório curto de riscos antes de tocar em código.

---

## Fase 1 — Migration aditiva e reversível

Migration única, **somente ADD COLUMN nullable** (zero risco para clientes atuais):

```text
integrations
  + llm_mode                 text   default 'simple'   -- 'simple' | 'hybrid'
  + llm_provider_fast        text   null
  + llm_api_key_fast         text   null
  + llm_model_fast           text   null
  + llm_provider_reasoning   text   null
  + llm_api_key_reasoning    text   null
  + llm_model_reasoning      text   null
  + llm_provider_deep        text   null
  + llm_api_key_deep         text   null
  + llm_model_deep           text   null
  + llm_provider_classify    text   null
  + llm_api_key_classify     text   null
  + llm_model_classify       text   null

llm_usage_log (NOVA tabela)
  id uuid pk, client_id uuid NOT NULL, user_id uuid null,
  function_name text NOT NULL, tier text NOT NULL,
  provider text NOT NULL, model text NOT NULL,
  latency_ms int, prompt_tokens int, completion_tokens int,
  total_tokens int, request_id text NOT NULL,
  success bool NOT NULL, error_code text null, error_message text null,
  created_at timestamptz default now()
  + index (client_id, created_at desc), (function_name, created_at desc)
  + RLS: SELECT apenas para has_role(admin) OU user_has_client_access(client_id, auth.uid())
  + INSERT apenas via service role
```

Reversível via `DROP COLUMN IF EXISTS` / `DROP TABLE IF EXISTS`.

---

## Fase 2 — Refatorar `_shared/llm-router.ts` (compatível 100%)

Manter assinaturas existentes (`getClientLLMConfig`, `callLLM`) intactas. **Adicionar** ao lado:

- `type LLMTier = 'fast' | 'classify' | 'reasoning' | 'deep'`
- `getClientLLMConfigByTier(admin, clientId, tier)` — retorna config do tier; se `llm_mode='simple'` OU coluna do tier vazia, **cai para a config legacy do próprio cliente** (nunca para env global, nunca para outro cliente).
- `callLLMStructured(cfg, { messages, schema, ... })` — usa `responseSchema` no Gemini, `response_format: json_object` no Groq/OpenAI.
- `logLLMUsage(admin, { clientId, functionName, tier, provider, model, latencyMs, usage, requestId, success, error })` — fire-and-forget mas com `try/catch` para não derrubar request.
- Gerar `request_id` (uuid) por chamada e propagar em logs.

**Regras duras**:
- Nunca usar `GROQ_API_KEY` env como fallback quando cliente tem qualquer config própria.
- Erro de config = `throw new Error('LLM_CONFIG_MISSING:<tier>:<client_id>')` — explícito.
- Nenhum estado de módulo compartilhado entre requests (sem singletons com dados de cliente).

---

## Fase 3 — Hardening de acesso em TODAS as 27 functions

Para cada function que toca LLM ou integrations:

1. Verificar `Authorization` header.
2. `supabase.auth.getUser(token)` → `userId`.
3. `supabase.rpc('user_has_client_access', { _client_id, _user_id })` → 403 se falso.
4. **Só então** chamar `getClientLLMConfigByTier(admin, clientId, tier)`.
5. Envolver chamada LLM em medição de latência + `logLLMUsage`.

Checklist por função registrado em `docs/security/llm-functions-audit.csv` (coluna `revisado_em`, `tier_aplicado`, `acesso_ok`).

Functions agrupadas para execução em lotes pequenos (5-6 por vez, com teste entre lotes):
- Lote A (CLASSIFY): `analyze-sentiment`, `batch-analyze-sentiments`
- Lote B (FAST): replies, respond-to-comment, quick-reply gens
- Lote C (REASONING): extractors estruturados (~15 funções)
- Lote D (DEEP): `ic-write-materia`, `ic-write-boletim`, `ic-dna-analyzer`, `ic-project`
- Lote E (MULTIMODAL): `ic-transcribe`, `ic-reprocess-transcription` via `transcribe-router`

---

## Fase 4 — Fix de `analyze-sentiment` (CLASSIFY tier)

- Migrar para `callLLMStructured` com `responseSchema` tipado `{ s: enum, c: number, reason: string }`.
- **Remover** `verifyNegative` (segunda chamada) — agora redundante com structured output do Gemini.
- **Manter** `applyHeuristicGuard` como guarda final.
- Expandir few-shot de 20 → 50 correções (limitado por tokens).
- Injetar `clients.name` + `clients.cargo` no system prompt (já feito, manter).
- Telemetria completa em `llm_usage_log`.
- `batch-analyze-sentiments` segue mesmo padrão, com concorrência limitada e sem compartilhar contexto entre comentários de clients diferentes (já é separado por job, validar).

---

## Fase 5 — UI `IntegrationsPanel.tsx`

- Toggle **Modo simples / Modo híbrido** (default: simple).
- Modo híbrido revela 4 blocos (FAST / CLASSIFY / REASONING / DEEP), cada um com provider+key+model próprios.
- Validação client-side + server-side ao salvar.
- Mostrar apenas integração do `clientId` ativo (já é o comportamento, validar).

---

## Fase 6 — Validação e testes

Após cada lote da Fase 3:
1. `supabase--deploy_edge_functions` apenas das funções do lote.
2. `supabase--curl_edge_functions` em cenários: (a) usuário sem acesso ao client → 403, (b) cliente sem config tier → erro explícito, (c) cliente com config simple → roda como hoje, (d) cliente com config híbrida → roteia para o tier certo.
3. `supabase--edge_function_logs` para confirmar `request_id` e `llm_usage_log` populados.
4. Smoke test multi-tenant: dois clients fictícios com keys diferentes — confirmar que key de A nunca aparece em log/erro de B.

---

## Riscos identificados e mitigação

| Risco | Mitigação |
|---|---|
| Race condition em leitura de integrations | Cada request faz nova query, sem cache compartilhado |
| Fallback cruzado de API key | `getClientLLMConfigByTier` nunca lê env quando há qualquer config no client; nunca lê de outro client |
| Edge function nova sem `user_has_client_access` | Checklist obrigatório no CSV de auditoria; PR não considerado pronto sem coluna `acesso_ok=true` |
| Log de key acidentalmente | `logLLMUsage` whitelist de campos; nunca loga `apiKey` |
| Regressão em cliente atual | Modo `simple` é o default e usa caminho legacy literal |
| Migration irreversível | Apenas ADD COLUMN nullable + nova tabela, ambos com DROP reversível |

---

## Entregáveis finais

1. `docs/security/llm-functions-audit.csv` preenchido com as 27 funções.
2. Relatório técnico em `docs/security/llm-hybrid-implementation-report.md` com: arquivos alterados, funções auditadas, riscos encontrados, validações executadas, pontos sensíveis remanescentes, confirmação explícita de isolamento multi-tenant.
3. Migration única reversível.
4. UI com toggle simple/hybrid.
5. Confirmação de que zero cliente atual quebrou (modo simple = comportamento idêntico).

---

## O que NÃO será feito nesta entrega

- Não habilitarei modo híbrido para nenhum client existente — fica em `simple` por default, você ativa manualmente quando quiser.
- Não rotacionarei nenhuma key existente.
- Não tocarei em RLS de tabelas que não sejam `integrations` (apenas ADD COLUMN) e a nova `llm_usage_log`.
- Não removerei `verifyNegative` antes de validar com A/B em pelo menos 1 cliente real (mantenho atrás de feature flag durante 48h).

Aguardando você trocar para **modo Build** e dizer "pode seguir" para eu iniciar pela Fase 0.