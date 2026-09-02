-- Cobranca por coordenador calculada diretamente da fotografia de contratos da
-- missao e da arvore parent_id. Nao depende do relatorio analitico generico.

CREATE OR REPLACE FUNCTION public.engagement_coordinator_mission_charge(
  p_client_id uuid,
  p_mission_id uuid
)
RETURNS TABLE(
  coordenador_id uuid,
  coordenador_nome text,
  coordenador_telefone text,
  total_lideres integer,
  concluidos integer,
  abriu_sem_concluir integer,
  nao_abriu integer,
  taxa numeric,
  concluidos_nomes jsonb,
  abriu_nomes jsonb,
  nao_abriu_nomes jsonb
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;

  RETURN QUERY
  WITH RECURSIVE required AS MATERIALIZED (
    SELECT o.ref_id pessoa_id,o.nome,o.telefone,o.status,o.cumprida_em
    FROM engagement_obrigacoes o
    JOIN eleicao_pessoas p ON p.id=o.ref_id AND p.client_id=o.client_id
    WHERE o.client_id=p_client_id AND o.mission_id=p_mission_id
      AND o.status<>'dispensada' AND o.origem IN('eleicao','eleicao_pessoas')
      AND p.arquivado_em IS NULL AND NOT coalesce(p.is_voluntario,false)
      AND coalesce(p.valor_contratacao,0)>0
  ), ancestry AS MATERIALIZED (
    SELECT r.pessoa_id obrigado_id,p.id ancestor_id,p.parent_id,p.tipo::text tipo,0 depth,
      ARRAY[p.id] caminho
    FROM required r JOIN eleicao_pessoas p ON p.id=r.pessoa_id AND p.client_id=p_client_id
    UNION ALL
    SELECT a.obrigado_id,p.id,p.parent_id,p.tipo::text,a.depth+1,a.caminho||p.id
    FROM ancestry a
    JOIN eleicao_pessoas p ON p.id=a.parent_id AND p.client_id=p_client_id
    WHERE a.depth<20 AND p.arquivado_em IS NULL AND NOT p.id=ANY(a.caminho)
  ), owner AS MATERIALIZED (
    SELECT DISTINCT ON(a.obrigado_id) a.obrigado_id,a.ancestor_id coordenador_id
    FROM ancestry a
    WHERE a.tipo='coordenador' AND a.ancestor_id<>a.obrigado_id
    ORDER BY a.obrigado_id,a.depth
  ), checkin_fact AS MATERIALIZED (
    SELECT r.pessoa_id,
      min(c.primeiro_acesso_em) primeiro_acesso,
      max(c.concluido_em) concluido_em
    FROM required r
    LEFT JOIN mission_checkins c ON c.client_id=p_client_id AND c.mission_id=p_mission_id
      AND EXISTS(
        SELECT 1 FROM mission_participants mp
        WHERE mp.id=c.participant_id AND (
          c.pessoa_id=r.pessoa_id OR mp.pessoa_id=r.pessoa_id OR
          (public.mission_phone_key(r.telefone) IS NOT NULL AND
           public.mission_phone_key(r.telefone)=public.mission_phone_key(mp.phone_e164))
        )
      )
    GROUP BY r.pessoa_id
  ), members AS MATERIALIZED (
    SELECT ow.coordenador_id,r.pessoa_id,r.nome,
      CASE
        WHEN cf.concluido_em IS NOT NULL OR r.status='cumprida' THEN 'cumpriu'
        WHEN cf.primeiro_acesso IS NOT NULL THEN 'abriu'
        ELSE 'nao_abriu'
      END status
    FROM required r
    JOIN owner ow ON ow.obrigado_id=r.pessoa_id
    LEFT JOIN checkin_fact cf ON cf.pessoa_id=r.pessoa_id
  )
  SELECT c.id,c.nome,c.telefone,
    count(m.pessoa_id)::integer,
    count(*) FILTER(WHERE m.status='cumpriu')::integer,
    count(*) FILTER(WHERE m.status='abriu')::integer,
    count(*) FILTER(WHERE m.status='nao_abriu')::integer,
    CASE WHEN count(m.pessoa_id)>0
      THEN round(100.0*count(*) FILTER(WHERE m.status='cumpriu')/count(m.pessoa_id),1)
      ELSE 0 END,
    coalesce(jsonb_agg(m.nome ORDER BY m.nome) FILTER(WHERE m.status='cumpriu'),'[]'::jsonb),
    coalesce(jsonb_agg(m.nome ORDER BY m.nome) FILTER(WHERE m.status='abriu'),'[]'::jsonb),
    coalesce(jsonb_agg(m.nome ORDER BY m.nome) FILTER(WHERE m.status='nao_abriu'),'[]'::jsonb)
  FROM eleicao_pessoas c
  JOIN members m ON m.coordenador_id=c.id
  WHERE c.client_id=p_client_id AND c.tipo::text='coordenador' AND c.arquivado_em IS NULL
  GROUP BY c.id,c.nome,c.telefone
  ORDER BY count(*) FILTER(WHERE m.status<>'cumpriu') DESC,c.nome;
END;
$function$;

-- Diagnostico simples para conferir quantos contratos ficaram em equipes e
-- quantos permanecem para cobranca individual (coordenadores e avulsos).
CREATE OR REPLACE FUNCTION public.engagement_mission_assignment_audit(
  p_client_id uuid,p_mission_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_result jsonb;
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;
  WITH RECURSIVE required AS (
    SELECT o.ref_id pessoa_id FROM engagement_obrigacoes o
    WHERE o.client_id=p_client_id AND o.mission_id=p_mission_id
      AND o.status<>'dispensada' AND o.origem IN('eleicao','eleicao_pessoas')
  ), ancestry AS (
    SELECT r.pessoa_id obrigado_id,p.id,p.parent_id,p.tipo::text tipo,0 depth,ARRAY[p.id] caminho
    FROM required r JOIN eleicao_pessoas p ON p.id=r.pessoa_id AND p.client_id=p_client_id
    UNION ALL
    SELECT a.obrigado_id,p.id,p.parent_id,p.tipo::text,a.depth+1,a.caminho||p.id
    FROM ancestry a JOIN eleicao_pessoas p ON p.id=a.parent_id AND p.client_id=p_client_id
    WHERE a.depth<20 AND NOT p.id=ANY(a.caminho)
  ), assigned AS (
    SELECT DISTINCT obrigado_id FROM ancestry
    WHERE tipo='coordenador' AND id<>obrigado_id
  )
  SELECT jsonb_build_object(
    'contratados_obrigatorios',(SELECT count(*) FROM required),
    'em_equipes',(SELECT count(*) FROM assigned),
    'cobranca_individual',(SELECT count(*) FROM required r WHERE NOT EXISTS(
      SELECT 1 FROM assigned a WHERE a.obrigado_id=r.pessoa_id)),
    'confere',(SELECT count(*) FROM required)=
      (SELECT count(*) FROM assigned)+(SELECT count(*) FROM required r WHERE NOT EXISTS(
        SELECT 1 FROM assigned a WHERE a.obrigado_id=r.pessoa_id))
  ) INTO v_result;
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.engagement_coordinator_mission_charge(uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.engagement_mission_assignment_audit(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.engagement_coordinator_mission_charge(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.engagement_mission_assignment_audit(uuid,uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
