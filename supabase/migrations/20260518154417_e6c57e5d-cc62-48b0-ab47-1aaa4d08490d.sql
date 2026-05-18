DROP INDEX IF EXISTS public.narrativa_dossies_unique_ok;

CREATE UNIQUE INDEX narrativa_dossies_unique_pronto
  ON public.narrativa_dossies (client_id, uf, municipio)
  WHERE status = 'pronto';