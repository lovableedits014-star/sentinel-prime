
CREATE TABLE IF NOT EXISTS public.ic_memoria_insights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  titulo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  prioridade TEXT NOT NULL DEFAULT 'media' CHECK (prioridade IN ('alta','media','baixa')),
  dados JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'novo' CHECK (status IN ('novo','aceito','descartado','virou_pauta')),
  acao_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ic_insights_client_status ON public.ic_memoria_insights(client_id, status, created_at DESC);

ALTER TABLE public.ic_memoria_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ic_insights_select" ON public.ic_memoria_insights
  FOR SELECT TO authenticated
  USING (public.user_has_client_access(client_id, auth.uid()));
CREATE POLICY "ic_insights_insert" ON public.ic_memoria_insights
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_client_access(client_id, auth.uid()));
CREATE POLICY "ic_insights_update" ON public.ic_memoria_insights
  FOR UPDATE TO authenticated
  USING (public.user_has_client_access(client_id, auth.uid()));
CREATE POLICY "ic_insights_delete" ON public.ic_memoria_insights
  FOR DELETE TO authenticated
  USING (public.user_has_client_access(client_id, auth.uid()));

CREATE TRIGGER trg_ic_insights_updated_at
  BEFORE UPDATE ON public.ic_memoria_insights
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
