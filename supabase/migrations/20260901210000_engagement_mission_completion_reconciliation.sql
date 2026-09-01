-- Reconcilia conclusoes historicas com lideres por identidade e, somente
-- quando o telefone pertence a uma unica pessoa, por telefone.

WITH unique_leader_phone AS (
  SELECT p.client_id,public.mission_phone_key(p.telefone) phone_key,
    (array_agg(p.id ORDER BY p.id::text))[1] pessoa_id
  FROM public.eleicao_pessoas p
  WHERE p.tipo::text='lider' AND p.arquivado_em IS NULL
    AND public.mission_phone_key(p.telefone) IS NOT NULL
  GROUP BY p.client_id,public.mission_phone_key(p.telefone)
  HAVING count(*)=1
)
UPDATE public.mission_participants mp
SET pessoa_id=u.pessoa_id,match_source='unique_leader_phone_repair',matched_at=coalesce(mp.matched_at,now()),updated_at=now()
FROM unique_leader_phone u
WHERE mp.client_id=u.client_id AND mp.pessoa_id IS NULL
  AND public.mission_phone_key(mp.phone_e164)=u.phone_key;

UPDATE public.mission_checkins c
SET pessoa_id=mp.pessoa_id,updated_at=now()
FROM public.mission_participants mp
WHERE mp.id=c.participant_id AND c.pessoa_id IS NULL AND mp.pessoa_id IS NOT NULL;

UPDATE public.engagement_obrigacoes o
SET status='cumprida',cumprida_em=coalesce(o.cumprida_em,c.concluido_em),
  evidencia_nivel=coalesce(o.evidencia_nivel,'E2'),pontos=o.pontos_possiveis,updated_at=now()
FROM public.mission_checkins c
JOIN public.mission_participants mp ON mp.id=c.participant_id
WHERE c.concluido_em IS NOT NULL AND o.client_id=c.client_id AND o.mission_id=c.mission_id
  AND o.status<>'dispensada' AND o.origem IN('eleicao','eleicao_pessoas')
  AND (
    o.ref_id=coalesce(c.pessoa_id,mp.pessoa_id)
    OR (public.mission_phone_key(o.telefone) IS NOT NULL
      AND public.mission_phone_key(o.telefone)=public.mission_phone_key(mp.phone_e164))
  );

CREATE OR REPLACE FUNCTION public.engagement_mission_completion_audit(
  p_client_id uuid,p_mission_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $function$
DECLARE v_result jsonb;
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;
  WITH obligations AS MATERIALIZED (
    SELECT DISTINCT o.ref_id pessoa_id,o.nome,o.telefone
    FROM engagement_obrigacoes o
    WHERE o.client_id=p_client_id AND o.mission_id=p_mission_id
      AND o.status<>'dispensada' AND o.origem IN('eleicao','eleicao_pessoas')
  ), completed AS MATERIALIZED (
    SELECT DISTINCT c.participant_id,c.pessoa_id,mp.pessoa_id participant_pessoa_id,
      mp.nome,mp.phone_e164,c.concluido_em
    FROM mission_checkins c JOIN mission_participants mp ON mp.id=c.participant_id
    WHERE c.client_id=p_client_id AND c.mission_id=p_mission_id AND c.concluido_em IS NOT NULL
  ), matches AS MATERIALIZED (
    SELECT DISTINCT o.pessoa_id,c.participant_id
    FROM obligations o JOIN completed c ON
      o.pessoa_id=coalesce(c.pessoa_id,c.participant_pessoa_id)
      OR (public.mission_phone_key(o.telefone) IS NOT NULL
        AND public.mission_phone_key(o.telefone)=public.mission_phone_key(c.phone_e164))
  ), report AS MATERIALIZED (
    SELECT * FROM engagement_pub_facts_v2(p_client_id,3650,NULL,0,NULL,p_mission_id)
  ), report_done AS (
    SELECT count(DISTINCT (r.origem,r.pessoa_id))::integer total
    FROM report r WHERE r.status='cumpriu' AND r.origem IN('eleicao','eleicao_pessoas')
  ), unmatched AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object('participant_id',c.participant_id,
      'nome',c.nome,'telefone',c.phone_e164,'concluido_em',c.concluido_em)
      ORDER BY c.nome),'[]'::jsonb) pessoas
    FROM completed c WHERE NOT EXISTS(SELECT 1 FROM matches x WHERE x.participant_id=c.participant_id)
  )
  SELECT jsonb_build_object(
    'obrigados',(SELECT count(*) FROM obligations),
    'confirmacoes_brutas',(SELECT count(*) FROM completed),
    'lideres_confirmados',(SELECT count(DISTINCT pessoa_id) FROM matches),
    'confirmacoes_fora_da_base',(SELECT count(*) FROM completed c WHERE NOT EXISTS(
      SELECT 1 FROM matches x WHERE x.participant_id=c.participant_id)),
    'concluidos_exibidos',r.total,
    'consistente',(r.total=(SELECT count(DISTINCT pessoa_id) FROM matches)),
    'nao_vinculados',u.pessoas,
    'auditado_em',now()
  ) INTO v_result FROM report_done r CROSS JOIN unmatched u;
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.engagement_mission_completion_audit(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.engagement_mission_completion_audit(uuid,uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
