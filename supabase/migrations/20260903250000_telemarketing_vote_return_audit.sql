-- Auditoria canonica de votos em toda a base do telemarketing. Telefones
-- repetidos entre fontes contam uma unica vez e prevalece a resposta atendida
-- mais recente. Somente "sim" e "nao" compoem os dois totais finais.
CREATE OR REPLACE FUNCTION public.telemarketing_vote_return_audit(p_client_id uuid)
RETURNS TABLE(
  votos_confirmados integer,
  devolutivas_negativas integer,
  respostas_validas integer,
  telefones_duplicados integer,
  confirmados_vinculados_eleicao integer,
  negativas_vinculadas_eleicao integer,
  por_origem jsonb,
  atualizado_em timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $function$
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN
    RAISE EXCEPTION 'Sem permissao';
  END IF;

  RETURN QUERY
  WITH raw AS MATERIALIZED (
    SELECT r.*,
      coalesce(public.tele_phone_key(r.telefone),r.tabela||':'||r.contato_id::text) pessoa_key
    FROM public.tele_fila_report_rows_v2(p_client_id,NULL) r
    WHERE r.ligacao_status='atendeu' AND r.vota_candidato IN('sim','nao')
  ), canonical AS MATERIALIZED (
    SELECT DISTINCT ON(r.pessoa_key) r.*
    FROM raw r
    ORDER BY r.pessoa_key,r.ligacao_em DESC NULLS LAST,r.contato_id
  ), origins AS (
    SELECT coalesce(jsonb_object_agg(x.tabela,jsonb_build_object(
      'confirmados',x.confirmados,'negativas',x.negativas,'total',x.total
    )),'{}'::jsonb) value
    FROM (
      SELECT c.tabela,count(*) FILTER(WHERE c.vota_candidato='sim')::integer confirmados,
        count(*) FILTER(WHERE c.vota_candidato='nao')::integer negativas,count(*)::integer total
      FROM canonical c GROUP BY c.tabela ORDER BY c.tabela
    ) x
  )
  SELECT (SELECT count(*) FROM canonical c WHERE c.vota_candidato='sim')::integer,
    (SELECT count(*) FROM canonical c WHERE c.vota_candidato='nao')::integer,
    (SELECT count(*) FROM canonical)::integer,
    ((SELECT count(*) FROM raw)-(SELECT count(*) FROM canonical))::integer,
    (SELECT count(*) FROM canonical c WHERE c.tabela='eleicao_indicados' AND c.vota_candidato='sim')::integer,
    (SELECT count(*) FROM canonical c WHERE c.tabela='eleicao_indicados' AND c.vota_candidato='nao')::integer,
    o.value,now()
  FROM origins o;
END;
$function$;

REVOKE ALL ON FUNCTION public.telemarketing_vote_return_audit(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.telemarketing_vote_return_audit(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
