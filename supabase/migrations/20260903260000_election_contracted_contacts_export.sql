-- Fonte canonica para exportar todos os contratados da Eleicao para a agenda.
-- Um telefone repetido aparece uma unica vez e somente cadastros ativos,
-- remunerados e nao voluntarios entram no arquivo.
CREATE OR REPLACE FUNCTION public.eleicao_listar_contratados_exportacao(
  _client_id uuid
)
RETURNS TABLE(
  pessoa_id uuid,
  nome text,
  telefone text,
  tipo text,
  bairro text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $function$
BEGIN
  IF NOT public.is_client_member(_client_id) THEN
    RAISE EXCEPTION 'Sem permissao';
  END IF;

  RETURN QUERY
  WITH elegiveis AS (
    SELECT p.id,p.nome,p.telefone,p.tipo::text tipo,p.bairro,p.created_at,
      public.tele_phone_key(p.telefone) telefone_key
    FROM public.eleicao_pessoas p
    WHERE p.client_id=_client_id
      AND p.arquivado_em IS NULL
      AND NOT coalesce(p.is_voluntario,false)
      AND coalesce(p.valor_contratacao,0)>0
      AND public.tele_phone_key(p.telefone) IS NOT NULL
  ), unicos AS (
    SELECT DISTINCT ON(e.telefone_key) e.*
    FROM elegiveis e
    ORDER BY e.telefone_key,e.created_at DESC,e.id
  )
  SELECT u.id,u.nome,u.telefone,u.tipo,u.bairro
  FROM unicos u
  ORDER BY u.nome;
END;
$function$;

REVOKE ALL ON FUNCTION public.eleicao_listar_contratados_exportacao(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.eleicao_listar_contratados_exportacao(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
