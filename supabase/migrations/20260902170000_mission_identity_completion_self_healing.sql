-- Corrige divergencias entre participante, check-in e obrigacao. A identidade
-- mais recente do participante passa a prevalecer e a conclusao atualiza o
-- funil da missao na mesma transacao.

CREATE OR REPLACE FUNCTION public.mission_resolve_identity(p_client_id uuid,p_phone text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $function$
DECLARE k text; r record;
BEGIN
  k:=public.mission_phone_key(p_phone);
  IF k IS NULL OR p_client_id IS NULL THEN RETURN '{}'::jsonb; END IF;

  SELECT id,nome,tipo,is_voluntario,regiao,cidade,valor_contratacao
  INTO r FROM eleicao_pessoas
  WHERE client_id=p_client_id AND arquivado_em IS NULL
    AND public.mission_phone_key(telefone)=k
  ORDER BY updated_at DESC NULLS LAST,id
  LIMIT 1;
  IF r.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'match_source','eleicao','pessoa_id',r.id,'nome',r.nome,
      'cargo',CASE WHEN r.is_voluntario THEN 'voluntario' ELSE r.tipo::text END,
      'regiao',coalesce(r.regiao,r.cidade),
      'obrigado',(NOT coalesce(r.is_voluntario,false) AND coalesce(r.valor_contratacao,0)>0)
    );
  END IF;

  SELECT id,nome,cidade INTO r FROM contratados
  WHERE client_id=p_client_id AND public.mission_phone_key(telefone)=k LIMIT 1;
  IF r.id IS NOT NULL THEN RETURN jsonb_build_object('match_source','contratado','contratado_id',r.id,'nome',r.nome,'cargo','contratado','regiao',r.cidade,'obrigado',true); END IF;

  SELECT id,nome,cidade INTO r FROM funcionarios
  WHERE client_id=p_client_id AND public.mission_phone_key(telefone)=k LIMIT 1;
  IF r.id IS NOT NULL THEN RETURN jsonb_build_object('match_source','funcionario','funcionario_id',r.id,'nome',r.nome,'cargo','funcionario','regiao',r.cidade,'obrigado',true); END IF;

  SELECT id,nome,cidade INTO r FROM pessoas
  WHERE client_id=p_client_id AND public.mission_phone_key(telefone)=k LIMIT 1;
  IF r.id IS NOT NULL THEN RETURN jsonb_build_object('match_source','crm','crm_pessoa_id',r.id,'nome',r.nome,'cargo','contato','regiao',r.cidade,'obrigado',false); END IF;
  RETURN '{}'::jsonb;
END;$function$;

