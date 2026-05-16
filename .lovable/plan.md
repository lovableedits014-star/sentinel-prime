## Contexto

Hoje a Timeline (`Memória → Timeline`) só lê `ic_knowledge_documents`, alimentada por transcrições, PDFs, URLs e notas manuais. Posts e comentários do Facebook/Instagram passam pelo extrator em "modo fato" (geram propostas, promessas, bordões em `ic_facts`), mas **não viram documentos** — por isso não aparecem ali.

Não existe tabela `posts` separada: cada post vive desnormalizado dentro de `public.comments` (`post_id`, `post_message`, `post_permalink_url`, `post_full_picture`, `post_media_type`, `platform`, `comment_created_time`). Posts são reconstruídos agrupando comentários por `post_id`.

Você escolheu **as duas coisas**, com escopo **todos os posts do sistema**.

---

## Parte A — Mesclar posts na Timeline (UI, rápido)

Objetivo: ver posts publicados ao lado de documentos da memória, sem mexer na estrutura da memória.

1. **Hook novo `usePostsTimeline(clientId)`** em `src/components/inteligencia-conteudo/`:
   - Lê `comments` agrupando por `post_id + platform`.
   - Para cada post: pega `post_message`, `post_permalink_url`, `post_full_picture`, `post_media_type`, `platform`, data = `min(comment_created_time)` como aproximação da publicação, e contadores (nº comentários, sentimentos agregados).
   - Limite ~500 posts mais recentes do cliente.

2. **`DocumentsTimeline` em `MemoriaPanel.tsx`**:
   - Mescla `ic_knowledge_documents` + posts em uma única lista ordenada por data desc.
   - Cada item carrega `kind: "doc" | "post"`.
   - Posts renderizam com card distinto: ícone Instagram/Facebook, thumb do `post_full_picture`, trecho do `post_message`, badges (nº comentários, sentimento dominante), botão "Ver original" (link externo) e "Promover a documento" (chama Parte B sob demanda).
   - Novo chip de filtro **"Posts"** ao lado de Todas / Propostas / Promessas / Bandeiras / Bordões. Filtros existentes continuam aplicando-se só a documentos.

3. **Sem mudança de schema, sem novo endpoint** nesta parte.

---

## Parte B — Promover posts a documentos da memória

Objetivo: posts viram entradas em `ic_knowledge_documents` (com resumo, propostas, promessas, bandeiras, bordões, embeddings) e passam a aparecer no DNA, Livro de Campanha, busca, widgets, drift, contradições.

1. **Extender `ic-extract-knowledge`** (edge function existente):
   - Adicionar `"post"` ao `DOC_MODE_TYPES` e ao `TIPO_DOCUMENTO_MAP` (`post → "post_social"`).
   - Passar `sourceId = post_id`, `sourceType = "post"`, `sourceUrl = post_permalink_url`, `sourceDate = comment_created_time` mais antigo do post, `text = post_message` (+ opcionalmente top N comentários para contexto), `documentTitleHint` = primeiros ~80 chars da legenda.
   - Reuso completo da pipeline (LLM → resumo → propostas/promessas/bandeiras → embedding).

2. **Nova edge function `ic-import-posts`** (orquestrador):
   - Input: `{ clientId, limit?, sinceDate?, postIds? }`.
   - Lista posts distintos de `comments` (todos os posts do sistema para esse cliente, conforme escolhido).
   - Pula posts já importados (checa `ic_knowledge_documents.tipo_documento='post_social' AND source_ref=post_id`).
   - Pula posts sem `post_message` (vídeo/imagem sem legenda) — fica visível só na Parte A.
   - Chama `ic-extract-knowledge` em lote com throttling (1–2 por segundo) para evitar limite de LLM/custo.
   - Retorna `{ processed, skipped, failed }`.

3. **UI em `MemoriaPanel`**:
   - Botão **"Importar posts para memória"** no header, ao lado de "Adicionar documento", com dialog mostrando: total de posts elegíveis, quantos já importados, opção de janela temporal (últimos 30/90/365 dias / tudo) e barra de progresso.
   - Botão por linha "Promover a documento" no card de post da Timeline (atalho 1-a-1).

4. **Cron opcional (sugerido, mas opt-in)**:
   - Schedule diário no `cron` Supabase chamando `ic-import-posts` com `sinceDate = now() - 1 day`. Fica como toggle em Settings da Inteligência de Conteúdo, **não ligado por padrão** (custo de LLM).

---

## Detalhes técnicos

- **Sem migração obrigatória.** `ic_knowledge_documents.source_ref` (text) e `tipo_documento` (text) já suportam o novo tipo.
- **Dedupe**: `delete where client_id=? and source_ref=post_id and tipo_documento='post_social'` antes de inserir (mesmo padrão de transcrições).
- **Custo**: cada post = 1 chamada LLM. Por isso a Parte B é manual/opt-in, não automática.
- **Auth**: `ic-import-posts` recebe `Authorization: Bearer <user>` e usa `requireSupabaseAuth` (segue padrão do projeto). Internamente usa service role para escrita.
- **Performance da Parte A**: query única `select distinct on (post_id, platform) ... from comments where client_id=? order by post_id, comment_created_time asc` + segunda query agregando contagens. Cache via TanStack Query (`staleTime: 60s`).

---

## Entregáveis

```text
Parte A (UI)
├── src/components/inteligencia-conteudo/usePostsTimeline.ts   (novo)
└── src/components/inteligencia-conteudo/MemoriaPanel.tsx      (DocumentsTimeline + chip "Posts")

Parte B (memória)
├── supabase/functions/ic-extract-knowledge/index.ts           (aceita sourceType="post")
├── supabase/functions/ic-import-posts/index.ts                (novo, orquestrador)
└── src/components/inteligencia-conteudo/ImportPostsDialog.tsx (novo, botão no header)
```

Sem mudanças em schema, RLS, ou outras telas. Outras superfícies que já leem `ic_knowledge_documents` (DNA, Livro de Campanha, Cobertura, Drift, Contradições, widgets) passam a incluir posts automaticamente.
