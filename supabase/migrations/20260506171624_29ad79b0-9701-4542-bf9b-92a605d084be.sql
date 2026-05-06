
CREATE TABLE IF NOT EXISTS public.ic_document_contradictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  document_a_id uuid NOT NULL REFERENCES public.ic_knowledge_documents(id) ON DELETE CASCADE,
  document_b_id uuid NOT NULL REFERENCES public.ic_knowledge_documents(id) ON DELETE CASCADE,
  tema text,
  tipo text,
  trecho_a text,
  trecho_b text,
  explicacao text NOT NULL,
  severidade text NOT NULL DEFAULT 'media',
  status text NOT NULL DEFAULT 'aberta',
  detected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ic_doc_contradictions_pair_unique UNIQUE (client_id, document_a_id, document_b_id, tema)
);

CREATE INDEX IF NOT EXISTS idx_ic_doc_contradictions_client ON public.ic_document_contradictions(client_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_ic_doc_contradictions_doc_a ON public.ic_document_contradictions(document_a_id);
CREATE INDEX IF NOT EXISTS idx_ic_doc_contradictions_doc_b ON public.ic_document_contradictions(document_b_id);

ALTER TABLE public.ic_document_contradictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ic_doc_contradictions_select_by_client_access"
ON public.ic_document_contradictions FOR SELECT
USING (EXISTS (SELECT 1 FROM public.ic_knowledge_documents d WHERE d.id = document_a_id));

CREATE POLICY "ic_doc_contradictions_all_service"
ON public.ic_document_contradictions FOR ALL
USING (true) WITH CHECK (true);