CREATE OR REPLACE FUNCTION public.mission_apply_completed_checkins(
  p_client_id uuid,p_mission_id uuid,p_participant_id uuid DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE v_updated integer:=0;
BEGIN
  UPDATE engagement_obrigacoes o
  SET status='cumprida',cumprida_em=coalesce(o.cumprida_em,c.concluido_em),
    evidencia_nivel=coalesce(o.evidencia_nivel,'E2'),pontos=o.pontos_possiveis,updated_at=now()
  FROM mission_checkins c
  JOIN mission_participants mp ON mp.id=c.participant_id
  WHERE c.client_id=p_client_id AND c.mission_id=p_mission_id
    AND (p_participant_id IS NULL OR c.participant_id=p_participant_id)
    AND c.concluido_em IS NOT NULL
    AND o.client_id=c.client_id AND o.mission_id=c.mission_id AND o.status<>'dispensada'
    AND (
      o.ref_id=c.pessoa_id OR o.ref_id=mp.pessoa_id OR
      (public.mission_phone_key(o.telefone) IS NOT NULL AND
       public.mission_phone_key(o.telefone)=public.mission_phone_key(mp.phone_e164))
    );
  GET DIAGNOSTICS v_updated=ROW_COUNT;
  RETURN v_updated;
END;$function$;

CREATE OR REPLACE FUNCTION public.mission_events_sync_checkin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE p record; is_click boolean; is_done boolean;
BEGIN
  IF coalesce(NEW.is_bot,false) OR NEW.participant_id IS NULL OR NEW.mission_id IS NULL THEN RETURN NEW; END IF;
  SELECT pessoa_id,funcionario_id,contratado_id,client_id,phone_e164 INTO p
  FROM mission_participants WHERE id=NEW.participant_id;
  is_click:=NEW.event_type::text IN('click_facebook','click_instagram','click_avulso','click_link');
  is_done:=NEW.event_type::text='declared_done';

  INSERT INTO mission_checkins(client_id,mission_id,participant_id,pessoa_id,funcionario_id,
    contratado_id,distribution_id,primeiro_acesso_em,ultimo_acesso_em,primeiro_clique_em,
    concluido_em,opens,clicks)
  VALUES(coalesce(NEW.client_id,p.client_id),NEW.mission_id,NEW.participant_id,p.pessoa_id,
    p.funcionario_id,p.contratado_id,NEW.distribution_id,NEW.created_at,NEW.created_at,
    CASE WHEN is_click THEN NEW.created_at END,CASE WHEN is_done THEN NEW.created_at END,
    CASE WHEN NEW.event_type::text='open' THEN 1 ELSE 0 END,CASE WHEN is_click THEN 1 ELSE 0 END)
  ON CONFLICT(mission_id,participant_id) DO UPDATE SET
    ultimo_acesso_em=greatest(mission_checkins.ultimo_acesso_em,NEW.created_at),
    primeiro_clique_em=coalesce(mission_checkins.primeiro_clique_em,CASE WHEN is_click THEN NEW.created_at END),
    concluido_em=coalesce(mission_checkins.concluido_em,CASE WHEN is_done THEN NEW.created_at END),
    opens=mission_checkins.opens+CASE WHEN NEW.event_type::text='open' THEN 1 ELSE 0 END,
    clicks=mission_checkins.clicks+CASE WHEN is_click THEN 1 ELSE 0 END,
    distribution_id=coalesce(mission_checkins.distribution_id,NEW.distribution_id),
    -- A identidade atual reconhecida prevalece sobre snapshots antigos.
    pessoa_id=coalesce(p.pessoa_id,mission_checkins.pessoa_id),
    funcionario_id=coalesce(p.funcionario_id,mission_checkins.funcionario_id),
    contratado_id=coalesce(p.contratado_id,mission_checkins.contratado_id);

  IF is_done THEN PERFORM public.mission_apply_completed_checkins(coalesce(NEW.client_id,p.client_id),NEW.mission_id,NEW.participant_id); END IF;
  RETURN NEW;
END;$function$;

CREATE OR REPLACE FUNCTION public.mission_participant_identity_reconcile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE r record;
BEGIN
  UPDATE mission_checkins SET
    pessoa_id=coalesce(NEW.pessoa_id,pessoa_id),
    funcionario_id=coalesce(NEW.funcionario_id,funcionario_id),
    contratado_id=coalesce(NEW.contratado_id,contratado_id),updated_at=now()
  WHERE participant_id=NEW.id;
  FOR r IN SELECT DISTINCT client_id,mission_id FROM mission_checkins
    WHERE participant_id=NEW.id AND concluido_em IS NOT NULL
  LOOP PERFORM public.mission_apply_completed_checkins(r.client_id,r.mission_id,NEW.id); END LOOP;
  RETURN NEW;
END;$function$;

DROP TRIGGER IF EXISTS trg_mission_participant_identity_reconcile ON mission_participants;
CREATE TRIGGER trg_mission_participant_identity_reconcile
AFTER UPDATE OF pessoa_id,funcionario_id,contratado_id ON mission_participants
FOR EACH ROW WHEN (
  OLD.pessoa_id IS DISTINCT FROM NEW.pessoa_id OR
  OLD.funcionario_id IS DISTINCT FROM NEW.funcionario_id OR
  OLD.contratado_id IS DISTINCT FROM NEW.contratado_id
) EXECUTE FUNCTION public.mission_participant_identity_reconcile();

-- Telefone inequivoco e uma chave segura para religar participantes antigos.
-- Havendo duplicidade, nao escolhe uma pessoa arbitrariamente.
WITH unique_people AS (
  SELECT p.client_id,public.mission_phone_key(p.telefone) phone_key,min(p.id::text)::uuid pessoa_id
  FROM eleicao_pessoas p
  WHERE p.arquivado_em IS NULL AND public.mission_phone_key(p.telefone) IS NOT NULL
  GROUP BY p.client_id,public.mission_phone_key(p.telefone)
  HAVING count(*)=1
)
UPDATE mission_participants mp SET pessoa_id=u.pessoa_id,match_source='eleicao',matched_at=now()
FROM unique_people u
WHERE u.client_id=mp.client_id AND public.mission_phone_key(mp.phone_e164)=u.phone_key
  AND mp.pessoa_id IS DISTINCT FROM u.pessoa_id;

-- Repara check-ins historicos com a identidade atualmente reconhecida.
UPDATE mission_checkins c SET
  pessoa_id=coalesce(mp.pessoa_id,c.pessoa_id),
  funcionario_id=coalesce(mp.funcionario_id,c.funcionario_id),
  contratado_id=coalesce(mp.contratado_id,c.contratado_id),updated_at=now()
FROM mission_participants mp WHERE mp.id=c.participant_id AND (
  (mp.pessoa_id IS NOT NULL AND c.pessoa_id IS DISTINCT FROM mp.pessoa_id) OR
  (mp.funcionario_id IS NOT NULL AND c.funcionario_id IS DISTINCT FROM mp.funcionario_id) OR
  (mp.contratado_id IS NOT NULL AND c.contratado_id IS DISTINCT FROM mp.contratado_id));

SELECT public.mission_apply_completed_checkins(m.client_id,m.id,NULL)
FROM portal_missions m WHERE m.archived_at IS NULL AND coalesce(m.is_active,true);

-- A tela Equipe da campanha passa a ler a evidencia real, mesmo antes de uma
-- eventual materializacao do status da obrigacao.
CREATE OR REPLACE FUNCTION public.engagement_campaign_team(p_client_id uuid,p_dias integer DEFAULT 30)
RETURNS TABLE(pessoa_id uuid,nome text,telefone text,cargo text,regiao text,coordenador_id uuid,
  coordenador_nome text,coordenador_telefone text,contratado boolean,voluntario boolean,missoes integer,
  concluidas integer,pendentes integer,taxa numeric,ultima_atividade timestamptz,status_hoje text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $function$
DECLARE
  v_dia date:=(now() AT TIME ZONE 'America/Cuiaba')::date;
  v_ini timestamptz:=(v_dia::timestamp AT TIME ZONE 'America/Cuiaba');
  v_fim timestamptz:=((v_dia+1)::timestamp AT TIME ZONE 'America/Cuiaba');
  v_mission uuid;
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;
  SELECT m.id INTO v_mission FROM portal_missions m
  WHERE m.client_id=p_client_id AND m.archived_at IS NULL AND coalesce(m.is_active,true)
    AND (coalesce(m.tracking_enabled,false) OR coalesce(m.monitorada,false))
    AND coalesce(m.publicado_em,m.created_at)<v_fim
  ORDER BY coalesce(m.publicado_em,m.created_at) DESC,m.id DESC LIMIT 1;

  RETURN QUERY WITH RECURSIVE pessoas AS MATERIALIZED (
    SELECT e.* FROM eleicao_pessoas e WHERE e.client_id=p_client_id AND e.arquivado_em IS NULL
      AND ((NOT coalesce(e.is_voluntario,false) AND coalesce(e.valor_contratacao,0)>0) OR coalesce(e.is_voluntario,false) OR e.tipo::text='lider')
  ), anc AS (
    SELECT p.id pessoa_id,p.id ancestral,p.parent_id,p.nome,p.telefone,0 nivel FROM pessoas p
    UNION ALL SELECT a.pessoa_id,e.id,e.parent_id,e.nome,e.telefone,a.nivel+1 FROM anc a
      JOIN eleicao_pessoas e ON e.id=a.parent_id AND e.client_id=p_client_id WHERE a.nivel<20
  ), raiz AS (
    SELECT DISTINCT ON(a.pessoa_id) a.pessoa_id,a.ancestral,a.nome,a.telefone
    FROM anc a ORDER BY a.pessoa_id,a.nivel DESC
  ), obligation_facts AS MATERIALIZED (
    SELECT o.ref_id,o.mission_id,
      coalesce(o.cumprida_em,done.concluido_em) concluido_em,
      coalesce(done.ultima,o.updated_at) ultima,
      coalesce(o.status='cumprida' OR done.concluido_em IS NOT NULL,false) cumpriu
    FROM engagement_obrigacoes o
    LEFT JOIN LATERAL (
      SELECT max(c.concluido_em) concluido_em,max(c.ultimo_acesso_em) ultima
      FROM mission_checkins c JOIN mission_participants mp ON mp.id=c.participant_id
      WHERE c.client_id=o.client_id AND c.mission_id=o.mission_id AND (
        c.pessoa_id=o.ref_id OR mp.pessoa_id=o.ref_id OR
        (public.mission_phone_key(o.telefone) IS NOT NULL AND
         public.mission_phone_key(o.telefone)=public.mission_phone_key(mp.phone_e164)))
    ) done ON true
    WHERE o.client_id=p_client_id AND o.origem IN('eleicao','eleicao_pessoas')
      AND o.created_at>=now()-make_interval(days=>greatest(coalesce(p_dias,30),1))
  ), hist AS (
    SELECT f.ref_id,count(DISTINCT f.mission_id)::int total,
      count(DISTINCT f.mission_id) FILTER(WHERE f.cumpriu)::int feitas,
      max(f.ultima) ultima,
      bool_or(f.mission_id=v_mission AND f.cumpriu AND f.concluido_em>=v_ini AND f.concluido_em<v_fim) fez_hoje,
      bool_or(f.mission_id=v_mission AND NOT f.cumpriu) falta_hoje
    FROM obligation_facts f GROUP BY f.ref_id
  )
  SELECT p.id,p.nome,p.telefone,CASE WHEN p.is_voluntario THEN 'voluntario' ELSE p.tipo::text END,
    coalesce(nullif(p.regiao,''),p.bairro),r.ancestral,r.nome,r.telefone,
    NOT coalesce(p.is_voluntario,false) AND coalesce(p.valor_contratacao,0)>0,coalesce(p.is_voluntario,false),
    coalesce(h.total,0),coalesce(h.feitas,0),greatest(coalesce(h.total,0)-coalesce(h.feitas,0),0),
    CASE WHEN coalesce(h.total,0)>0 THEN round(100.0*h.feitas/h.total,1) ELSE 0 END,h.ultima,
    CASE WHEN h.fez_hoje THEN 'concluiu' WHEN h.falta_hoje THEN 'pendente' ELSE 'sem_missao' END
  FROM pessoas p LEFT JOIN raiz r ON r.pessoa_id=p.id LEFT JOIN hist h ON h.ref_id=p.id
  ORDER BY CASE WHEN h.falta_hoje THEN 0 WHEN NOT h.fez_hoje THEN 1 ELSE 2 END,r.nome,p.nome;
END;$function$;

CREATE OR REPLACE FUNCTION public.engagement_mission_tracking_audit(p_client_id uuid,p_mission_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $function$
DECLARE v jsonb;
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;
  SELECT jsonb_build_object(
    'checkins_concluidos',(SELECT count(*) FROM mission_checkins c WHERE c.client_id=p_client_id AND c.mission_id=p_mission_id AND c.concluido_em IS NOT NULL),
    'concluidos_sem_vinculo',(SELECT count(*) FROM mission_checkins c JOIN mission_participants mp ON mp.id=c.participant_id
      WHERE c.client_id=p_client_id AND c.mission_id=p_mission_id AND c.concluido_em IS NOT NULL
        AND c.pessoa_id IS NULL AND mp.pessoa_id IS NULL),
    'obrigacoes_concluidas_pendentes',(SELECT count(*) FROM engagement_obrigacoes o
      WHERE o.client_id=p_client_id AND o.mission_id=p_mission_id AND o.status<>'cumprida' AND EXISTS(
        SELECT 1 FROM mission_checkins c JOIN mission_participants mp ON mp.id=c.participant_id
        WHERE c.client_id=o.client_id AND c.mission_id=o.mission_id AND c.concluido_em IS NOT NULL AND
          (c.pessoa_id=o.ref_id OR mp.pessoa_id=o.ref_id OR
           (public.mission_phone_key(o.telefone) IS NOT NULL AND public.mission_phone_key(o.telefone)=public.mission_phone_key(mp.phone_e164))))),
    'telefones_duplicados_eleicao',(SELECT count(*) FROM (
      SELECT public.mission_phone_key(p.telefone) FROM eleicao_pessoas p
      WHERE p.client_id=p_client_id AND p.arquivado_em IS NULL AND public.mission_phone_key(p.telefone) IS NOT NULL
      GROUP BY 1 HAVING count(*)>1) d),
    'auditado_em',now()
  ) INTO v;
  RETURN v;
END;$function$;

REVOKE ALL ON FUNCTION public.mission_apply_completed_checkins(uuid,uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.engagement_mission_tracking_audit(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mission_apply_completed_checkins(uuid,uuid,uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.engagement_mission_tracking_audit(uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
