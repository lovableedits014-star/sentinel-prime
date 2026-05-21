
ALTER TABLE public.eleicao_notif_config
  ADD COLUMN IF NOT EXISTS grupos_jids jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.whatsapp_group_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  instance_id uuid NOT NULL,
  group_jid text NOT NULL,
  phone_e164 text,
  raw_jid text NOT NULL,
  is_lid_only boolean NOT NULL DEFAULT false,
  is_admin boolean NOT NULL DEFAULT false,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  left_seen_at timestamptz,
  CONSTRAINT whatsapp_group_participants_unique UNIQUE (instance_id, group_jid, raw_jid)
);

CREATE INDEX IF NOT EXISTS idx_wgp_client_group_phone
  ON public.whatsapp_group_participants (client_id, group_jid, phone_e164);

ALTER TABLE public.whatsapp_group_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wgp_select" ON public.whatsapp_group_participants;
CREATE POLICY "wgp_select" ON public.whatsapp_group_participants
  FOR SELECT TO authenticated
  USING (is_super_admin() OR user_can_access_client(client_id));

CREATE TABLE IF NOT EXISTS public.eleicao_pessoa_grupo_status (
  pessoa_id uuid PRIMARY KEY REFERENCES public.eleicao_pessoas(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  group_jid text,
  status text NOT NULL,
  entrou_visto_em timestamptz,
  saiu_visto_em timestamptz,
  verificado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_epgs_client_status
  ON public.eleicao_pessoa_grupo_status (client_id, status);

ALTER TABLE public.eleicao_pessoa_grupo_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "epgs_select" ON public.eleicao_pessoa_grupo_status;
CREATE POLICY "epgs_select" ON public.eleicao_pessoa_grupo_status
  FOR SELECT TO authenticated
  USING (is_super_admin() OR user_can_access_client(client_id));
