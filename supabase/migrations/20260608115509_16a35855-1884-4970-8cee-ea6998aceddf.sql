
ALTER TABLE public.eleicao_cobranca_auto_config
  ADD COLUMN IF NOT EXISTS cascata boolean NOT NULL DEFAULT false;
