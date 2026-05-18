DELETE FROM public.narrativa_dossies;

CREATE UNIQUE INDEX IF NOT EXISTS narrativa_dossies_unique_ok
  ON public.narrativa_dossies (client_id, uf, municipio)
  WHERE status IN ('ok','gerado','concluido');