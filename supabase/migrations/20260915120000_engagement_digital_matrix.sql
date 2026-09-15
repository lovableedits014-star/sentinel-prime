-- Matriz dedicada ao Time Digital, com correcoes manuais auditadas por participante.

CREATE TABLE IF NOT EXISTS public.engagement_digital_completion_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES public.portal_missions(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES public.mission_participants(id) ON DELETE CASCADE,
  completed boolean NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) >= 5),
  changed_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_digital_completion_audit_lookup
  ON public.engagement_digital_completion_audit(client_id, mission_id, participant_id, created_at DESC);

ALTER TABLE public.engagement_digital_completion_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Equipe do cliente le auditoria digital" ON public.engagement_digital_completion_audit;
CREATE POLICY "Equipe do cliente le auditoria digital"
  ON public.engagement_digital_completion_audit FOR SELECT TO authenticated
  USING (public.is_client_member(client_id));

CREATE OR REPLACE FUNCTION public.engagement_digital_matrix_periodo(
  p_client_id uuid,
  p_data_inicio date,
  p_data_fim date,
  p_audience_id uuid DEFAULT NULL,
  p_mission_id uuid DEFAULT NULL
) RETURNS TABLE(
  pessoa_id uuid, origem text, nome text, telefone text, cargo text, regiao text, cidade text,
  is_voluntario boolean, tem_contrato boolean, publicacoes integer, cumpridas integer,
  abriu_sem_confirmar integer, faltas integer, pct numeric, prova_principal text, faixa text,
  pct_anterior numeric, variacao numeric, ultima_atividade timestamptz, detalhe jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $function$
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;
  IF p_data_inicio IS NULL OR p_data_fim IS NULL OR p_data_fim < p_data_inicio THEN
    RAISE EXCEPTION 'Periodo invalido';
  END IF;

  RETURN QUERY WITH members AS MATERIALIZED (
    SELECT DISTINCT ON (m.participant_id)
      m.participant_id, mp.nome, mp.phone_e164, g.nome grupo
    FROM engagement_digital_group_members m
    JOIN engagement_digital_groups g ON g.id=m.group_id AND g.client_id=m.client_id
    JOIN mission_participants mp ON mp.id=m.participant_id AND mp.client_id=m.client_id
    WHERE m.client_id=p_client_id AND m.status='ativo' AND g.ativo
    ORDER BY m.participant_id,m.joined_at DESC
  ), missions AS MATERIALIZED (
    SELECT pm.id,pm.title,coalesce(pm.publicado_em,pm.created_at) publicado_em
    FROM portal_missions pm
    WHERE pm.client_id=p_client_id AND pm.archived_at IS NULL
      AND (p_mission_id IS NULL OR pm.id=p_mission_id)
      AND (p_audience_id IS NULL OR pm.audience_id IS NULL OR pm.audience_id=p_audience_id)
      AND coalesce(pm.publicado_em,pm.created_at) >= p_data_inicio::timestamp AT TIME ZONE 'America/Campo_Grande'
      AND coalesce(pm.publicado_em,pm.created_at) < (p_data_fim+1)::timestamp AT TIME ZONE 'America/Campo_Grande'
  ), latest_manual AS MATERIALIZED (
    SELECT DISTINCT ON (a.mission_id,a.participant_id)
      a.mission_id,a.participant_id,a.completed,a.created_at
    FROM engagement_digital_completion_audit a
    WHERE a.client_id=p_client_id AND a.mission_id IN (SELECT x.id FROM missions x)
    ORDER BY a.mission_id,a.participant_id,a.created_at DESC,a.id DESC
  ), facts AS MATERIALIZED (
    SELECT mb.participant_id,mb.nome,mb.phone_e164,mb.grupo,ms.id mission_id,ms.title,ms.publicado_em,
      CASE WHEN lm.completed IS NOT NULL THEN lm.completed
           ELSE ch.concluido_em IS NOT NULL END completed,
      CASE WHEN lm.completed IS NOT NULL THEN true
           ELSE ch.primeiro_acesso_em IS NOT NULL OR ch.opens>0 OR ch.clicks>0 END opened,
      lm.completed IS TRUE manual,
      greatest(ch.ultimo_acesso_em,lm.created_at) atividade
    FROM members mb CROSS JOIN missions ms
    LEFT JOIN mission_checkins ch ON ch.client_id=p_client_id
      AND ch.mission_id=ms.id AND ch.participant_id=mb.participant_id
    LEFT JOIN latest_manual lm ON lm.mission_id=ms.id AND lm.participant_id=mb.participant_id
  ), agg AS (
    SELECT f.participant_id,min(f.nome) nome,min(f.phone_e164) telefone,min(f.grupo) grupo,
      count(*)::int pubs,count(*) FILTER(WHERE f.completed)::int cump,
      count(*) FILTER(WHERE NOT f.completed AND f.opened)::int abriu,
      count(*) FILTER(WHERE NOT f.completed AND NOT f.opened)::int faltas,
      max(f.atividade) ultima,
      jsonb_agg(jsonb_build_object(
        'mission_id',f.mission_id,'titulo',f.title,'publicado_em',f.publicado_em,
        'status',CASE WHEN f.completed THEN 'cumpriu' WHEN f.opened THEN 'abriu' ELSE 'nao_abriu' END,
        'prova',CASE WHEN f.manual THEN 'E3' WHEN f.completed THEN 'E2' ELSE NULL END
      ) ORDER BY f.publicado_em DESC) detalhes
    FROM facts f GROUP BY f.participant_id
  )
  SELECT a.participant_id,'digital'::text,a.nome,a.telefone,a.grupo,'Time Digital'::text,NULL::text,
    false,false,a.pubs,a.cump,a.abriu,a.faltas,
    CASE WHEN a.pubs>0 THEN round(a.cump::numeric/a.pubs*100,1) ELSE 0 END,
    CASE WHEN a.cump>0 THEN 'E2'::text ELSE NULL::text END,
    CASE WHEN a.pubs=0 OR a.cump=0 THEN 'critico'
         WHEN a.cump::numeric/a.pubs>=.8 THEN 'excelente'
         WHEN a.cump::numeric/a.pubs>=.5 THEN 'atencao' ELSE 'baixo' END,
    NULL::numeric,NULL::numeric,a.ultima,coalesce(a.detalhes,'[]'::jsonb)
  FROM agg a ORDER BY a.grupo,a.nome;
END;$function$;

CREATE OR REPLACE FUNCTION public.engagement_set_digital_manual_completion(
  p_client_id uuid, p_mission_id uuid, p_participant_id uuid,
  p_completed boolean, p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;
  IF length(btrim(coalesce(p_reason,''))) < 5 THEN RAISE EXCEPTION 'Informe o motivo da correcao'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM engagement_digital_group_members m
    JOIN engagement_digital_groups g ON g.id=m.group_id
    WHERE m.client_id=p_client_id AND m.participant_id=p_participant_id
  ) THEN RAISE EXCEPTION 'Integrante do Time Digital nao encontrado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM portal_missions WHERE id=p_mission_id AND client_id=p_client_id) THEN
    RAISE EXCEPTION 'Missao nao encontrada';
  END IF;

  INSERT INTO engagement_digital_completion_audit(
    client_id,mission_id,participant_id,completed,reason,changed_by
  ) VALUES (p_client_id,p_mission_id,p_participant_id,p_completed,btrim(p_reason),auth.uid());

  RETURN jsonb_build_object('ok',true,'completed',p_completed);
END;$function$;

REVOKE ALL ON TABLE public.engagement_digital_completion_audit FROM PUBLIC,anon;
GRANT SELECT ON TABLE public.engagement_digital_completion_audit TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.engagement_digital_matrix_periodo(uuid,date,date,uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.engagement_set_digital_manual_completion(uuid,uuid,uuid,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.engagement_digital_matrix_periodo(uuid,date,date,uuid,uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.engagement_set_digital_manual_completion(uuid,uuid,uuid,boolean,text) TO authenticated,service_role;

NOTIFY pgrst,'reload schema';
