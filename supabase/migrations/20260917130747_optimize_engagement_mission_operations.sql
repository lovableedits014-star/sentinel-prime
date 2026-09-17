-- A tela operacional trabalha com uma missao por vez. Evita passar pelo
-- relatorio analitico multi-missao (janela de 3650 dias) e agrega check-ins
-- apenas uma vez por identidade/telefone.

CREATE INDEX IF NOT EXISTS idx_mission_events_operation_period
  ON public.mission_events(client_id,mission_id,created_at,participant_id,event_type)
  WHERE NOT coalesce(is_bot,false);

CREATE INDEX IF NOT EXISTS idx_engagement_obrigacoes_operation
  ON public.engagement_obrigacoes(client_id,mission_id,ref_id)
  INCLUDE (origem,status,cumprida_em,telefone)
  WHERE status<>'dispensada';

CREATE OR REPLACE FUNCTION public.engagement_mission_people_facts(
  p_client_id uuid,p_mission_id uuid
) RETURNS TABLE(
  pessoa_id uuid,origem text,nome text,telefone text,cargo text,regiao text,cidade text,
  is_voluntario boolean,tem_contrato boolean,status text,prova text,
  cumprido_em timestamptz,primeiro_acesso_em timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $function$
DECLARE
  v_mission_start timestamptz;
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;

  SELECT coalesce(m.publicado_em,m.created_at) INTO v_mission_start
  FROM public.portal_missions m
  WHERE m.client_id=p_client_id AND m.id=p_mission_id;
  IF v_mission_start IS NULL THEN RAISE EXCEPTION 'Missao nao encontrada'; END IF;

  RETURN QUERY
  WITH obligations AS MATERIALIZED (
    SELECT DISTINCT ON(o.ref_id,
      CASE WHEN o.origem IN('eleicao','eleicao_pessoas') THEN 'eleicao' ELSE o.origem END)
      o.ref_id,
      CASE WHEN o.origem IN('eleicao','eleicao_pessoas') THEN 'eleicao' ELSE o.origem END origem_key,
      o.nome,o.telefone,o.cargo,o.regiao,o.cidade,o.status obrig_status,
      o.evidencia_nivel,o.evidencia_validada,o.cumprida_em,
      coalesce(ep.is_voluntario,o.cargo='voluntario',false) voluntario,
      ((coalesce(ep.valor_contratacao,0)>0) OR o.cargo IN('contratado','funcionario')) contrato,
      public.mission_phone_key(o.telefone) phone_key
    FROM public.engagement_obrigacoes o
    LEFT JOIN public.eleicao_pessoas ep
      ON o.origem IN('eleicao','eleicao_pessoas') AND ep.client_id=o.client_id AND ep.id=o.ref_id
    WHERE o.client_id=p_client_id AND o.mission_id=p_mission_id AND o.status<>'dispensada'
    ORDER BY o.ref_id,
      CASE WHEN o.origem IN('eleicao','eleicao_pessoas') THEN 'eleicao' ELSE o.origem END,
      CASE WHEN o.status='cumprida' THEN 0 ELSE 1 END,o.updated_at DESC
  ), checkin_source AS MATERIALIZED (
    SELECT c.participant_id,c.pessoa_id,mp.pessoa_id mp_pessoa_id,
      c.funcionario_id,mp.funcionario_id mp_funcionario_id,
      c.contratado_id,mp.contratado_id mp_contratado_id,
      public.mission_phone_key(mp.phone_e164) phone_key,
      c.primeiro_acesso_em,c.concluido_em,c.clicks
    FROM public.mission_checkins c
    JOIN public.mission_participants mp ON mp.id=c.participant_id
    WHERE c.client_id=p_client_id AND c.mission_id=p_mission_id
      AND c.ultimo_acesso_em>=v_mission_start
  ), identity_rows AS MATERIALIZED (
    SELECT 'eleicao'::text origem_key,coalesce(c.pessoa_id,c.mp_pessoa_id) ref_id,
      c.primeiro_acesso_em,c.concluido_em,c.clicks FROM checkin_source c
    WHERE coalesce(c.pessoa_id,c.mp_pessoa_id) IS NOT NULL
    UNION ALL
    SELECT 'funcionario',coalesce(c.funcionario_id,c.mp_funcionario_id),
      c.primeiro_acesso_em,c.concluido_em,c.clicks FROM checkin_source c
    WHERE coalesce(c.funcionario_id,c.mp_funcionario_id) IS NOT NULL
    UNION ALL
    SELECT 'contratado',coalesce(c.contratado_id,c.mp_contratado_id),
      c.primeiro_acesso_em,c.concluido_em,c.clicks FROM checkin_source c
    WHERE coalesce(c.contratado_id,c.mp_contratado_id) IS NOT NULL
  ), identity_fact AS MATERIALIZED (
    SELECT i.origem_key,i.ref_id,min(i.primeiro_acesso_em) primeiro,
      max(i.concluido_em) concluido,bool_or(i.clicks>0) clicou
    FROM identity_rows i GROUP BY i.origem_key,i.ref_id
  ), phone_fact AS MATERIALIZED (
    SELECT c.phone_key,min(c.primeiro_acesso_em) primeiro,max(c.concluido_em) concluido,
      bool_or(c.clicks>0) clicou
    FROM checkin_source c WHERE c.phone_key IS NOT NULL GROUP BY c.phone_key
  ), paired AS (
    SELECT o.*,coalesce(i.primeiro,p.primeiro) primeiro,
      coalesce(i.concluido,p.concluido) concluido,
      coalesce(i.clicou,false) OR coalesce(p.clicou,false) clicou
    FROM obligations o
    LEFT JOIN identity_fact i ON i.origem_key=o.origem_key AND i.ref_id=o.ref_id
    LEFT JOIN phone_fact p ON p.phone_key=o.phone_key
  )
  SELECT p.ref_id,p.origem_key,p.nome,p.telefone,p.cargo,p.regiao,p.cidade,
    p.voluntario,p.contrato,
    CASE WHEN p.concluido IS NOT NULL OR p.obrig_status='cumprida' THEN 'cumpriu'
      WHEN p.primeiro IS NOT NULL OR p.clicou THEN 'abriu' ELSE 'nao_abriu' END,
    CASE WHEN p.evidencia_nivel='E1' AND p.evidencia_validada THEN 'E1'
      WHEN p.evidencia_nivel='E3' AND p.evidencia_validada THEN 'E3'
      WHEN p.concluido IS NOT NULL OR p.obrig_status='cumprida' THEN 'E2' END,
    coalesce(p.concluido,p.cumprida_em),p.primeiro
  FROM paired p;
END;
$function$;

CREATE OR REPLACE FUNCTION public.engagement_mission_command_center(
  p_client_id uuid,p_mission_id uuid DEFAULT NULL,
  p_dia date DEFAULT (now() AT TIME ZONE 'America/Cuiaba')::date,
  p_root_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $function$
DECLARE
  v_mission uuid:=p_mission_id;
  v_ini timestamptz:=(p_dia::timestamp AT TIME ZONE 'America/Cuiaba');
  v_fim timestamptz:=((p_dia+1)::timestamp AT TIME ZONE 'America/Cuiaba');
  v_result jsonb;
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;
  IF v_mission IS NULL THEN
    SELECT m.id INTO v_mission FROM portal_missions m
    WHERE m.client_id=p_client_id AND m.archived_at IS NULL AND coalesce(m.is_active,true)
      AND(coalesce(m.tracking_enabled,false)OR coalesce(m.monitorada,false))
    ORDER BY coalesce(m.publicado_em,m.created_at)DESC,m.id DESC LIMIT 1;
  END IF;
  IF v_mission IS NULL THEN RETURN jsonb_build_object('mission',NULL,'cumulative','{}'::jsonb,
    'today','{}'::jsonb,'hourly','[]'::jsonb,'people','[]'::jsonb,'updated_at',now()); END IF;

  WITH RECURSIVE team AS MATERIALIZED (
    SELECT p.id,public.mission_phone_key(p.telefone) phone_key FROM eleicao_pessoas p
    WHERE p_root_id IS NOT NULL AND p.id=p_root_id AND p.client_id=p_client_id
    UNION ALL
    SELECT p.id,public.mission_phone_key(p.telefone) FROM eleicao_pessoas p
    JOIN team t ON p.parent_id=t.id WHERE p.client_id=p_client_id
  ), facts AS MATERIALIZED (
    SELECT f.* FROM public.engagement_mission_people_facts(p_client_id,v_mission) f
    WHERE p_root_id IS NULL OR(f.origem='eleicao'AND f.pessoa_id IN(SELECT t.id FROM team t))
      OR(public.mission_phone_key(f.telefone)IS NOT NULL AND public.mission_phone_key(f.telefone)IN(
        SELECT t.phone_key FROM team t WHERE t.phone_key IS NOT NULL))
  ), totals AS (
    SELECT count(*)::int obrigados,count(*)FILTER(WHERE status='cumpriu')::int concluidos,
      count(*)FILTER(WHERE status='abriu')::int abriu,count(*)FILTER(WHERE status='nao_abriu')::int nao_abriu,
      count(*)FILTER(WHERE prova='E1')::int e1,count(*)FILTER(WHERE prova='E2')::int e2,
      count(*)FILTER(WHERE prova='E3')::int e3,
      count(*)FILTER(WHERE cumprido_em>=v_ini AND cumprido_em<v_fim)::int concluidos_hoje,
      count(*)FILTER(WHERE primeiro_acesso_em>=v_ini AND primeiro_acesso_em<v_fim)::int abriram_hoje
    FROM facts
  ), events_source AS MATERIALIZED (
    SELECT e.created_at,e.participant_id,e.event_type FROM mission_events e
    WHERE e.client_id=p_client_id AND e.mission_id=v_mission
      AND e.created_at>=v_ini AND e.created_at<v_fim AND NOT coalesce(e.is_bot,false)
  ), event_rollup AS MATERIALIZED (
    SELECT extract(hour FROM e.created_at AT TIME ZONE 'America/Cuiaba')::int hora,
      count(*)::int eventos,count(DISTINCT e.participant_id)FILTER(WHERE e.participant_id IS NOT NULL)::int pessoas,
      count(*)FILTER(WHERE e.event_type::text='open')::int aberturas,
      count(*)FILTER(WHERE e.event_type::text LIKE 'click_%')::int cliques,
      count(DISTINCT e.participant_id)FILTER(WHERE e.event_type::text='declared_done' AND e.participant_id IS NOT NULL)::int confirmacoes
    FROM events_source e GROUP BY 1
  ), events_today AS (
    SELECT count(*)::int eventos,
      count(DISTINCT e.participant_id)FILTER(WHERE e.participant_id IS NOT NULL)::int identificados,
      count(*)FILTER(WHERE e.event_type::text='open')::int aberturas,
      count(*)FILTER(WHERE e.event_type::text LIKE 'click_%')::int cliques,
      count(DISTINCT e.participant_id)FILTER(WHERE e.event_type::text='declared_done'AND e.participant_id IS NOT NULL)::int confirmacoes
    FROM events_source e
  ), hourly AS (
    SELECT jsonb_agg(jsonb_build_object('hora',h.hora,'eventos',coalesce(x.eventos,0),
      'pessoas',coalesce(x.pessoas,0),'confirmacoes',coalesce(x.confirmacoes,0))ORDER BY h.hora) dados
    FROM generate_series(0,23)h(hora) LEFT JOIN event_rollup x ON x.hora=h.hora
  ), people_json AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object('pessoa_id',f.pessoa_id,'origem',f.origem,
      'nome',f.nome,'telefone',f.telefone,'cargo',f.cargo,'regiao',f.regiao,'cidade',f.cidade,
      'status',f.status,'prova',f.prova,'cumprido_em',f.cumprido_em,'primeiro_acesso_em',f.primeiro_acesso_em,
      'concluiu_hoje',(f.cumprido_em>=v_ini AND f.cumprido_em<v_fim),
      'abriu_hoje',(f.primeiro_acesso_em>=v_ini AND f.primeiro_acesso_em<v_fim))
      ORDER BY CASE f.status WHEN 'nao_abriu'THEN 0 WHEN 'abriu'THEN 1 ELSE 2 END,f.nome),'[]') dados FROM facts f
  )
  SELECT jsonb_build_object('mission',jsonb_build_object('id',m.id,'title',coalesce(m.title,m.post_url,'Missao'),
    'platform',m.platform,'published_at',coalesce(m.publicado_em,m.created_at)),
    'cumulative',jsonb_build_object('obrigados',t.obrigados,'concluidos',t.concluidos,
      'abriu_sem_concluir',t.abriu,'nao_abriu',t.nao_abriu,
      'taxa',CASE WHEN t.obrigados>0 THEN round(100.0*t.concluidos/t.obrigados,1)ELSE 0 END,
      'e1',t.e1,'e2',t.e2,'e3',t.e3),
    'today',jsonb_build_object('dia',p_dia,'eventos',e.eventos,'pessoas_identificadas',e.identificados,
      'aberturas',e.aberturas,'cliques',e.cliques,'confirmacoes_evento',e.confirmacoes,
      'lideres_concluiram',t.concluidos_hoje,'lideres_abriram',t.abriram_hoje),
    'hourly',h.dados,'people',p.dados,'updated_at',now()) INTO v_result
  FROM portal_missions m CROSS JOIN totals t CROSS JOIN events_today e CROSS JOIN hourly h CROSS JOIN people_json p
  WHERE m.id=v_mission AND m.client_id=p_client_id;
  RETURN coalesce(v_result,jsonb_build_object('mission',NULL,'cumulative','{}'::jsonb,
    'today','{}'::jsonb,'hourly','[]'::jsonb,'people','[]'::jsonb,'updated_at',now()));
