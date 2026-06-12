-- Limpa geocodificações fora da região de Campo Grande/MS para serem reprocessadas
UPDATE public.eleicao_pessoas
SET lat = NULL, lng = NULL, geocode_status = 'reset_out_of_region', geocoded_at = NULL, geocode_endereco_hash = NULL
WHERE lat IS NOT NULL
  AND (lat NOT BETWEEN -21.0 AND -19.0 OR lng NOT BETWEEN -55.5 AND -53.5);