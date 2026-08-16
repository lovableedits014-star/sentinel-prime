ALTER TABLE public.eleicao_pessoas
  ADD COLUMN IF NOT EXISTS is_voluntario boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS voluntario_marcado_em timestamptz,
  ADD COLUMN IF NOT EXISTS voluntario_obs text;

CREATE INDEX IF NOT EXISTS idx_eleicao_pessoas_voluntario
  ON public.eleicao_pessoas (client_id, is_voluntario);