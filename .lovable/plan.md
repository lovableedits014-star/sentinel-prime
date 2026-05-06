# Reformular a Memória da Inteligência de Conteúdo

## Diagnóstico

Hoje cada transcrição é fatiada em chunks (12k chars) e a IA extrai dezenas de "fatos" isolados (`candidate_knowledge`). Esses fatos viram cards soltos em **Memória**, sem o contexto da fala original. Resultado: parece descolado, repetitivo e sem narrativa. Nenhum outro fluxo (DNA, matérias, disparos, coringa) consegue voltar à fala completa para citar com fidelidade.

## Visão nova

A memória passa a ter **dois níveis**:

1. **Documento (transcrição inteira)** — unidade principal. Cada áudio vira 1 registro com texto integral + um **resumo estruturado** rico (gerado por IA em uma única passada, vendo o texto inteiro).
2. **Fatos** (mantidos) — viram índice navegável, sempre apontando de volta para o documento de origem (com timestamp do segmento).

Tudo isso fica disponível para os outros módulos como "banco de conhecimento do candidato".

## O que muda (alto nível)

### 1. Nova tabela `ic_knowledge_documents`
Um registro por transcrição (e no futuro: por post longo, discurso colado manualmente, entrevista em PDF). Campos principais:
- `titulo` (auto: "Live 06/05 — Saúde no Centro")
- `tipo_documento` (transcricao | discurso | entrevista | post_longo | manual)
- `data_evento`, `local`, `duracao_sec`
- `texto_integral` (a transcrição completa)
- `resumo_executivo` (3–5 linhas)
- `pontos_principais` (jsonb: lista ordenada de bullets)
- `propostas` (jsonb estruturado: título, descrição, bairro, prazo)
- `promessas`, `bandeiras`, `bordoes` (jsonb)
- `pessoas_citadas`, `bairros_citados`, `adversarios_citados` (jsonb)
- `numeros_e_dados` (jsonb)
- `tom_emocional` (esperançoso, indignado, etc.) e `tags`
- `transcription_id` (link para `ic_transcriptions`)
- `embedding` (vector, opcional, para busca semântica)
- `client_id`, `created_at`

### 2. `candidate_knowledge` ganha `document_id`
Os fatos continuam existindo (servem para busca rápida e agregações por bairro/tema), mas cada fato fica vinculado ao documento pai. Na UI, abrir um fato leva ao documento.

### 3. Pipeline de extração reformado (`ic-extract-knowledge`)
- Para `sourceType=transcription`, **uma única chamada LLM** vê o texto inteiro (até ~30k tokens nos modelos atuais — Gemini 1.5/2.0, Claude, GPT-4o suportam) e devolve **um JSON único e estruturado** = o resumo do documento.
- Se o texto exceder o limite do provedor escolhido, fazemos um **map-reduce explícito**: extrai por chunk → faz uma 2ª chamada de "consolidação" que recebe os resumos parciais e produz o documento final coeso (sem duplicatas, com narrativa). Não joga fatos soltos no banco.
- Os fatos extraídos são derivados desse resumo consolidado (não dos chunks crus), garantindo coerência.

### 4. Nova aba **Memória** redesenhada
Substitui a grade de cards solta por:
- **Lista de Documentos** (cards grandes, tipo "feed de conteúdo do candidato"): título, data, resumo executivo, badges com nº de propostas/bandeiras/bairros.
- Clicar abre **Drawer/Página do documento**:
  - Resumo executivo
  - Seções: Propostas | Promessas | Bandeiras | Bordões | Bairros | Pessoas | Números
  - Texto integral (com player do áudio se houver, e busca dentro do texto)
  - Botão "Reextrair com outro modelo"
  - Botão "Usar como base" → abre Estúdio/Matérias já com o contexto carregado
- Aba secundária **Fatos** (busca livre cross-documento) para quem quiser o modo antigo.

### 5. Integrações com outros fluxos
- **DNA**: passa a ler `pontos_principais` + `bordoes` agregados de todos os documentos (muito mais coeso que fatos avulsos).
- **Matérias** (`ic-write-materia`): recebe `document_id(s)` selecionados → o prompt é montado com o resumo estruturado + trechos do texto integral. Citações ficam fiéis.
- **Sugestões de disparo** (`ic-suggest-dispatches`): cruza `bairros_citados` com a base de pessoas por bairro.
- **Coringa-chat**: ganha ferramenta "buscar na memória" (RAG simples por documento + embedding opcional).
- **Radar/Ideias**: pode sugerir "retomar promessa feita em [documento X de 12/04]".

### 6. Migração dos dados existentes
- Script (edge function `ic-migrate-knowledge-to-documents`) que:
  - Para cada `ic_transcriptions` existente, cria 1 `ic_knowledge_documents` chamando o novo pipeline.
  - Re-vincula os `candidate_knowledge` antigos ao documento criado (por `source_id = transcription.id`).
- Roda sob demanda (botão "Migrar memória antiga" em SuperAdmin/Configurações).

## Ideias extras de melhoria (para lapidar a ferramenta)

1. **Linha do tempo do candidato**: timeline visual com todos os documentos por data → vira ativo de campanha.
2. **Detecção de contradições**: ao salvar novo documento, IA checa se há promessa anterior conflitante e alerta.
3. **Mapa de propostas por bairro**: alimenta o mapa territorial que já existe.
4. **Busca semântica** (embeddings com `pgvector`) — permite "o candidato já falou sobre creches no Bairro X?".
5. **Tags manuais + favoritos** por documento (ex: "discurso de palanque", "live íntima").
6. **Exportar livro de campanha**: gerar PDF com todas as propostas/promessas agrupadas por tema.
7. **Alerta de promessa repetida demais** (vira bordão) ou **abandonada** (não é citada há 30 dias).
8. **Áudio-âncora**: salvar URL do áudio original junto do documento + permitir tocar trecho de uma proposta específica (usando timestamps dos segments).
9. **Aprovação humana**: cada documento tem status (rascunho → revisado → publicado na memória), evitando "lixo" do LLM.
10. **Versionamento**: reextrair gera nova versão sem perder a anterior.

## Detalhes técnicos

- Migration: criar `ic_knowledge_documents` com RLS por `client_id` (mesmo padrão de `candidate_knowledge`).
- Adicionar coluna `document_id uuid references ic_knowledge_documents(id) on delete cascade` em `candidate_knowledge`.
- Refatorar `ic-extract-knowledge`: separar em `extractDocumentSummary()` (modo transcrição, single-shot ou map-reduce-consolidate) e manter `extractFacts()` derivando do resumo.
- Novo componente `DocumentoDetalhe.tsx` (drawer com seções).
- Refatorar `MemoriaPanel.tsx` em duas abas internas: **Documentos** (novo) e **Fatos** (atual).
- Atualizar `ic-write-materia` e `coringa-chat` para preferirem `ic_knowledge_documents` quando disponíveis.
- Embeddings ficam opcionais (etapa 2) — não bloquear o release principal.

## Entrega em fases

**Fase 1 (essencial):** tabela + pipeline single-shot/consolidação + nova UI de Memória (Documentos) + migração + matéria/coringa lendo documentos.
**Fase 2:** embeddings + busca semântica + detecção de contradições + timeline visual + exportar livro de campanha.

Posso começar pela Fase 1. Confirma?
