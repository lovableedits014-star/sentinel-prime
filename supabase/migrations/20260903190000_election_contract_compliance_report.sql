-- Relatorio gerencial dos contratados da Eleicao.
-- Une estrutura, obrigacoes/conclusoes das missoes e listas de indicados sem
-- perder contratados com resultado zero no periodo.
CREATE OR REPLACE FUNCTION public.election_contract_compliance_report(
  p_client_id uuid,
  p_data_inicio date,
  p_data_fim date
)
RETURNS TABLE(
  pessoa_id uuid,
  nome text,
  telefone text,
  cargo text,
  escopo text,
  regiao text,
  cidade text,
  parent_id uuid,
  responsavel_nome text,
  coordenador_id uuid,
  coordenador_nome text,
  coordenador_telefone text,
  valor_contratacao numeric,
  contratado_em timestamptz,
  missoes integer,
  cumpridas integer,
  abriu_sem_concluir integer,
  nao_abriu integer,
  taxa numeric,
  faixa text,
  ultima_atividade timestamptz,
  total_indicados integer,
  meta_indicados integer,
  situacao_lista text,
  ultima_indicacao_em timestamptz,
  missoes_detalhe jsonb,
  indicados_detalhe jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $function$
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN
    RAISE EXCEPTION 'Sem permissao';
  END IF;
  IF p_data_inicio IS NULL OR p_data_fim IS NULL OR p_data_fim < p_data_inicio THEN
    RAISE EXCEPTION 'Periodo invalido';
  END IF;

  RETURN QUERY
  WITH RECURSIVE contratados AS MATERIALIZED (
    SELECT p.*
    FROM public.eleicao_pessoas p
    WHERE p.client_id=p_client_id
      AND p.arquivado_em IS NULL
      AND NOT coalesce(p.is_voluntario,false)
      AND coalesce(p.valor_contratacao,0)>0
  ), ancestry AS MATERIALIZED (
    SELECT c.id pessoa_id,p.id ancestor_id,p.parent_id,p.nome ancestor_nome,
      p.telefone ancestor_telefone,p.tipo::text ancestor_tipo,0 depth,ARRAY[p.id] caminho
    FROM contratados c
    JOIN public.eleicao_pessoas p ON p.id=c.id AND p.client_id=p_client_id
    UNION ALL
    SELECT a.pessoa_id,p.id,p.parent_id,p.nome,p.telefone,p.tipo::text,
      a.depth+1,a.caminho||p.id
    FROM ancestry a
    JOIN public.eleicao_pessoas p ON p.id=a.parent_id AND p.client_id=p_client_id
    WHERE a.depth<20 AND NOT p.id=ANY(a.caminho)
  ), owners AS MATERIALIZED (
    SELECT DISTINCT ON(a.pessoa_id) a.pessoa_id,a.ancestor_id coordenador_id,
      a.ancestor_nome coordenador_nome,a.ancestor_telefone coordenador_telefone
    FROM ancestry a
    WHERE a.ancestor_tipo='coordenador'
    ORDER BY a.pessoa_id,a.depth
  ), mission_rows AS MATERIALIZED (
    SELECT c.id pessoa_id,o.mission_id,m.title AS titulo,
      coalesce(m.publicado_em,m.created_at) publicado_em,
      CASE WHEN o.status='cumprida' OR o.cumprida_em IS NOT NULL THEN 'cumpriu'
        WHEN EXISTS(
          SELECT 1 FROM public.mission_checkins mc
          JOIN public.mission_participants mp ON mp.id=mc.participant_id
          WHERE mc.client_id=p_client_id AND mc.mission_id=o.mission_id
            AND (mc.pessoa_id=c.id OR mp.pessoa_id=c.id OR
              (public.mission_phone_key(c.telefone) IS NOT NULL AND
               public.mission_phone_key(c.telefone)=public.mission_phone_key(mp.phone_e164)))
            AND mc.primeiro_acesso_em IS NOT NULL
        ) THEN 'abriu' ELSE 'nao_abriu' END status,
      o.cumprida_em,
      (SELECT min(mc.primeiro_acesso_em)
       FROM public.mission_checkins mc
       JOIN public.mission_participants mp ON mp.id=mc.participant_id
       WHERE mc.client_id=p_client_id AND mc.mission_id=o.mission_id
         AND (mc.pessoa_id=c.id OR mp.pessoa_id=c.id OR
           (public.mission_phone_key(c.telefone) IS NOT NULL AND
            public.mission_phone_key(c.telefone)=public.mission_phone_key(mp.phone_e164)))) primeiro_acesso_em
    FROM contratados c
    JOIN public.engagement_obrigacoes o ON o.client_id=p_client_id
      AND o.ref_id=c.id AND o.origem IN('eleicao','eleicao_pessoas')
      AND o.status<>'dispensada'
    JOIN public.portal_missions m ON m.id=o.mission_id AND m.client_id=o.client_id
    WHERE coalesce(m.publicado_em,m.created_at) >= p_data_inicio::timestamp AT TIME ZONE 'America/Campo_Grande'
      AND coalesce(m.publicado_em,m.created_at) < (p_data_fim+1)::timestamp AT TIME ZONE 'America/Campo_Grande'
  ), mission_agg AS MATERIALIZED (
    SELECT mr.pessoa_id,count(*)::int missoes,
      count(*) FILTER(WHERE mr.status='cumpriu')::int cumpridas,
      count(*) FILTER(WHERE mr.status='abriu')::int abriu,
      count(*) FILTER(WHERE mr.status='nao_abriu')::int faltas,
      max(greatest(coalesce(mr.cumprida_em,'epoch'),coalesce(mr.primeiro_acesso_em,'epoch'))) ultima,
      jsonb_agg(jsonb_build_object('mission_id',mr.mission_id,'titulo',mr.titulo,
        'publicado_em',mr.publicado_em,'status',mr.status,'primeiro_acesso_em',mr.primeiro_acesso_em,
        'cumprido_em',mr.cumprida_em) ORDER BY mr.publicado_em DESC) detalhe
    FROM mission_rows mr GROUP BY mr.pessoa_id
  ), indication_agg AS MATERIALIZED (
    SELECT i.indicador_id pessoa_id,count(*)::int total,max(i.created_at) ultima,
      jsonb_agg(jsonb_build_object('id',i.id,'nome',i.nome,'telefone',i.telefone,
        'cidade',i.cidade,'bairro',i.bairro,'origem',i.origem,
        'status_telemarketing',i.status_telemarketing,'created_at',i.created_at)
        ORDER BY i.created_at DESC) detalhe
    FROM public.eleicao_indicados i
    WHERE i.client_id=p_client_id
      AND i.created_at >= p_data_inicio::timestamp AT TIME ZONE 'America/Campo_Grande'
      AND i.created_at < (p_data_fim+1)::timestamp AT TIME ZONE 'America/Campo_Grande'
    GROUP BY i.indicador_id
  ), cfg AS (
    SELECT coalesce(ic.meta_coordenador,30) mc,coalesce(ic.meta_lider,30) ml,
      coalesce(ic.meta_cabo,5) mb
    FROM (SELECT 1) x LEFT JOIN public.eleicao_indicacao_config ic ON ic.client_id=p_client_id
  )
  SELECT c.id,c.nome,c.telefone,c.tipo::text,c.escopo::text,
    coalesce(nullif(c.regiao,''),c.bairro),c.cidade,c.parent_id,pr.nome,
    ow.coordenador_id,ow.coordenador_nome,ow.coordenador_telefone,
    c.valor_contratacao,c.created_at,
    coalesce(ma.missoes,0),coalesce(ma.cumpridas,0),coalesce(ma.abriu,0),coalesce(ma.faltas,0),
    CASE WHEN coalesce(ma.missoes,0)>0 THEN round(100.0*ma.cumpridas/ma.missoes,1) ELSE 0 END,
    CASE WHEN coalesce(ma.missoes,0)=0 THEN 'sem_avaliacao'
      WHEN ma.cumpridas::numeric/ma.missoes>=.8 THEN 'cumprindo'
      WHEN ma.cumpridas::numeric/ma.missoes>=.5 THEN 'atencao'
      WHEN ma.cumpridas>0 THEN 'baixo' ELSE 'nao_cumprindo' END,
    nullif(ma.ultima,'epoch'),coalesce(ia.total,0),
    CASE c.tipo::text WHEN 'coordenador' THEN cfg.mc WHEN 'lider' THEN cfg.ml ELSE cfg.mb END,
    CASE WHEN coalesce(ia.total,0)=0 THEN 'nao_iniciou'
      WHEN ia.total < CASE c.tipo::text WHEN 'coordenador' THEN cfg.mc WHEN 'lider' THEN cfg.ml ELSE cfg.mb END THEN 'parcial'
      WHEN ia.total = CASE c.tipo::text WHEN 'coordenador' THEN cfg.mc WHEN 'lider' THEN cfg.ml ELSE cfg.mb END THEN 'completa'
      ELSE 'acima_meta' END,
    ia.ultima,coalesce(ma.detalhe,'[]'::jsonb),coalesce(ia.detalhe,'[]'::jsonb)
  FROM contratados c
  LEFT JOIN public.eleicao_pessoas pr ON pr.id=c.parent_id AND pr.client_id=p_client_id
  LEFT JOIN owners ow ON ow.pessoa_id=c.id
  LEFT JOIN mission_agg ma ON ma.pessoa_id=c.id
  LEFT JOIN indication_agg ia ON ia.pessoa_id=c.id
  CROSS JOIN cfg
  ORDER BY coalesce(ow.coordenador_nome,'ZZZ'),c.nome;
END;
$function$;

CREATE INDEX IF NOT EXISTS idx_engagement_obrigacoes_report_person
  ON public.engagement_obrigacoes(client_id,ref_id,mission_id)
  WHERE origem IN('eleicao','eleicao_pessoas') AND status<>'dispensada';
CREATE INDEX IF NOT EXISTS idx_eleicao_indicados_report_period
  ON public.eleicao_indicados(client_id,indicador_id,created_at DESC);

REVOKE ALL ON FUNCTION public.election_contract_compliance_report(uuid,date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.election_contract_compliance_report(uuid,date,date) TO authenticated;
NOTIFY pgrst,'reload schema';
