-- Publico unico de acompanhamento:
-- 1) todos os contratados ativos;
-- 2) todos os coordenadores ativos, tenham contrato/acesso ou nao;
-- 3) qualquer outra pessoa ativa da Eleicao que se identificar na missao.

CREATE OR REPLACE FUNCTION public.engagement_sync_mission_current_contracts(p_client_id uuid,p_mission_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE v_prazo integer:=24;v_total integer:=0;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM portal_missions m WHERE m.id=p_mission_id AND m.client_id=p_client_id
    AND m.archived_at IS NULL AND coalesce(m.is_active,true)
    AND (coalesce(m.tracking_enabled,false) OR coalesce(m.monitorada,false))) THEN RETURN 0;END IF;
  SELECT greatest(coalesce(c.prazo_missao_horas,24),1) INTO v_prazo FROM engagement_config c WHERE c.client_id=p_client_id;

  INSERT INTO engagement_obrigacoes(client_id,mission_id,origem,ref_id,nome,cargo,telefone,regiao,cidade,
    phone_norm,tipo_obrigacao,esperado,prazo_em,pontos_possiveis,assigned_at,eligible_from,assignment_source,snapshot_version)
  SELECT m.client_id,m.id,'eleicao',p.id,p.nome,p.tipo::text,p.telefone,coalesce(nullif(p.regiao,''),p.bairro),p.cidade,
    public.normalize_br_phone(p.telefone),'checkin',1,coalesce(m.publicado_em,m.created_at)+make_interval(hours=>v_prazo),
    1,now(),coalesce(p.confirmado_em,p.created_at),'all_contracts_and_coordinators',9
  FROM portal_missions m JOIN eleicao_pessoas p ON p.client_id=m.client_id
  WHERE m.id=p_mission_id AND m.client_id=p_client_id AND p.arquivado_em IS NULL AND (
    p.tipo::text='coordenador' OR
    (NOT coalesce(p.is_voluntario,false) AND coalesce(p.valor_contratacao,0)>0) OR
    EXISTS(SELECT 1 FROM mission_checkins c JOIN mission_participants mp ON mp.id=c.participant_id
      WHERE c.client_id=p_client_id AND c.mission_id=p_mission_id AND
        (c.pessoa_id=p.id OR mp.pessoa_id=p.id OR
         (public.mission_phone_key(p.telefone) IS NOT NULL AND public.mission_phone_key(p.telefone)=public.mission_phone_key(mp.phone_e164))))
  )
  ON CONFLICT(mission_id,origem,ref_id) DO UPDATE SET nome=excluded.nome,cargo=excluded.cargo,
    telefone=excluded.telefone,regiao=excluded.regiao,cidade=excluded.cidade,phone_norm=excluded.phone_norm,
    assignment_source='all_contracts_and_coordinators',snapshot_version=9,updated_at=now();

  -- Versoes antigas usaram tanto "eleicao" quanto "eleicao_pessoas" para a
  -- mesma pessoa. Mantem a linha canonica e transfere para ela o melhor estado
  -- antes de remover somente a duplicata administrativa.
  UPDATE engagement_obrigacoes canonical SET
    status=CASE WHEN legacy.status='cumprida' OR canonical.status='cumprida' THEN 'cumprida' ELSE canonical.status END,
    cumprida_em=coalesce(canonical.cumprida_em,legacy.cumprida_em),
    evidencia_nivel=coalesce(canonical.evidencia_nivel,legacy.evidencia_nivel),
    pontos=greatest(coalesce(canonical.pontos,0),coalesce(legacy.pontos,0)),updated_at=now()
  FROM engagement_obrigacoes legacy
  WHERE canonical.client_id=p_client_id AND canonical.mission_id=p_mission_id
    AND canonical.origem='eleicao' AND legacy.client_id=canonical.client_id
    AND legacy.mission_id=canonical.mission_id AND legacy.origem='eleicao_pessoas'
    AND legacy.ref_id=canonical.ref_id;

  DELETE FROM engagement_obrigacoes legacy
  USING engagement_obrigacoes canonical
  WHERE legacy.client_id=p_client_id AND legacy.mission_id=p_mission_id
    AND legacy.origem='eleicao_pessoas' AND canonical.client_id=legacy.client_id
    AND canonical.mission_id=legacy.mission_id AND canonical.origem='eleicao'
    AND canonical.ref_id=legacy.ref_id;

  -- Remove da fotografia operacional cadastros antigos que hoje nao sao
  -- coordenadores, nao possuem contrato ativo e tambem nunca se identificaram
  -- nesta missao. Isso nao toca mission_events, mission_checkins ou participantes.
  DELETE FROM engagement_obrigacoes stale
  WHERE stale.client_id=p_client_id AND stale.mission_id=p_mission_id
    AND stale.origem IN('eleicao','eleicao_pessoas')
    AND NOT EXISTS(
      SELECT 1 FROM eleicao_pessoas p
      WHERE p.id=stale.ref_id AND p.client_id=p_client_id AND p.arquivado_em IS NULL AND (
        p.tipo::text='coordenador' OR
        (NOT coalesce(p.is_voluntario,false) AND coalesce(p.valor_contratacao,0)>0) OR
        EXISTS(SELECT 1 FROM mission_checkins c JOIN mission_participants mp ON mp.id=c.participant_id
          WHERE c.client_id=p_client_id AND c.mission_id=p_mission_id AND
            (c.pessoa_id=p.id OR mp.pessoa_id=p.id OR
             (public.mission_phone_key(p.telefone) IS NOT NULL AND
              public.mission_phone_key(p.telefone)=public.mission_phone_key(mp.phone_e164))))
      )
    );

  -- Se uma origem legada representa pelo mesmo telefone uma pessoa que ja
  -- possui linha canonica da Eleicao, mantem apenas a canonica. Telefones
  -- nulos nunca sao usados para deduplicar.
  UPDATE engagement_obrigacoes canonical SET
    status=CASE WHEN legacy.status='cumprida' OR canonical.status='cumprida' THEN 'cumprida' ELSE canonical.status END,
    cumprida_em=coalesce(canonical.cumprida_em,legacy.cumprida_em),
    evidencia_nivel=coalesce(canonical.evidencia_nivel,legacy.evidencia_nivel),
    pontos=greatest(coalesce(canonical.pontos,0),coalesce(legacy.pontos,0)),updated_at=now()
  FROM engagement_obrigacoes legacy
  WHERE canonical.client_id=p_client_id AND canonical.mission_id=p_mission_id AND canonical.origem='eleicao'
    AND legacy.client_id=canonical.client_id AND legacy.mission_id=canonical.mission_id
    AND legacy.origem<>'eleicao' AND public.mission_phone_key(legacy.telefone) IS NOT NULL
    AND public.mission_phone_key(legacy.telefone)=public.mission_phone_key(canonical.telefone);

  DELETE FROM engagement_obrigacoes legacy
  USING engagement_obrigacoes canonical
  WHERE legacy.client_id=p_client_id AND legacy.mission_id=p_mission_id
    AND legacy.origem<>'eleicao' AND canonical.client_id=legacy.client_id
    AND canonical.mission_id=legacy.mission_id AND canonical.origem='eleicao'
    AND public.mission_phone_key(legacy.telefone) IS NOT NULL
    AND public.mission_phone_key(legacy.telefone)=public.mission_phone_key(canonical.telefone);

  PERFORM public.mission_apply_completed_checkins(p_client_id,p_mission_id,NULL);
  SELECT count(*)::integer INTO v_total FROM engagement_obrigacoes o
    WHERE o.client_id=p_client_id AND o.mission_id=p_mission_id AND o.status<>'dispensada';
  UPDATE portal_missions SET eligible_count=v_total,audience_snapshotted_at=coalesce(audience_snapshotted_at,now()),
    monitorada=true,tracking_enabled=true,updated_at=now() WHERE id=p_mission_id AND client_id=p_client_id;
  RETURN v_total;
