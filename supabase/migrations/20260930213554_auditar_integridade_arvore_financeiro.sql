-- Pagina de cadastros: ordenacao deterministica para paginacao e auditoria
-- canonica de quantidade, hierarquia e investimento.

CREATE OR REPLACE FUNCTION public.get_eleicao_pessoas_for_client(_client_id uuid)
RETURNS SETOF public.eleicao_pessoas
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT ep.*
  FROM public.eleicao_pessoas ep
  WHERE ep.client_id = _client_id
    AND public.user_can_access_client(_client_id)
  ORDER BY ep.created_at DESC, ep.id DESC;
$$;

REVOKE ALL ON FUNCTION public.get_eleicao_pessoas_for_client(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_eleicao_pessoas_for_client(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.eleicao_auditar_integridade_cadastros(
  p_client_id uuid
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH pessoas AS (
    SELECT p.*
    FROM public.eleicao_pessoas p
    WHERE p.client_id = p_client_id
      AND public.user_can_access_client(p_client_id)
  ), ativos AS (
    SELECT *
    FROM pessoas
    WHERE arquivado_em IS NULL
  ), auditoria AS (
    SELECT
      count(*)::integer AS total_registros,
      count(*) FILTER (WHERE arquivado_em IS NULL)::integer AS total_ativos,
      count(*) FILTER (
        WHERE arquivado_em IS NULL AND tipo::text = 'coordenador'
      )::integer AS coordenadores_ativos,
      count(*) FILTER (
        WHERE arquivado_em IS NULL AND tipo::text = 'lider'
      )::integer AS lideres_ativos,
      count(*) FILTER (
        WHERE arquivado_em IS NULL AND tipo::text = 'cabo'
      )::integer AS cabos_ativos,
      count(*) FILTER (
        WHERE arquivado_em IS NULL
          AND NOT coalesce(is_voluntario, false)
          AND coalesce(valor_contratacao, 0) > 0
      )::integer AS contratos_remunerados,
      coalesce(sum(
        CASE
          WHEN arquivado_em IS NULL AND NOT coalesce(is_voluntario, false)
            THEN coalesce(valor_contratacao, 0)
          ELSE 0
        END
      ), 0)::numeric AS investimento_ativo
    FROM pessoas
  ), vinculos AS (
    SELECT count(*)::integer AS vinculos_invalidos
    FROM ativos filho
    LEFT JOIN ativos pai
      ON pai.id = filho.parent_id
      AND pai.client_id = filho.client_id
    WHERE filho.parent_id IS NOT NULL
      AND (
        pai.id IS NULL
        OR (filho.tipo::text = 'lider' AND pai.tipo::text <> 'coordenador')
        OR (filho.tipo::text = 'cabo' AND pai.tipo::text NOT IN ('coordenador', 'lider'))
        OR filho.escopo IS DISTINCT FROM pai.escopo
        OR (filho.escopo::text = 'campo_grande' AND filho.regiao IS DISTINCT FROM pai.regiao)
        OR (filho.escopo::text = 'interior' AND filho.cidade IS DISTINCT FROM pai.cidade)
      )
  )
  SELECT jsonb_build_object(
    'total_registros', a.total_registros,
    'total_ativos', a.total_ativos,
    'coordenadores_ativos', a.coordenadores_ativos,
    'lideres_ativos', a.lideres_ativos,
    'cabos_ativos', a.cabos_ativos,
    'contratos_remunerados', a.contratos_remunerados,
    'investimento_ativo', a.investimento_ativo,
    'vinculos_invalidos', v.vinculos_invalidos
  )
  FROM auditoria a
  CROSS JOIN vinculos v;
$$;

REVOKE ALL ON FUNCTION public.eleicao_auditar_integridade_cadastros(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eleicao_auditar_integridade_cadastros(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.eleicao_auditar_integridade_cadastros(uuid) IS
  'Reconcilia todos os cadastros, ativos, contratos remunerados, investimento e vinculos invalidos.';

NOTIFY pgrst, 'reload schema';
