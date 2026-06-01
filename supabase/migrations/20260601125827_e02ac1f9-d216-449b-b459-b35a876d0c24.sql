-- Controle global de cadastros (no painel de configurações da eleição)
ALTER TABLE public.eleicao_notif_config
  ADD COLUMN IF NOT EXISTS cadastro_lider_ativo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS cadastro_cabo_ativo  boolean NOT NULL DEFAULT true;

-- Controle individual por coordenador
ALTER TABLE public.eleicao_pessoas
  ADD COLUMN IF NOT EXISTS pode_cadastrar_lider boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pode_cadastrar_cabo  boolean NOT NULL DEFAULT true;

-- Função helper: o coordenador (auth.uid) pode cadastrar pessoa do tipo informado?
CREATE OR REPLACE FUNCTION public.coordenador_pode_cadastrar(
  _client_id uuid,
  _coord_id uuid,
  _tipo text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _tipo = 'lider' THEN
      COALESCE((SELECT cadastro_lider_ativo FROM public.eleicao_notif_config WHERE client_id = _client_id), true)
      AND COALESCE((SELECT pode_cadastrar_lider FROM public.eleicao_pessoas WHERE id = _coord_id AND tipo = 'coordenador'), true)
    WHEN _tipo = 'cabo' THEN
      COALESCE((SELECT cadastro_cabo_ativo FROM public.eleicao_notif_config WHERE client_id = _client_id), true)
      AND COALESCE((SELECT pode_cadastrar_cabo FROM public.eleicao_pessoas WHERE id = _coord_id AND tipo = 'coordenador'), true)
    ELSE true
  END;
$$;