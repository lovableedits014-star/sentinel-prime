
-- 1) Endereço estruturado em eleicao_pessoas
ALTER TABLE public.eleicao_pessoas
  ADD COLUMN IF NOT EXISTS rua text,
  ADD COLUMN IF NOT EXISTS numero text,
  ADD COLUMN IF NOT EXISTS bairro text;

-- 2) Configurações de notificações automáticas por client
CREATE TABLE IF NOT EXISTS public.eleicao_notif_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  secretaria_telefone text,
  auto_enviar boolean NOT NULL DEFAULT true,
  template_coordenador text NOT NULL DEFAULT
    'Foi adicionado novo líder na região: *{regiao}*' || E'\n\n' ||
    'Nome: {nome}' || E'\n' ||
    'Telefone: {telefone}' || E'\n' ||
    'Rua: {rua}, {numero}' || E'\n' ||
    'Bairro: {bairro}',
  template_lider text NOT NULL DEFAULT
    'Olá {nome}! Você foi cadastrado como líder na região *{regiao}*.' || E'\n\n' ||
    'Entre no grupo da região para receber as orientações:' || E'\n' ||
    '{link_grupo}',
  grupos_links jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id)
);

ALTER TABLE public.eleicao_notif_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_config_select" ON public.eleicao_notif_config;
CREATE POLICY "notif_config_select" ON public.eleicao_notif_config
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.user_can_access_client(client_id));

DROP POLICY IF EXISTS "notif_config_insert" ON public.eleicao_notif_config;
CREATE POLICY "notif_config_insert" ON public.eleicao_notif_config
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR public.user_can_access_client(client_id));

DROP POLICY IF EXISTS "notif_config_update" ON public.eleicao_notif_config;
CREATE POLICY "notif_config_update" ON public.eleicao_notif_config
  FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR public.user_can_access_client(client_id))
  WITH CHECK (public.is_super_admin() OR public.user_can_access_client(client_id));

DROP POLICY IF EXISTS "notif_config_delete" ON public.eleicao_notif_config;
CREATE POLICY "notif_config_delete" ON public.eleicao_notif_config
  FOR DELETE TO authenticated
  USING (public.is_super_admin() OR public.user_can_access_client(client_id));

DROP TRIGGER IF EXISTS trg_eleicao_notif_config_updated ON public.eleicao_notif_config;
CREATE TRIGGER trg_eleicao_notif_config_updated
  BEFORE UPDATE ON public.eleicao_notif_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
