CREATE TABLE IF NOT EXISTS public.ic_drift_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  tema text NOT NULL,
  periodo_inicio date NOT NULL,
  periodo_fim date NOT NULL,
  tipo_mudanca text NOT NULL DEFAULT 'mudanca',
  severidade text NOT NULL DEFAULT 'media',
  titulo text NOT NULL,
  descricao text NOT NULL,
  exemplos jsonb NOT NULL DEFAULT '[]'::jsonb,
  documentos_analisados int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'novo',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drift_client_created ON public.ic_drift_analyses(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_drift_client_tema ON public.ic_drift_analyses(client_id, tema);
CREATE INDEX IF NOT EXISTS idx_drift_periodo ON public.ic_drift_analyses(client_id, periodo_fim DESC);

ALTER TABLE public.ic_drift_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "drift_select" ON public.ic_drift_analyses
  FOR SELECT TO authenticated
  USING (public.user_has_client_access(client_id, auth.uid()) OR public.is_super_admin());

CREATE POLICY "drift_insert" ON public.ic_drift_analyses
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_client_access(client_id, auth.uid()) OR public.is_super_admin());

CREATE POLICY "drift_update" ON public.ic_drift_analyses
  FOR UPDATE TO authenticated
  USING (public.user_has_client_access(client_id, auth.uid()) OR public.is_super_admin())
  WITH CHECK (public.user_has_client_access(client_id, auth.uid()) OR public.is_super_admin());

CREATE POLICY "drift_delete" ON public.ic_drift_analyses
  FOR DELETE TO authenticated
  USING (public.user_has_client_access(client_id, auth.uid()) OR public.is_super_admin());

CREATE TRIGGER trg_drift_set_updated_at
  BEFORE UPDATE ON public.ic_drift_analyses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();