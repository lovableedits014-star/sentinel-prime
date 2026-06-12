ALTER TABLE public.eleicao_pessoas
  ADD COLUMN IF NOT EXISTS lat numeric,
  ADD COLUMN IF NOT EXISTS lng numeric,
  ADD COLUMN IF NOT EXISTS geocoded_at timestamptz,
  ADD COLUMN IF NOT EXISTS geocode_status text,
  ADD COLUMN IF NOT EXISTS geocode_endereco_hash text;

CREATE INDEX IF NOT EXISTS eleicao_pessoas_geo_idx
  ON public.eleicao_pessoas (client_id, lat, lng)
  WHERE lat IS NOT NULL AND lng IS NOT NULL;

CREATE INDEX IF NOT EXISTS eleicao_pessoas_geocode_pending_idx
  ON public.eleicao_pessoas (client_id)
  WHERE lat IS NULL AND (rua IS NOT NULL OR endereco IS NOT NULL OR bairro IS NOT NULL);