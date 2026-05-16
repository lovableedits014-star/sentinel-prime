# Migração para Gemini — usando o IntegrationsPanel que já existe

## Diagnóstico

Você está certíssimo. O sistema **já tem** toda a infra de configuração de LLM por cliente:

- `IntegrationsPanel.tsx` → o usuário escolhe provider + modelo + cola API key
- Tabela `integrations` → guarda `llm_provider`, `llm_api_key`, `llm_model` por cliente
- `getClientLLMConfig()` em `_shared/llm-router.ts` → lê essa config e roteia a chamada

**Então não precisa criar secret `GEMINI_API_KEY` nem trocar default global.** Você simplesmente vai em Configurações → Provedor de IA, escolhe **Google Gemini**, cola sua key do AI Studio, escolhe o modelo, salva. Pronto — todas as 27 funções passam a usar Gemini para esse cliente.

## Problemas reais que impedem isso de funcionar 100% hoje

Auditando o código, encontrei 4 lacunas:

### 1. Lista de modelos Gemini no painel está desatualizada
`IntegrationsPanel.tsx` linha 30 oferece só `gemini-1.5-pro` e `gemini-1.5-flash` (modelos legados/caros). Faltam os **2.5** que você quer usar (Flash-Lite, Flash, Pro).

### 2. `callGemini` no router não tem retry em 429/503
A função `callGroq` tem retry exponencial robusto (linhas 351-382). A `callGemini` (linhas 273-313) chama uma vez e morre. Em uso real vai dar erro toda hora.

### 3. Gemini não suporta tool calling no router
`callLLMRaw` (usado por funções com tools como `ic-extract-knowledge`, `ic-write-materia`, `ic-dna-analyzer`, `ic-feed-from-transcript` etc.) só aceita providers OpenAI-compatíveis. Se o cliente escolher Gemini, **todas as funções de extração com tools quebram** com "Provedor 'gemini' não suporta tool calling".

Solução: o endpoint Gemini também é OpenAI-compatível via `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`. Adicionar à lista `OPENAI_COMPATIBLE` e ajustar o endpoint.

### 4. Transcrição (`ic-transcribe` / `ic-reprocess-transcription`) está hardcoded em Groq Whisper
Mesmo com o cliente configurado pra Gemini, transcrição **ignora** a config e tenta usar Groq (linhas 81-115 de `ic-transcribe`). Precisa ler `llm_provider` da integração e, quando for `gemini`, usar a API multimodal do Gemini (que aceita áudio direto, até 9h, sem limite de 25MB).

## Mudanças (todas pequenas, nenhum schema novo)

### A. `IntegrationsPanel.tsx`
Atualizar a lista de modelos Gemini:
```ts
gemini: {
  models: ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-flash', 'gemini-1.5-pro'],
  default: 'gemini-2.5-flash'
}
```
E na descrição: "Gemini 2.5 (Flash-Lite/Flash/Pro) — recomendado para uso intenso".

### B. `_shared/llm-router.ts`
- Trocar endpoint Gemini para o modo **OpenAI-compatible** (`/v1beta/openai/chat/completions`), que aceita o mesmo body que OpenAI/Groq, incluindo `tools`
- Adicionar `gemini` à lista `OPENAI_COMPATIBLE`
- Atualizar `DEFAULT_MODELS.gemini` para `gemini-2.5-flash`
- Adicionar retry 429/503 no caminho Gemini (mesma lógica do Groq, respeitando `retry-after`)
- Reescrever `callGemini` para usar o endpoint OpenAI-compatible (assim chat e tools usam o mesmo caminho)

Resultado: **nenhuma das 27 edge functions precisa ser tocada** — todas continuam chamando `callLLM` / `callLLMRaw` e passam a funcionar com Gemini automaticamente quando o cliente escolher Gemini no painel.

### C. `_shared/transcribe-router.ts` (novo helper, ~80 linhas)
Função única `transcribeAudio({ supabase, clientId, file, language, prompt })` que:
1. Lê `integrations.llm_provider` + `llm_api_key`
2. Se for `gemini` → upload via Gemini Files API ou inline (`inlineData` base64) e chama `gemini-2.5-flash` com prompt "Transcreva este áudio em português, retorne JSON com `text` e `segments` no formato Whisper"
3. Se for `groq` ou ausente → mantém comportamento atual (Whisper na Groq)
4. Se for `openai` → usa Whisper da OpenAI
5. Retorno padronizado igual ao formato Whisper de hoje (`text`, `segments`, `language`)

### D. `ic-transcribe/index.ts` e `ic-reprocess-transcription/index.ts`
Trocar o bloco hardcoded de Groq pelo novo `transcribeAudio()`. Sem mudança de contrato pra o frontend.

### E. `test-llm-connection`
Sem mudança no código — já testa Gemini via `callLLM`. Só vai ficar mais robusto porque o `callGemini` novo tem retry.

## Como você usa depois que estiver pronto

1. Cria a key em https://aistudio.google.com/apikey
2. Vai em **Configurações → Integrações → Provedor de IA**
3. Seleciona **Google Gemini**
4. Cola a key, escolhe **gemini-2.5-flash** (ou Flash-Lite se quiser ainda mais barato)
5. Clica **Testar Conexão** → deve responder "conectado"
6. Salva

A partir daí: extração, geração de matéria, sentimento, DNA, transcrição de vídeos, tudo passa a usar Gemini com a sua key. Se quiser voltar pra Groq depois, é só trocar no painel — zero código.

## Riscos

| Risco | Mitigação |
|---|---|
| Endpoint OpenAI-compat do Gemini é beta | Se falhar em produção, fallback para o endpoint nativo `generateContent` (já está implementado, vira fallback) |
| Transcrição via Gemini retorna formato diferente de Whisper | Helper normaliza pro mesmo shape `{text, segments[]}` — frontend nem percebe |
| Cliente esquece de salvar a key | Painel já mostra "✓ API key configurada" / "Insira sua API key" |

## Estimativa
~20 min de execução. 4 arquivos tocados: `IntegrationsPanel.tsx`, `_shared/llm-router.ts`, novo `_shared/transcribe-router.ts`, `ic-transcribe/index.ts`, `ic-reprocess-transcription/index.ts`.
