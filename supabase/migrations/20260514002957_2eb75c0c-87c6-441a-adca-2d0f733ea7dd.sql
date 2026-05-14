CREATE TABLE IF NOT EXISTS public.eleicao_notif_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  pessoa_id uuid REFERENCES public.eleicao_pessoas(id) ON DELETE SET NULL,
  destinatario_tipo text NOT NULL,
  destinatario_nome text,
  destinatario_telefone text,
  mensagem text,
  success boolean NOT NULL DEFAULT false,
  skipped_reason text,
  error_message text,
  message_id text,
  preflight_status text,
  bridge_status integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eleicao_notif_log_client ON public.eleicao_notif_log(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_eleicao_notif_log_pessoa ON public.eleicao_notif_log(pessoa_id, created_at DESC);

ALTER TABLE public.eleicao_notif_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner can view notif log" ON public.eleicao_notif_log;
CREATE POLICY "owner can view notif log" ON public.eleicao_notif_log
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.clients c WHERE c.id = eleicao_notif_log.client_id AND c.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "service can insert notif log" ON public.eleicao_notif_log;
CREATE POLICY "service can insert notif log" ON public.eleicao_notif_log
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.clients c WHERE c.id = eleicao_notif_log.client_id AND c.user_id = auth.uid()
  ));