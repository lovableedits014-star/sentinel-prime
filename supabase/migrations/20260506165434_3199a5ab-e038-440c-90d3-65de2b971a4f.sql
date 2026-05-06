
CREATE TABLE IF NOT EXISTS public.ic_knowledge_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  transcription_id uuid REFERENCES public.ic_transcriptions(id) ON DELETE SET NULL,
  tipo_documento text NOT NULL DEFAULT 'transcricao',
  titulo text NOT NULL,
  data_evento timestamptz,
  local text,
  duracao_sec numeric,
  texto_integral text NOT NULL,
  resumo_executivo text,
  pontos_principais jsonb NOT NULL DEFAULT '[]'::jsonb,
  propostas jsonb NOT NULL DEFAULT '[]'::jsonb,
  promessas jsonb NOT NULL DEFAULT '[]'::jsonb,
  bandeiras jsonb NOT NULL DEFAULT '[]'::jsonb,
  bordoes jsonb NOT NULL DEFAULT '[]'::jsonb,
  pessoas_citadas jsonb NOT NULL DEFAULT '[]'::jsonb,
  bairros_citados jsonb NOT NULL DEFAULT '[]'::jsonb,
  adversarios_citados jsonb NOT NULL DEFAULT '[]'::jsonb,
  numeros_e_dados jsonb NOT NULL DEFAULT '[]'::jsonb,
  tom_emocional text,
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  status text NOT NULL DEFAULT 'rascunho',
  audio_url text,
  provider text,
  model text,
  extraction_run_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ic_knowledge_documents_client ON public.ic_knowledge_documents(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ic_knowledge_documents_transcription ON public.ic_knowledge_documents(transcription_id);

ALTER TABLE public.ic_knowledge_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ikd_manage" ON public.ic_knowledge_documents;
CREATE POLICY "ikd_manage" ON public.ic_knowledge_documents
  FOR ALL TO authenticated
  USING ((client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())) OR public.is_super_admin())
  WITH CHECK ((client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())) OR public.is_super_admin());

DROP POLICY IF EXISTS "ikd_team_view" ON public.ic_knowledge_documents;
CREATE POLICY "ikd_team_view" ON public.ic_knowledge_documents
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.team_members tm
    WHERE tm.client_id = ic_knowledge_documents.client_id AND tm.user_id = auth.uid() AND tm.status = 'active'));

CREATE TRIGGER trg_ic_knowledge_documents_updated
  BEFORE UPDATE ON public.ic_knowledge_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.candidate_knowledge
  ADD COLUMN IF NOT EXISTS document_id uuid REFERENCES public.ic_knowledge_documents(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_candidate_knowledge_document ON public.candidate_knowledge(document_id);