END;$function$;

-- Ao primeiro evento identificado, inclui no acompanhamento uma pessoa ativa
-- da Eleicao que ainda nao estivesse no publico inicial.
CREATE OR REPLACE FUNCTION public.engagement_enroll_identified_person()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE p record;m record;v_prazo integer:=24;
BEGIN
  IF coalesce(NEW.is_bot,false) OR NEW.participant_id IS NULL THEN RETURN NEW;END IF;
  SELECT ep.* INTO p FROM mission_participants mp JOIN eleicao_pessoas ep ON ep.id=mp.pessoa_id
    WHERE mp.id=NEW.participant_id AND ep.client_id=NEW.client_id AND ep.arquivado_em IS NULL;
  IF p.id IS NULL THEN RETURN NEW;END IF;
  SELECT * INTO m FROM portal_missions WHERE id=NEW.mission_id AND client_id=NEW.client_id AND archived_at IS NULL;
  IF m.id IS NULL THEN RETURN NEW;END IF;
  SELECT greatest(coalesce(c.prazo_missao_horas,24),1) INTO v_prazo FROM engagement_config c WHERE c.client_id=NEW.client_id;
  INSERT INTO engagement_obrigacoes(client_id,mission_id,origem,ref_id,nome,cargo,telefone,regiao,cidade,
    phone_norm,tipo_obrigacao,esperado,prazo_em,pontos_possiveis,assigned_at,eligible_from,assignment_source,snapshot_version)
  VALUES(NEW.client_id,NEW.mission_id,'eleicao',p.id,p.nome,p.tipo::text,p.telefone,
    coalesce(nullif(p.regiao,''),p.bairro),p.cidade,public.normalize_br_phone(p.telefone),'checkin',1,
    coalesce(m.publicado_em,m.created_at)+make_interval(hours=>v_prazo),1,now(),now(),'identified_in_mission',9)
  ON CONFLICT(mission_id,origem,ref_id) DO UPDATE SET nome=excluded.nome,telefone=excluded.telefone,
    assignment_source=CASE WHEN engagement_obrigacoes.assignment_source='all_contracts_and_coordinators'
      THEN engagement_obrigacoes.assignment_source ELSE 'identified_in_mission' END,updated_at=now();
  UPDATE portal_missions SET eligible_count=(SELECT count(*) FROM engagement_obrigacoes o
    WHERE o.mission_id=NEW.mission_id AND o.status<>'dispensada') WHERE id=NEW.mission_id;
  RETURN NEW;
