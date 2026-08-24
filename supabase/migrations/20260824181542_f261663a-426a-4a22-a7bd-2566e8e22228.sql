CREATE OR REPLACE FUNCTION public.tele_indicador_scorecard(_client_id uuid, _campanha_id uuid DEFAULT NULL::uuid, _indicador_tipo text DEFAULT NULL::text)
 RETURNS TABLE(indicador_id uuid, indicador_nome text, indicador_tipo text, total_indicados bigint, ligados bigint, confirmados bigint, rejeitados bigint, indecisos bigint, recusou bigint, nao_atendeu bigint, invalidos bigint, taxa_confirmacao numeric, taxa_voto_efetivo numeric, score_qualidade numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id=_client_id AND c.user_id=auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN QUERY
  WITH agg AS (
    SELECT
      ei.indicador_id,
      ei.indicador_tipo::text AS itipo,
      count(*) AS total_indicados,
      count(*) FILTER (WHERE ei.ultima_ligacao_em IS NOT NULL) AS ligados,
      count(*) FILTER (WHERE ei.vota_candidato = 'sim') AS confirmados,
      count(*) FILTER (WHERE ei.vota_candidato = 'nao') AS rejeitados,
      count(*) FILTER (WHERE ei.vota_candidato = 'indeciso') AS indecisos,
      count(*) FILTER (WHERE ei.ultimo_status_ligacao = 'recusou') AS recusou,
      count(*) FILTER (WHERE ei.ultimo_status_ligacao = 'nao_atendeu') AS nao_atendeu,
      count(*) FILTER (WHERE ei.ultimo_status_ligacao IN ('invalido','numero_invalido')
                          OR ei.status_telemarketing = 'invalido') AS invalidos
    FROM public.eleicao_indicados ei
    WHERE ei.client_id = _client_id
      AND ei.indicador_id IS NOT NULL
      AND (_campanha_id IS NULL OR ei.campanha_id = _campanha_id)
      AND (_indicador_tipo IS NULL OR ei.indicador_tipo::text = _indicador_tipo)
    GROUP BY ei.indicador_id, ei.indicador_tipo
  )
  SELECT
    a.indicador_id,
    ep.nome,
    a.itipo,
    a.total_indicados,
    a.ligados,
    a.confirmados,
    a.rejeitados,
    a.indecisos,
    a.recusou,
    a.nao_atendeu,
    a.invalidos,
    CASE WHEN a.ligados > 0 THEN round((a.confirmados::numeric / a.ligados) * 100, 2) ELSE 0 END,
    CASE WHEN a.total_indicados > 0 THEN round((a.confirmados::numeric / a.total_indicados) * 100, 2) ELSE 0 END,
    CASE WHEN a.total_indicados > 0
      THEN round(((a.confirmados::numeric - a.rejeitados - (a.invalidos * 0.5)) / a.total_indicados) * 100, 2)
      ELSE 0 END
  FROM agg a
  LEFT JOIN public.eleicao_pessoas ep ON ep.id = a.indicador_id
  ORDER BY a.confirmados DESC, a.total_indicados DESC;
END;
$function$;