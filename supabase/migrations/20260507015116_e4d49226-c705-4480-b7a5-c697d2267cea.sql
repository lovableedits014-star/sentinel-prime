
CREATE TABLE IF NOT EXISTS public.ic_promessas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  prazo_texto TEXT,
  prazo_data DATE,
  bairro TEXT,
  beneficiario TEXT,
  status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','em_andamento','cumprida','quebrada','adiada')),
  tipo TEXT NOT NULL DEFAULT 'outro' CHECK (tipo IN ('saude','educacao','infraestrutura','seguranca','economia','social','meio_ambiente','outro')),
  documento_origem_id UUID REFERENCES public.ic_knowledge_documents(id) ON DELETE SET NULL,
  transcription_id UUID REFERENCES public.ic_transcriptions(id) ON DELETE SET NULL,
  evidencias JSONB NOT NULL DEFAULT '[]'::jsonb,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ic_promessas_client ON public.ic_promessas(client_id);
CREATE INDEX IF NOT EXISTS idx_ic_promessas_status ON public.ic_promessas(client_id, status);
CREATE INDEX IF NOT EXISTS idx_ic_promessas_prazo ON public.ic_promessas(client_id, prazo_data) WHERE prazo_data IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ic_promessas_bairro ON public.ic_promessas(client_id, bairro) WHERE bairro IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ic_promessas_doc ON public.ic_promessas(documento_origem_id);

ALTER TABLE public.ic_promessas ENABLE ROW LEVEL SECURITY;

-- Helper: usuário tem acesso ao cliente?
CREATE OR REPLACE FUNCTION public.user_has_client_access(_client_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clients WHERE id = _client_id AND user_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.team_members
    WHERE client_id = _client_id AND user_id = _user_id AND status = 'active'
  )
$$;

CREATE POLICY "ic_promessas_select" ON public.ic_promessas
  FOR SELECT TO authenticated
  USING (public.user_has_client_access(client_id, auth.uid()));

CREATE POLICY "ic_promessas_insert" ON public.ic_promessas
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_client_access(client_id, auth.uid()));

CREATE POLICY "ic_promessas_update" ON public.ic_promessas
  FOR UPDATE TO authenticated
  USING (public.user_has_client_access(client_id, auth.uid()));

CREATE POLICY "ic_promessas_delete" ON public.ic_promessas
  FOR DELETE TO authenticated
  USING (public.user_has_client_access(client_id, auth.uid()));

CREATE TRIGGER trg_ic_promessas_updated_at
  BEFORE UPDATE ON public.ic_promessas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
