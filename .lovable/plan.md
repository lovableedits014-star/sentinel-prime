
# Galerias públicas de fotos de campanha

Hoje você monta as fotos em "Fotos de Campanha" (modo Lote) e precisa enviar uma por uma para cada pessoa. A ideia: criar **pastas/eventos públicos** onde as fotos já montadas ficam disponíveis para baixar via link, sem login.

## Como vai funcionar

### 1. Admin (você) — nova aba "Galerias" em Fotos de Campanha
- Botão **"Nova galeria/evento"** com:
  - Nome (ex.: "Reunião nas Moreninhas")
  - Data do evento (ex.: 14/06)
  - Moldura padrão da galeria (escolhe entre as do cliente)
  - Status: rascunho / publicada
- Dentro da galeria, reaproveita o **Lote** atual: você envia 1–30 fotos (ou mais, em vários lotes), o sistema monta com a moldura, você ajusta posicionamento se quiser, e clica **"Publicar galeria"**.
- Cada foto publicada vira um arquivo no Supabase Storage.
- Lista de galerias mostra: nome, data, nº de fotos, link público (copiar), QR code, botão arquivar.

### 2. Hub público do candidato — `/g/{clientSlug}`
- Página pública com:
  - Logo + nome do candidato (reusa `candidate_identity`)
  - Bloco em destaque no topo: **"Monte sua foto agora"** (link/embed do `FrameEditor` já existente em `/foto/{clientId}`)
  - Lista das galerias publicadas (cards com nome, data, miniatura, contagem de fotos), ordenadas por data desc
- Sem login, sem PIN.

### 3. Página da galeria — `/g/{clientSlug}/{gallerySlug}`
- Cabeçalho: nome do evento, data, voltar pro hub
- Grid de miniaturas (todas as fotos montadas). Clique abre lightbox com **"Baixar PNG"** e **"Baixar todas (ZIP)"** no topo.
- Busca simples por nome do arquivo (caso você nomeie "Maria.jpg" antes de subir, ela acha).
- Mesmo bloco "Monte a sua" no rodapé.

## Detalhes técnicos

### Banco (migration)
- `campaign_photo_galleries`: `id`, `client_id`, `slug` (único por cliente), `nome`, `event_date`, `frame_id` (fk `campaign_frames`), `status` (draft/published), `cover_photo_id`, `created_at`, `created_by`.
- `campaign_photo_gallery_items`: `id`, `gallery_id`, `original_file_name`, `storage_path`, `public_url`, `width`, `height`, `order_index`, `created_at`.
- RLS: leitura pública apenas quando `status='published'` (gallery + items); escrita só pelo time do cliente (segue padrão das demais tabelas).
- Grants padrão: `authenticated` CRUD; `anon` SELECT só em galerias publicadas.

### Storage
- Bucket público novo `campaign-gallery` (ou reusa um existente público se já houver). Caminho: `{clientId}/{galleryId}/{itemId}.png`.
- Render acontece no browser (já funciona no Lote); ao "Publicar", faz upload do Blob de cada item e cria a linha em `gallery_items`.

### Rotas TanStack
- `src/routes/g.$clientSlug.tsx` — hub público (SSR, head com OG do candidato).
- `src/routes/g.$clientSlug.$gallerySlug.tsx` — galeria pública (SSR, head com nome+data do evento, og:image = capa).
- Loaders chamam server fns públicas (`createServerFn` + `supabaseAdmin` carregado dentro do handler) que retornam só galerias publicadas.
- `clientSlug` = novo campo `public_slug` em `clients` (ou usa `id` se vazio — fallback).

### Admin UI
- Em `src/pages/FotosCampanha.tsx`: nova aba "Galerias" ao lado de Individual/Lote.
- Novo componente `GalleryManager.tsx` (lista + criar/editar) e `GalleryBatchUploader.tsx` (reusa `useBatchRenderer` + passo final "Publicar").
- Ao publicar: itera `items.filter(ready)`, faz `fetch(resultUrl).blob()` → `supabase.storage.upload` → `insert gallery_items`.

### Download em massa
- Reusa lógica do `downloadZip` já existente, mas baixando de `public_url` no client.

## Fora de escopo desta entrega
- Reconhecimento facial / busca por selfie.
- PIN / expiração de link (decidido: público por link).
- Notificação automática (WhatsApp em massa avisando que a galeria saiu) — pode virar próximo passo, conectando ao módulo de disparos existente.

## Entregáveis
1. Migration (2 tabelas + RLS + grants) e bucket de storage.
2. Server fns públicas para hub e galeria.
3. 2 rotas públicas novas (`/g/...`).
4. Aba "Galerias" no admin com criar / upload em lote / publicar / copiar link.
5. Botão "Compartilhar galeria" (copia link + abre WhatsApp web com mensagem pronta).
