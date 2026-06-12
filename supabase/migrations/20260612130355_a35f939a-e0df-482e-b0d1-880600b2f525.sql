
UPDATE public.eleicao_pessoas
SET lat = NULL,
    lng = NULL,
    geocode_status = NULL,
    geocoded_at = NULL,
    geocode_endereco_hash = NULL
WHERE cidade IS NOT NULL
  AND trim(cidade) <> ''
  AND lower(unaccent(trim(cidade))) <> lower(unaccent('Campo Grande'))
  AND lat IS NOT NULL
  AND lng IS NOT NULL
  AND lat BETWEEN -21.05 AND -20.20
  AND lng BETWEEN -55.00 AND -54.30;
