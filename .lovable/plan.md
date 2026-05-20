## Objetivo
Permitir anexar imagem (opcional) ao criar um disparo de WhatsApp, e enviá-la via `action: "send_media"` na bridge da VPS, com `caption` igual à mensagem personalizada.

## Estrutura atual (resumo)
- Tabela `whatsapp_dispatches` guarda `mensagem_template` (texto). Não tem coluna de mídia.
- Edge function `send-whatsapp-dispatch` envia tudo com `{ action: "send", phone, message }` via `fetchBridgeSend()`.
- Bucket `whatsapp-media` já existe (público, com policies de upload por cliente).
- Página `src/pages/Disparos.tsx` tem formulário com `titulo` + `mensagem` e cria o registro em `whatsapp_dispatches`.

## Mudanças

### 1. Migration (banco)
Adicionar à `whatsapp_dispatches`:
- `media_url text` (nullable) — URL pública da imagem
- `media_type text` (nullable, default `'image'`) — futuro: video/audio

### 2. UI — `src/pages/Disparos.tsx`
- Novo campo "Anexar imagem (opcional)" no formulário:
  - Input `type="file"` (accept `image/*`)
  - Upload imediato para bucket `whatsapp-media` em `dispatches/{client_id}/{timestamp}-{nome}.ext`
  - Preview da imagem + botão "Remover"
  - Guarda a URL pública em estado (`mediaUrl`)
- Ao criar o dispatch, incluir `media_url` no insert.
- Mostrar pequeno ícone/thumb na lista de disparos (`d.media_url`).

### 3. Edge function — `supabase/functions/send-whatsapp-dispatch/index.ts`
- Ao carregar o dispatch, ler também `media_url`.
- Estender `fetchBridgeSend()` para aceitar `mediaUrl?: string`:
  - Se `mediaUrl` presente → payload `{ action: "send_media", phone, media_url, caption: message }`
  - Senão → payload atual `{ action: "send", phone, message }`
- Aplicar nos pontos que chamam `fetchBridgeSend` (loop principal de envio do dispatch e retry queue).
- Sem mídia em grupos por enquanto (mantém fluxo atual de grupos só com texto) — pode ser estendido depois.

### 4. Cobertura
- Disparo manual com imagem ✅
- Reenviar falhas reaproveita o `media_url` do dispatch ✅
- Retry queue: incluir `media_url` no payload enfileirado (campo extra opcional).

## Fora de escopo
- Múltiplas imagens, vídeo/áudio, documentos
- Envio de mídia para grupos
- Mídia em mensagens de aniversário / boas-vindas de coordenador (podem ser feitas em iterações seguintes seguindo o mesmo padrão)
