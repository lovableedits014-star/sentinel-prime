ALTER TABLE public.ic_knowledge_documents
  ADD COLUMN IF NOT EXISTS source_ref text,
  ADD COLUMN IF NOT EXISTS source_url text;

CREATE INDEX IF NOT EXISTS idx_ic_knowledge_documents_source_ref
  ON public.ic_knowledge_documents (client_id, source_ref);