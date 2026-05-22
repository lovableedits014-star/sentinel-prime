ALTER TABLE public.eleicao_notif_config
  ADD COLUMN IF NOT EXISTS envio_coordenador_ativo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS envio_lider_ativo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS envio_coord_boas_vindas_ativo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS envio_cabo_boas_vindas_ativo boolean NOT NULL DEFAULT true;