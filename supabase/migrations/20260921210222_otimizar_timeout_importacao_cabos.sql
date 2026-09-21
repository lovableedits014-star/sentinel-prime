-- Evita que a politica RLS recursiva de eleicao_pessoas seja reavaliada para
-- cada CPF/telefone durante a analise e para cada item durante a confirmacao.
-- As duas funcoes validam is_client_member antes de acessar qualquer lote ou
-- pessoa, possuem search_path vazio e continuam indisponiveis para anon/PUBLIC.

ALTER FUNCTION public.eleicao_cabo_import_analisar(
  uuid,text,text,numeric,date,date,uuid,text,text,text,jsonb
) SECURITY DEFINER;

ALTER FUNCTION public.eleicao_cabo_import_confirmar(uuid)
  SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.eleicao_cabo_import_analisar(
  uuid,text,text,numeric,date,date,uuid,text,text,text,jsonb
) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.eleicao_cabo_import_confirmar(uuid)
  FROM PUBLIC,anon;

GRANT EXECUTE ON FUNCTION public.eleicao_cabo_import_analisar(
  uuid,text,text,numeric,date,date,uuid,text,text,text,jsonb
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.eleicao_cabo_import_confirmar(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.eleicao_cabo_import_analisar(
  uuid,text,text,numeric,date,date,uuid,text,text,text,jsonb
) IS 'Analisa importacao de cabos com isolamento por cliente e sem sobrecarga da RLS recursiva.';

COMMENT ON FUNCTION public.eleicao_cabo_import_confirmar(uuid)
  IS 'Confirma importacao de cabos com isolamento por cliente e revalidacao transacional de duplicidades.';

NOTIFY pgrst,'reload schema';
