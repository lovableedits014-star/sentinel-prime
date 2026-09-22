-- Os seletores antigos recebiam uma linha por responsavel e eram truncados
-- pelo limite de linhas do PostgREST. Esta RPC devolve um unico JSONB e tambem
-- consulta a tabela correta para cada origem da fila.

CREATE OR REPLACE FUNCTION public.tele_list_responsaveis_fila(
  _client_id uuid,
  _origem text
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public._tele_assert_client_admin(_client_id);

  IF _origem IN ('estrutura','indicados_eleicao') THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id',p.id,'nome',p.nome,'tipo',p.tipo::text,'cidade',p.cidade
    ) ORDER BY p.nome,p.id),'[]'::jsonb)
    INTO v_result
    FROM public.eleicao_pessoas p
    WHERE p.client_id=_client_id AND p.arquivado_em IS NULL;
  ELSIF _origem='contratados' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id',c.id,'nome',c.nome,'tipo','lider','cidade',c.cidade
    ) ORDER BY c.nome,c.id),'[]'::jsonb)
    INTO v_result
    FROM public.contratados c
    WHERE c.client_id=_client_id AND c.status='ativo'
      AND coalesce(c.is_lider,false);
  ELSIF _origem='indicados_contratados' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id',c.id,'nome',c.nome,
      'tipo',CASE WHEN coalesce(c.is_lider,false) THEN 'lider' ELSE 'contratado' END,
      'cidade',c.cidade
    ) ORDER BY c.nome,c.id),'[]'::jsonb)
    INTO v_result
    FROM public.contratados c
    WHERE c.client_id=_client_id AND c.status='ativo';
  ELSE
    v_result:='[]'::jsonb;
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.tele_list_responsaveis_fila(uuid,text)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tele_list_responsaveis_fila(uuid,text)
  TO authenticated,service_role;

COMMENT ON FUNCTION public.tele_list_responsaveis_fila(uuid,text) IS
  'Lista todos os responsaveis validos para a origem da fila em uma unica resposta JSONB.';

NOTIFY pgrst,'reload schema';