END;
$function$;

CREATE OR REPLACE FUNCTION public.engagement_mission_activity_period(
  p_client_id uuid,p_mission_id uuid,p_periodo text DEFAULT 'hoje'
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $function$
DECLARE
  v_hoje date:=(now()AT TIME ZONE 'America/Cuiaba')::date;
  v_ini timestamptz;v_fim timestamptz:=now()+interval '1 millisecond';v_result jsonb;
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao';END IF;
  IF p_periodo NOT IN('hoje','todo')THEN RAISE EXCEPTION 'Periodo invalido';END IF;
  SELECT CASE WHEN p_periodo='hoje' THEN(v_hoje::timestamp AT TIME ZONE 'America/Cuiaba')
    ELSE coalesce(m.publicado_em,m.created_at)END INTO v_ini
  FROM portal_missions m WHERE m.id=p_mission_id AND m.client_id=p_client_id;
  IF v_ini IS NULL THEN RAISE EXCEPTION 'Missao nao encontrada';END IF;
  IF p_periodo='hoje'THEN v_fim:=((v_hoje+1)::timestamp AT TIME ZONE 'America/Cuiaba');END IF;

  WITH valid_events AS MATERIALIZED (
    SELECT e.participant_id,e.event_type,e.mission_link_id,e.created_at
    FROM mission_events e WHERE e.client_id=p_client_id AND e.mission_id=p_mission_id
      AND e.created_at>=v_ini AND e.created_at<v_fim AND NOT coalesce(e.is_bot,false)
  ), audience AS MATERIALIZED (
    SELECT * FROM public.engagement_mission_people_facts(p_client_id,p_mission_id)
  ), confirmed AS MATERIALIZED (
    SELECT DISTINCT e.participant_id FROM valid_events e
    WHERE e.participant_id IS NOT NULL AND e.event_type::text='declared_done'
  ), confirmed_audience AS MATERIALIZED (
    SELECT DISTINCT c.participant_id FROM confirmed c JOIN mission_participants mp ON mp.id=c.participant_id
    JOIN audience a ON a.origem='eleicao' AND a.pessoa_id=mp.pessoa_id
    UNION
    SELECT DISTINCT c.participant_id FROM confirmed c JOIN mission_participants mp ON mp.id=c.participant_id
    JOIN audience a ON public.mission_phone_key(a.telefone)=public.mission_phone_key(mp.phone_e164)
    WHERE public.mission_phone_key(a.telefone)IS NOT NULL
  ), totals AS (
    SELECT count(*)::int eventos_brutos,
      count(DISTINCT e.participant_id)FILTER(WHERE e.participant_id IS NOT NULL)::int pessoas_identificadas,
      count(DISTINCT e.participant_id)FILTER(WHERE e.participant_id IS NOT NULL AND
        (mp.pessoa_id IS NOT NULL OR mp.funcionario_id IS NOT NULL OR mp.contratado_id IS NOT NULL OR mp.crm_pessoa_id IS NOT NULL))::int pessoas_vinculadas,
      count(DISTINCT e.participant_id)FILTER(WHERE e.participant_id IS NOT NULL AND
        mp.pessoa_id IS NULL AND mp.funcionario_id IS NULL AND mp.contratado_id IS NULL AND mp.crm_pessoa_id IS NULL)::int pessoas_nao_vinculadas,
      count(DISTINCT e.participant_id)FILTER(WHERE e.event_type::text='open')::int pessoas_abriram,
      count(DISTINCT e.participant_id)FILTER(WHERE e.event_type::text LIKE 'click_%')::int pessoas_clicaram,
      (SELECT count(*)FROM confirmed)::int pessoas_confirmaram,
      (SELECT count(*)FROM confirmed_audience)::int confirmados_no_publico,
      count(DISTINCT(e.participant_id,e.event_type,e.mission_link_id))FILTER(WHERE e.participant_id IS NOT NULL)::int acoes_unicas
    FROM valid_events e LEFT JOIN mission_participants mp ON mp.id=e.participant_id
  ), leader_totals AS (
    SELECT count(*)FILTER(WHERE status='cumpriu' AND cumprido_em>=v_ini AND cumprido_em<v_fim)::int lideres_concluiram,
      count(*)FILTER(WHERE primeiro_acesso_em>=v_ini AND primeiro_acesso_em<v_fim)::int lideres_abriram FROM audience
  ), event_buckets AS MATERIALIZED (
    SELECT CASE WHEN p_periodo='hoje'THEN extract(hour FROM e.created_at AT TIME ZONE 'America/Cuiaba')::int::text
      ELSE(e.created_at AT TIME ZONE 'America/Cuiaba')::date::text END chave,
      count(DISTINCT e.participant_id)FILTER(WHERE e.participant_id IS NOT NULL)::int pessoas,
      count(DISTINCT e.participant_id)FILTER(WHERE e.participant_id IS NOT NULL AND e.event_type::text LIKE 'click_%')::int clicaram,
      count(DISTINCT e.participant_id)FILTER(WHERE e.participant_id IS NOT NULL AND e.event_type::text='declared_done')::int confirmacoes,
      count(*)::int eventos_brutos FROM valid_events e GROUP BY 1
  ), timeline AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object('chave',g.chave,'rotulo',g.rotulo,
      'pessoas',coalesce(x.pessoas,0),'pessoas_clicaram',coalesce(x.clicaram,0),
      'confirmacoes',coalesce(x.confirmacoes,0),'eventos_brutos',coalesce(x.eventos_brutos,0))ORDER BY g.ordem),'[]')dados
    FROM(SELECT h::text chave,lpad(h::text,2,'0')||'h' rotulo,h ordem FROM generate_series(0,23)h WHERE p_periodo='hoje'
      UNION ALL SELECT d::date::text,to_char(d::date,'DD/MM'),(d::date-v_ini::date)::int
      FROM generate_series(v_ini::date,v_hoje,interval '1 day')s(d)WHERE p_periodo='todo')g
    LEFT JOIN event_buckets x ON x.chave=g.chave
  )
  SELECT jsonb_build_object('periodo',p_periodo,'inicio',v_ini,'fim',v_fim,
    'eventos_brutos',t.eventos_brutos,'acoes_unicas',t.acoes_unicas,
    'pessoas_identificadas',t.pessoas_identificadas,'pessoas_vinculadas',t.pessoas_vinculadas,
    'pessoas_nao_vinculadas',t.pessoas_nao_vinculadas,'pessoas_abriram',t.pessoas_abriram,
    'pessoas_clicaram',t.pessoas_clicaram,'pessoas_confirmaram',t.pessoas_confirmaram,
    'confirmados_no_publico',t.confirmados_no_publico,
    'confirmados_fora_publico',t.pessoas_confirmaram-t.confirmados_no_publico,
    'lideres_concluiram',l.lideres_concluiram,'lideres_abriram',l.lideres_abriram,
    'timeline',tl.dados,'updated_at',now())INTO v_result FROM totals t CROSS JOIN leader_totals l CROSS JOIN timeline tl;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.engagement_coordinator_mission_charge(p_client_id uuid,p_mission_id uuid)
