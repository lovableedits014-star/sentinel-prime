
-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column (Gemini text-embedding-004 = 768 dims)
ALTER TABLE public.ic_knowledge_documents
  ADD COLUMN IF NOT EXISTS embedding vector(768),
  ADD COLUMN IF NOT EXISTS embedding_model text,
  ADD COLUMN IF NOT EXISTS embedded_at timestamptz;

-- Index for cosine similarity search
CREATE INDEX IF NOT EXISTS idx_ic_knowledge_documents_embedding
  ON public.ic_knowledge_documents
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- RPC: semantic search scoped by client
CREATE OR REPLACE FUNCTION public.match_ic_documents(
  p_client_id uuid,
  query_embedding vector(768),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  titulo text,
  tipo_documento text,
  data_evento date,
  local text,
  resumo_executivo text,
  tags text[],
  created_at timestamptz,
  similarity float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    d.id,
    d.titulo,
    d.tipo_documento,
    d.data_evento,
    d.local,
    d.resumo_executivo,
    d.tags,
    d.created_at,
    1 - (d.embedding <=> query_embedding) AS similarity
  FROM public.ic_knowledge_documents d
  WHERE d.client_id = p_client_id
    AND d.embedding IS NOT NULL
    AND 1 - (d.embedding <=> query_embedding) > match_threshold
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
$$;
