
CREATE TABLE IF NOT EXISTS public.eleicao_cobranca_auto_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  ativo boolean NOT NULL DEFAULT false,
  frequencia text NOT NULL DEFAULT 'semanal',
  dias_semana int[] NOT NULL DEFAULT ARRAY[1,3,5],
  hora_envio time NOT NULL DEFAULT '10:00',
  filtro_tipo text,
  filtro_status text NOT NULL DEFAULT 'abaixo',
  mensagem_template text NOT NULL DEFAULT 'Olá {primeiro_nome}! Faltam {faltam} indicações para sua meta de {meta} para {candidato}. Use seu link: {link}',
  janela_horas int NOT NULL DEFAULT 48,
  max_por_disparo int NOT NULL DEFAULT 300,
  ultimo_disparo_em timestamptz,
  proximo_disparo_em timestamptz,
  ultimo_resultado text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eleicao_cob_auto_freq_chk CHECK (frequencia IN ('diaria','semanal')),
  CONSTRAINT eleicao_cob_auto_status_chk CHECK (filtro_status IN ('all','zerados','abaixo','ok'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.eleicao_cobranca_auto_config TO authenticated;
GRANT ALL ON public.eleicao_cobranca_auto_config TO service_role;

ALTER TABLE public.eleicao_cobranca_auto_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auto_cob_select_own_client" ON public.eleicao_cobranca_auto_config
  FOR SELECT TO authenticated USING (public.user_can_access_client(client_id));

CREATE POLICY "auto_cob_insert_own_client" ON public.eleicao_cobranca_auto_config
  FOR INSERT TO authenticated WITH CHECK (public.user_can_access_client(client_id));

CREATE POLICY "auto_cob_update_own_client" ON public.eleicao_cobranca_auto_config
  FOR UPDATE TO authenticated
  USING (public.user_can_access_client(client_id))
  WITH CHECK (public.user_can_access_client(client_id));

CREATE POLICY "auto_cob_delete_own_client" ON public.eleicao_cobranca_auto_config
  FOR DELETE TO authenticated USING (public.user_can_access_client(client_id));

CREATE OR REPLACE FUNCTION public.update_eleicao_cob_auto_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_eleicao_cob_auto_updated_at ON public.eleicao_cobranca_auto_config;
CREATE TRIGGER trg_eleicao_cob_auto_updated_at
  BEFORE UPDATE ON public.eleicao_cobranca_auto_config
  FOR EACH ROW EXECUTE FUNCTION public.update_eleicao_cob_auto_updated_at();