RETURNS TABLE(coordenador_id uuid,coordenador_nome text,coordenador_telefone text,total_lideres integer,
  concluidos integer,abriu_sem_concluir integer,nao_abriu integer,taxa numeric,concluidos_nomes jsonb,
  abriu_nomes jsonb,nao_abriu_nomes jsonb,coordenador_status text,coordenador_primeiro_acesso timestamptz,
  coordenador_cumprido_em timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $function$
BEGIN
  IF NOT public.is_client_member(p_client_id)THEN RAISE EXCEPTION 'Sem permissao';END IF;
  RETURN QUERY WITH RECURSIVE facts AS MATERIALIZED(
    SELECT * FROM public.engagement_mission_people_facts(p_client_id,p_mission_id)
  ),required AS MATERIALIZED(
    SELECT f.pessoa_id,f.nome,f.status FROM facts f JOIN eleicao_pessoas p ON p.id=f.pessoa_id AND p.client_id=p_client_id
    WHERE f.origem='eleicao' AND p.arquivado_em IS NULL AND p.tipo::text<>'coordenador'
      AND NOT coalesce(p.is_voluntario,false)AND coalesce(p.valor_contratacao,0)>0
  ),ancestry AS(
    SELECT r.pessoa_id obrigado_id,p.id,p.parent_id,p.tipo::text tipo,0 depth,ARRAY[p.id]caminho
    FROM required r JOIN eleicao_pessoas p ON p.id=r.pessoa_id
    UNION ALL SELECT a.obrigado_id,p.id,p.parent_id,p.tipo::text,a.depth+1,a.caminho||p.id
    FROM ancestry a JOIN eleicao_pessoas p ON p.id=a.parent_id AND p.client_id=p_client_id
    WHERE a.depth<20 AND p.arquivado_em IS NULL AND NOT p.id=ANY(a.caminho)
  ),owner AS(
    SELECT DISTINCT ON(obrigado_id)obrigado_id,id coordenador_id FROM ancestry
    WHERE tipo='coordenador'AND id<>obrigado_id ORDER BY obrigado_id,depth
  ),members AS(
    SELECT o.coordenador_id,r.pessoa_id,r.nome,r.status FROM required r JOIN owner o ON o.obrigado_id=r.pessoa_id
  )
  SELECT c.id,c.nome,c.telefone,count(m.pessoa_id)::int,
    count(*)FILTER(WHERE m.status='cumpriu')::int,count(*)FILTER(WHERE m.status='abriu')::int,
    count(*)FILTER(WHERE m.status='nao_abriu')::int,
    CASE WHEN count(m.pessoa_id)>0 THEN round(100.0*count(*)FILTER(WHERE m.status='cumpriu')/count(m.pessoa_id),1)ELSE 0 END,
    coalesce(jsonb_agg(m.nome ORDER BY m.nome)FILTER(WHERE m.status='cumpriu'),'[]'),
    coalesce(jsonb_agg(m.nome ORDER BY m.nome)FILTER(WHERE m.status='abriu'),'[]'),
    coalesce(jsonb_agg(m.nome ORDER BY m.nome)FILTER(WHERE m.status='nao_abriu'),'[]'),
    coalesce(cf.status,'nao_abriu'),cf.primeiro_acesso_em,cf.cumprido_em
  FROM eleicao_pessoas c LEFT JOIN members m ON m.coordenador_id=c.id
  LEFT JOIN facts cf ON cf.origem='eleicao'AND cf.pessoa_id=c.id
  WHERE c.client_id=p_client_id AND c.tipo::text='coordenador'AND c.arquivado_em IS NULL
  GROUP BY c.id,c.nome,c.telefone,cf.status,cf.primeiro_acesso_em,cf.cumprido_em
  ORDER BY count(m.pessoa_id)DESC,c.nome;
END;
$function$;

CREATE OR REPLACE FUNCTION public.engagement_mission_standalone_contracts(p_client_id uuid,p_mission_id uuid)
RETURNS TABLE(pessoa_id uuid,nome text,telefone text,cargo text,regiao text,cidade text,
  status text,primeiro_acesso_em timestamptz,cumprido_em timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $function$
BEGIN
  IF NOT public.is_client_member(p_client_id)THEN RAISE EXCEPTION 'Sem permissao';END IF;
  RETURN QUERY WITH RECURSIVE required AS MATERIALIZED(
    SELECT f.* FROM public.engagement_mission_people_facts(p_client_id,p_mission_id)f
    JOIN eleicao_pessoas p ON p.id=f.pessoa_id AND p.client_id=p_client_id
    WHERE f.origem='eleicao'AND p.arquivado_em IS NULL AND p.tipo::text<>'coordenador'
      AND NOT coalesce(p.is_voluntario,false)AND coalesce(p.valor_contratacao,0)>0
  ),ancestry AS(
    SELECT r.pessoa_id obrigado_id,p.id,p.parent_id,p.tipo::text tipo,0 depth,ARRAY[p.id]caminho
    FROM required r JOIN eleicao_pessoas p ON p.id=r.pessoa_id
    UNION ALL SELECT a.obrigado_id,p.id,p.parent_id,p.tipo::text,a.depth+1,a.caminho||p.id
    FROM ancestry a JOIN eleicao_pessoas p ON p.id=a.parent_id AND p.client_id=p_client_id
    WHERE a.depth<20 AND p.arquivado_em IS NULL AND NOT p.id=ANY(a.caminho)
  )
  SELECT r.pessoa_id,r.nome,r.telefone,r.cargo,r.regiao,r.cidade,r.status,r.primeiro_acesso_em,r.cumprido_em
  FROM required r WHERE NOT EXISTS(SELECT 1 FROM ancestry a WHERE a.obrigado_id=r.pessoa_id
    AND a.tipo='coordenador'AND a.id<>r.pessoa_id)
  ORDER BY CASE r.status WHEN 'nao_abriu'THEN 0 WHEN 'abriu'THEN 1 ELSE 2 END,r.nome;
END;
$function$;

REVOKE ALL ON FUNCTION public.engagement_mission_people_facts(uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.engagement_mission_command_center(uuid,uuid,date,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.engagement_mission_activity_period(uuid,uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.engagement_coordinator_mission_charge(uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.engagement_mission_standalone_contracts(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.engagement_mission_people_facts(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.engagement_mission_command_center(uuid,uuid,date,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.engagement_mission_activity_period(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.engagement_coordinator_mission_charge(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.engagement_mission_standalone_contracts(uuid,uuid) TO authenticated;

NOTIFY pgrst,'reload schema';
