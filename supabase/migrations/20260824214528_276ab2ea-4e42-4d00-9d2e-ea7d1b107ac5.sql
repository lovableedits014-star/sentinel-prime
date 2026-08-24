ALTER TABLE public.eleicao_pessoas
  ADD COLUMN IF NOT EXISTS cpf text,
  ADD COLUMN IF NOT EXISTS rg text,
  ADD COLUMN IF NOT EXISTS rg_orgao_expedidor text,
  ADD COLUMN IF NOT EXISTS cep text;