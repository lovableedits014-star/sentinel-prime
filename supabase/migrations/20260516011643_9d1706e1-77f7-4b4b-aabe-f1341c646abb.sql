-- Onda 5: tabela de auditoria de eventos de segurança
-- Insert-only para service role; SELECT apenas para super_admin.
-- Rollback: DROP TABLE public.security_events;

CREATE TABLE IF NOT EXISTS public.security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  user_id uuid,
  target_user_id uuid,
  client_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address text,
  user_agent text,
  at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_security_events_at ON public.security_events(at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_event_type ON public.security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_user_id ON public.security_events(user_id);
CREATE INDEX IF NOT EXISTS idx_security_events_client_id ON public.security_events(client_id);

ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

-- SELECT: apenas super_admin
CREATE POLICY "security_events_select_super_admin"
  ON public.security_events
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin());

-- INSERT/UPDATE/DELETE: nenhuma policy criada → service role bypassa RLS,
-- usuários autenticados/anon ficam bloqueados por padrão.

COMMENT ON TABLE public.security_events IS
  'Auditoria de eventos sensíveis. Insert via service role em Edge Functions; SELECT apenas para super_admin.';