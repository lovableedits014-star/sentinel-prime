-- Coordenador exclusivo do Time Digital, sem contrato ou cadastro na Eleicao.
ALTER TABLE public.engagement_digital_groups
  ADD COLUMN IF NOT EXISTS coordinator_name text,
  ADD COLUMN IF NOT EXISTS coordinator_phone text;

ALTER TABLE public.engagement_digital_groups
  DROP CONSTRAINT IF EXISTS engagement_digital_groups_coordinator_name_check;
ALTER TABLE public.engagement_digital_groups
  ADD CONSTRAINT engagement_digital_groups_coordinator_name_check
  CHECK (coordinator_name IS NULL OR char_length(btrim(coordinator_name)) BETWEEN 3 AND 100);

CREATE OR REPLACE FUNCTION public.digital_group_normalize_external_coordinator()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $function$
BEGIN
  IF NEW.coordinator_person_id IS NOT NULL THEN
    NEW.coordinator_name:=NULL;
    NEW.coordinator_phone:=NULL;
  ELSE
    NEW.coordinator_name:=nullif(btrim(NEW.coordinator_name),'');
    NEW.coordinator_phone:=public.mission_norm_phone(NEW.coordinator_phone);
    IF NEW.coordinator_name IS NULL OR NEW.coordinator_phone IS NULL THEN
      RAISE EXCEPTION 'Informe nome e WhatsApp validos do coordenador';
    END IF;
  END IF;
  RETURN NEW;
END;$function$;

DROP TRIGGER IF EXISTS trg_digital_group_external_coordinator ON public.engagement_digital_groups;
CREATE TRIGGER trg_digital_group_external_coordinator
  BEFORE INSERT OR UPDATE OF coordinator_person_id,coordinator_name,coordinator_phone
  ON public.engagement_digital_groups
  FOR EACH ROW EXECUTE FUNCTION public.digital_group_normalize_external_coordinator();

CREATE OR REPLACE FUNCTION public.digital_group_public_info(p_token text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $function$
  SELECT CASE WHEN g.id IS NULL THEN jsonb_build_object('ok',false,'motivo','link_invalido')
    ELSE jsonb_build_object(
      'ok',true,'grupo',g.nome,'lider',coalesce(l.nome,'Equipe digital'),
      'coordenador',coalesce(c.nome,g.coordinator_name),
      'campanha',cl.name,'logo_url',cl.logo_url
    ) END
  FROM (SELECT 1) seed
  LEFT JOIN engagement_digital_groups g ON g.invite_token=p_token AND g.ativo
  LEFT JOIN eleicao_pessoas l ON l.id=g.leader_person_id AND l.client_id=g.client_id
  LEFT JOIN eleicao_pessoas c ON c.id=g.coordinator_person_id AND c.client_id=g.client_id
  LEFT JOIN clients cl ON cl.id=g.client_id;
$function$;

CREATE OR REPLACE FUNCTION public.digital_group_dashboard(p_client_id uuid)
RETURNS TABLE(group_id uuid,grupo text,ativo boolean,invite_token text,
  leader_person_id uuid,lider text,coordinator_person_id uuid,coordenador text,
  membros bigint,membros_ativos_30d bigint,missoes_acessadas bigint,missoes_concluidas bigint,
  created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $function$
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;
  RETURN QUERY
  SELECT g.id,g.nome,g.ativo,g.invite_token,g.leader_person_id,l.nome,
    g.coordinator_person_id,coalesce(c.nome,g.coordinator_name),
    count(DISTINCT m.participant_id) FILTER(WHERE m.status='ativo'),
    count(DISTINCT m.participant_id) FILTER(WHERE m.status='ativo' AND mp.last_seen_at>=now()-interval '30 days'),
    count(DISTINCT (ch.participant_id,ch.mission_id)),
    count(DISTINCT (ch.participant_id,ch.mission_id)) FILTER(WHERE ch.concluido_em IS NOT NULL),g.created_at
  FROM engagement_digital_groups g
  LEFT JOIN eleicao_pessoas l ON l.id=g.leader_person_id
  LEFT JOIN eleicao_pessoas c ON c.id=g.coordinator_person_id
  LEFT JOIN engagement_digital_group_members m ON m.group_id=g.id
  LEFT JOIN mission_participants mp ON mp.id=m.participant_id
  LEFT JOIN mission_checkins ch ON ch.participant_id=m.participant_id AND ch.client_id=g.client_id
  WHERE g.client_id=p_client_id
  GROUP BY g.id,l.nome,c.nome ORDER BY g.ativo DESC,g.created_at DESC;
END;$function$;

REVOKE ALL ON FUNCTION public.digital_group_public_info(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.digital_group_dashboard(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.digital_group_public_info(text) TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.digital_group_dashboard(uuid) TO authenticated,service_role;
NOTIFY pgrst,'reload schema';
