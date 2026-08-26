-- Exige todos os links antes da confirmação e expõe cliques por rede no detalhe do ranking.

CREATE OR REPLACE FUNCTION public.public_mission_can_confirm(p_mission_id uuid, p_token text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_m record; v_participant uuid; v_required integer := 0; v_clicked integer := 0;
BEGIN
  SELECT id, link_facebook, link_instagram, link_avulso, post_url, platform
    INTO v_m FROM portal_missions WHERE id=p_mission_id AND archived_at IS NULL;
  IF v_m.id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','Missão não encontrada'); END IF;

  SELECT participant_id INTO v_participant FROM mission_visitor_tokens
   WHERE token=p_token AND revoked_at IS NULL;
  IF v_participant IS NULL THEN RETURN jsonb_build_object('ok',false,'error','Identificação inválida'); END IF;

  v_required :=
    CASE WHEN v_m.link_facebook IS NOT NULL OR (v_m.link_facebook IS NULL AND v_m.platform='facebook' AND v_m.post_url IS NOT NULL) THEN 1 ELSE 0 END +
    CASE WHEN v_m.link_instagram IS NOT NULL OR (v_m.link_instagram IS NULL AND v_m.platform='instagram' AND v_m.post_url IS NOT NULL) THEN 1 ELSE 0 END +
    CASE WHEN v_m.link_avulso IS NOT NULL THEN 1 ELSE 0 END +
    (SELECT count(*) FROM portal_mission_links l WHERE l.mission_id=p_mission_id);

  SELECT
    (CASE WHEN (v_m.link_facebook IS NOT NULL OR (v_m.platform='facebook' AND v_m.post_url IS NOT NULL)) AND EXISTS(
      SELECT 1 FROM mission_events e WHERE e.mission_id=p_mission_id AND e.participant_id=v_participant
       AND e.event_type::text='click_facebook' AND NOT coalesce(e.is_bot,false)) THEN 1 ELSE 0 END) +
    (CASE WHEN (v_m.link_instagram IS NOT NULL OR (v_m.platform='instagram' AND v_m.post_url IS NOT NULL)) AND EXISTS(
      SELECT 1 FROM mission_events e WHERE e.mission_id=p_mission_id AND e.participant_id=v_participant
       AND e.event_type::text='click_instagram' AND NOT coalesce(e.is_bot,false)) THEN 1 ELSE 0 END) +
    (CASE WHEN v_m.link_avulso IS NOT NULL AND EXISTS(
      SELECT 1 FROM mission_events e WHERE e.mission_id=p_mission_id AND e.participant_id=v_participant
       AND e.event_type::text='click_avulso' AND NOT coalesce(e.is_bot,false)) THEN 1 ELSE 0 END) +
    (SELECT count(*) FROM portal_mission_links l WHERE l.mission_id=p_mission_id AND EXISTS(
      SELECT 1 FROM mission_events e WHERE e.mission_id=p_mission_id AND e.participant_id=v_participant
       AND e.event_type::text='click_link' AND e.link_id=l.id AND NOT coalesce(e.is_bot,false)))
  INTO v_clicked;

  RETURN jsonb_build_object('ok',v_clicked>=v_required,'required',v_required,'clicked',v_clicked,'remaining',greatest(v_required-v_clicked,0));
END $$;
REVOKE ALL ON FUNCTION public.public_mission_can_confirm(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_mission_can_confirm(uuid,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.engagement_equipe_desempenho_v2(p_client_id uuid,p_dias integer DEFAULT 30,p_audience_id uuid DEFAULT NULL,p_root_id uuid DEFAULT NULL,p_mission_id uuid DEFAULT NULL)
RETURNS TABLE(pessoa_id uuid,origem text,nome text,telefone text,cargo text,regiao text,cidade text,is_voluntario boolean,tem_contrato boolean,publicacoes integer,cumpridas integer,abriu_sem_confirmar integer,faltas integer,pct numeric,prova_principal text,faixa text,pct_anterior numeric,variacao numeric,ultima_atividade timestamptz,detalhe jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public AS $$
WITH cur AS (
  SELECT f.*,
    EXISTS(SELECT 1 FROM mission_checkins c JOIN mission_events e ON e.participant_id=c.participant_id AND e.mission_id=c.mission_id
      WHERE c.mission_id=f.mission_id AND ((f.origem='eleicao' AND c.pessoa_id=f.pessoa_id) OR (f.origem='funcionario' AND c.funcionario_id=f.pessoa_id))
        AND e.event_type::text='click_facebook' AND NOT coalesce(e.is_bot,false)) facebook_abriu,
    EXISTS(SELECT 1 FROM mission_checkins c JOIN mission_events e ON e.participant_id=c.participant_id AND e.mission_id=c.mission_id
      WHERE c.mission_id=f.mission_id AND ((f.origem='eleicao' AND c.pessoa_id=f.pessoa_id) OR (f.origem='funcionario' AND c.funcionario_id=f.pessoa_id))
        AND e.event_type::text='click_instagram' AND NOT coalesce(e.is_bot,false)) instagram_abriu
  FROM engagement_pub_facts_v2(p_client_id,p_dias,p_audience_id,0,p_root_id,p_mission_id) f
), agg AS (
 SELECT f.pessoa_id,f.origem,min(f.nome) nome,min(f.telefone) telefone,min(f.cargo) cargo,
  min(f.regiao) regiao,min(f.cidade) cidade,bool_or(f.is_voluntario) volunt,bool_or(f.tem_contrato) contrato,
  count(*)::int pubs,count(*) FILTER(WHERE status='cumpriu')::int cump,
  count(*) FILTER(WHERE status='abriu')::int abriu,count(*) FILTER(WHERE status='nao_abriu')::int faltas,
  (array_agg(f.prova ORDER BY f.prova))[1] prova,
  max(greatest(coalesce(f.cumprido_em,'epoch'),coalesce(f.primeiro_acesso_em,'epoch'))) ult,
  jsonb_agg(jsonb_build_object('mission_id',f.mission_id,'titulo',f.titulo,'publicado_em',f.publicado_em,
    'status',f.status,'prova',f.prova,'facebook_abriu',f.facebook_abriu,'instagram_abriu',f.instagram_abriu)
    ORDER BY f.publicado_em DESC) detalhe
 FROM cur f GROUP BY 1,2
)
SELECT a.pessoa_id,a.origem,a.nome,a.telefone,a.cargo,a.regiao,a.cidade,a.volunt,a.contrato,
 a.pubs,a.cump,a.abriu,a.faltas,round(a.cump::numeric/nullif(a.pubs,0)*100,1),a.prova,
 CASE WHEN a.cump::numeric/a.pubs>=.8 THEN 'excelente' WHEN a.cump::numeric/a.pubs>=.5 THEN 'atencao'
      WHEN a.cump>0 THEN 'baixo' ELSE 'critico' END,
 NULL::numeric,NULL::numeric,nullif(a.ult,'epoch'),a.detalhe
FROM agg a ORDER BY a.cump::numeric/nullif(a.pubs,0) DESC,a.nome;
$$;
GRANT EXECUTE ON FUNCTION public.engagement_equipe_desempenho_v2(uuid,integer,uuid,uuid,uuid) TO authenticated;