END;$function$;

DROP TRIGGER IF EXISTS trg_engagement_enroll_identified_person ON mission_events;
CREATE TRIGGER trg_engagement_enroll_identified_person AFTER INSERT ON mission_events
FOR EACH ROW EXECUTE FUNCTION public.engagement_enroll_identified_person();

DROP FUNCTION IF EXISTS public.engagement_coordinator_mission_charge(uuid,uuid);
CREATE FUNCTION public.engagement_coordinator_mission_charge(p_client_id uuid,p_mission_id uuid)
RETURNS TABLE(coordenador_id uuid,coordenador_nome text,coordenador_telefone text,total_lideres integer,
  concluidos integer,abriu_sem_concluir integer,nao_abriu integer,taxa numeric,concluidos_nomes jsonb,
  abriu_nomes jsonb,nao_abriu_nomes jsonb,coordenador_status text,coordenador_primeiro_acesso timestamptz,
  coordenador_cumprido_em timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $function$
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao';END IF;
  RETURN QUERY WITH RECURSIVE required AS MATERIALIZED(
    SELECT o.ref_id pessoa_id,o.nome,o.telefone,o.status FROM engagement_obrigacoes o
    JOIN eleicao_pessoas p ON p.id=o.ref_id AND p.client_id=o.client_id
    WHERE o.client_id=p_client_id AND o.mission_id=p_mission_id AND o.status<>'dispensada'
      AND p.arquivado_em IS NULL AND p.tipo::text<>'coordenador'
      AND NOT coalesce(p.is_voluntario,false) AND coalesce(p.valor_contratacao,0)>0
  ),ancestry AS(
    SELECT r.pessoa_id obrigado_id,p.id,p.parent_id,p.tipo::text tipo,0 depth,ARRAY[p.id] caminho
    FROM required r JOIN eleicao_pessoas p ON p.id=r.pessoa_id
    UNION ALL SELECT a.obrigado_id,p.id,p.parent_id,p.tipo::text,a.depth+1,a.caminho||p.id
    FROM ancestry a JOIN eleicao_pessoas p ON p.id=a.parent_id AND p.client_id=p_client_id
    WHERE a.depth<20 AND p.arquivado_em IS NULL AND NOT p.id=ANY(a.caminho)
  ),owner AS(
    SELECT DISTINCT ON(obrigado_id) obrigado_id,id coordenador_id FROM ancestry
    WHERE tipo='coordenador' AND id<>obrigado_id ORDER BY obrigado_id,depth
  ),facts AS(
    SELECT r.pessoa_id,min(c.primeiro_acesso_em) primeiro,max(c.concluido_em) concluido FROM required r
    LEFT JOIN mission_checkins c JOIN mission_participants mp ON mp.id=c.participant_id
      ON c.client_id=p_client_id AND c.mission_id=p_mission_id AND(c.pessoa_id=r.pessoa_id OR mp.pessoa_id=r.pessoa_id OR
       (public.mission_phone_key(r.telefone) IS NOT NULL AND public.mission_phone_key(r.telefone)=public.mission_phone_key(mp.phone_e164)))
    GROUP BY r.pessoa_id
  ),members AS(
    SELECT ow.coordenador_id,r.pessoa_id,r.nome,CASE WHEN f.concluido IS NOT NULL OR r.status='cumprida' THEN 'cumpriu'
      WHEN f.primeiro IS NOT NULL THEN 'abriu' ELSE 'nao_abriu' END status
    FROM required r JOIN owner ow ON ow.obrigado_id=r.pessoa_id LEFT JOIN facts f ON f.pessoa_id=r.pessoa_id
  ),coord_facts AS(
    SELECT c.id,min(ch.primeiro_acesso_em) primeiro,max(ch.concluido_em) concluido
    FROM eleicao_pessoas c LEFT JOIN mission_checkins ch JOIN mission_participants mp ON mp.id=ch.participant_id
      ON ch.client_id=p_client_id AND ch.mission_id=p_mission_id AND(ch.pessoa_id=c.id OR mp.pessoa_id=c.id OR
       (public.mission_phone_key(c.telefone) IS NOT NULL AND public.mission_phone_key(c.telefone)=public.mission_phone_key(mp.phone_e164)))
    WHERE c.client_id=p_client_id AND c.tipo::text='coordenador' AND c.arquivado_em IS NULL GROUP BY c.id
  )
  SELECT c.id,c.nome,c.telefone,count(m.pessoa_id)::int,count(*)FILTER(WHERE m.status='cumpriu')::int,
    count(*)FILTER(WHERE m.status='abriu')::int,count(*)FILTER(WHERE m.status='nao_abriu')::int,
    CASE WHEN count(m.pessoa_id)>0 THEN round(100.0*count(*)FILTER(WHERE m.status='cumpriu')/count(m.pessoa_id),1)ELSE 0 END,
    coalesce(jsonb_agg(m.nome ORDER BY m.nome)FILTER(WHERE m.status='cumpriu'),'[]'),
    coalesce(jsonb_agg(m.nome ORDER BY m.nome)FILTER(WHERE m.status='abriu'),'[]'),
    coalesce(jsonb_agg(m.nome ORDER BY m.nome)FILTER(WHERE m.status='nao_abriu'),'[]'),
    CASE WHEN cf.concluido IS NOT NULL THEN 'cumpriu' WHEN cf.primeiro IS NOT NULL THEN 'abriu' ELSE 'nao_abriu' END,
    cf.primeiro,cf.concluido
  FROM eleicao_pessoas c LEFT JOIN members m ON m.coordenador_id=c.id LEFT JOIN coord_facts cf ON cf.id=c.id
  WHERE c.client_id=p_client_id AND c.tipo::text='coordenador' AND c.arquivado_em IS NULL
  GROUP BY c.id,c.nome,c.telefone,cf.primeiro,cf.concluido ORDER BY count(m.pessoa_id)DESC,c.nome;
END;$function$;

SELECT m.title missao,coalesce(m.publicado_em,m.created_at) publicada_em,
  public.engagement_sync_mission_current_contracts(m.client_id,m.id) pessoas_acompanhadas
FROM portal_missions m
WHERE m.archived_at IS NULL AND coalesce(m.is_active,true)
  AND(coalesce(m.tracking_enabled,false)OR coalesce(m.monitorada,false))
ORDER BY coalesce(m.publicado_em,m.created_at) DESC;

REVOKE ALL ON FUNCTION public.engagement_coordinator_mission_charge(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.engagement_coordinator_mission_charge(uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
