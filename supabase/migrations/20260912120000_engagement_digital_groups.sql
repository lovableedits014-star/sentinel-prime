-- Time Digital: captura participantes externos por um convite permanente de lider/grupo.
-- As missoes continuam usando mission_participants; o telefone resolve o vinculo abaixo.

CREATE TABLE IF NOT EXISTS public.engagement_digital_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  nome text NOT NULL CHECK (char_length(btrim(nome)) BETWEEN 2 AND 100),
  leader_person_id uuid REFERENCES public.eleicao_pessoas(id) ON DELETE SET NULL,
  coordinator_person_id uuid REFERENCES public.eleicao_pessoas(id) ON DELETE SET NULL,
  invite_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(18), 'hex'),
  ativo boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_engagement_digital_groups_client
  ON public.engagement_digital_groups(client_id, ativo, created_at DESC);

CREATE TABLE IF NOT EXISTS public.engagement_digital_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.engagement_digital_groups(id) ON DELETE RESTRICT,
  participant_id uuid NOT NULL REFERENCES public.mission_participants(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','inativo','transferido')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_engagement_digital_member_active
  ON public.engagement_digital_group_members(client_id, participant_id)
  WHERE status='ativo';
CREATE INDEX IF NOT EXISTS idx_engagement_digital_members_group
  ON public.engagement_digital_group_members(group_id, status, joined_at DESC);

ALTER TABLE public.engagement_digital_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_digital_group_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS digital_groups_client_all ON public.engagement_digital_groups;
CREATE POLICY digital_groups_client_all ON public.engagement_digital_groups
  FOR ALL TO authenticated
  USING (public.user_can_access_client(client_id))
  WITH CHECK (public.user_can_access_client(client_id));

DROP POLICY IF EXISTS digital_group_members_client_all ON public.engagement_digital_group_members;
CREATE POLICY digital_group_members_client_all ON public.engagement_digital_group_members
  FOR ALL TO authenticated
  USING (public.user_can_access_client(client_id))
  WITH CHECK (public.user_can_access_client(client_id));

GRANT SELECT,INSERT,UPDATE,DELETE ON public.engagement_digital_groups TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.engagement_digital_group_members TO authenticated;
GRANT ALL ON public.engagement_digital_groups, public.engagement_digital_group_members TO service_role;

DROP TRIGGER IF EXISTS trg_engagement_digital_groups_updated ON public.engagement_digital_groups;
CREATE TRIGGER trg_engagement_digital_groups_updated
  BEFORE UPDATE ON public.engagement_digital_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Informacao minima exibida antes do cadastro. Nao expoe ids internos ou telefones.
CREATE OR REPLACE FUNCTION public.digital_group_public_info(p_token text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $function$
  SELECT CASE WHEN g.id IS NULL THEN jsonb_build_object('ok',false,'motivo','link_invalido')
    ELSE jsonb_build_object(
      'ok',true,
      'grupo',g.nome,
      'lider',coalesce(l.nome,'Equipe digital'),
      'coordenador',c.nome,
      'campanha',cl.name,
      'logo_url',cl.logo_url
    ) END
  FROM (SELECT 1) seed
  LEFT JOIN engagement_digital_groups g ON g.invite_token=p_token AND g.ativo
  LEFT JOIN eleicao_pessoas l ON l.id=g.leader_person_id AND l.client_id=g.client_id
  LEFT JOIN eleicao_pessoas c ON c.id=g.coordinator_person_id AND c.client_id=g.client_id
  LEFT JOIN clients cl ON cl.id=g.client_id;
$function$;

-- Cadastro idempotente por telefone. Um convite diferente nunca captura um membro ativo.
CREATE OR REPLACE FUNCTION public.digital_group_join(p_token text,p_nome text,p_phone text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE
  g engagement_digital_groups%rowtype;
  v_phone text;
  v_participant uuid;
  v_existing_group uuid;
  v_member uuid;
BEGIN
  SELECT * INTO g FROM engagement_digital_groups WHERE invite_token=p_token AND ativo FOR SHARE;
  IF g.id IS NULL THEN RETURN jsonb_build_object('ok',false,'motivo','link_invalido'); END IF;
  IF char_length(btrim(coalesce(p_nome,'')))<3 THEN
    RETURN jsonb_build_object('ok',false,'motivo','nome_invalido');
  END IF;
  v_phone:=public.mission_norm_phone(p_phone);
  IF v_phone IS NULL THEN
    RETURN jsonb_build_object('ok',false,'motivo','telefone_invalido');
  END IF;

  -- Serializa cadastros simultaneos do mesmo telefone para nao criar vinculos concorrentes.
  PERFORM pg_advisory_xact_lock(hashtextextended(g.client_id::text||':'||public.mission_phone_key(v_phone),0));

  SELECT mp.id INTO v_participant FROM mission_participants mp
  WHERE mp.client_id=g.client_id AND public.mission_phone_key(mp.phone_e164)=public.mission_phone_key(v_phone)
  ORDER BY mp.created_at LIMIT 1;

  IF v_participant IS NULL THEN
    INSERT INTO mission_participants(client_id,phone_e164,nome,first_seen_at,last_seen_at)
    VALUES(g.client_id,v_phone,left(btrim(p_nome),100),now(),now()) RETURNING id INTO v_participant;
  ELSE
    -- Um convite publico nao pode sobrescrever o nome de uma identidade ja conhecida.
    UPDATE mission_participants SET last_seen_at=now()
    WHERE id=v_participant;
  END IF;

  SELECT m.group_id INTO v_existing_group FROM engagement_digital_group_members m
  WHERE m.client_id=g.client_id AND m.participant_id=v_participant AND m.status='ativo';
  IF v_existing_group IS NOT NULL AND v_existing_group<>g.id THEN
    RETURN jsonb_build_object('ok',false,'motivo','ja_vinculado');
  END IF;

  INSERT INTO engagement_digital_group_members(client_id,group_id,participant_id)
  SELECT g.client_id,g.id,v_participant WHERE v_existing_group IS NULL
  RETURNING id INTO v_member;

  RETURN jsonb_build_object('ok',true,'ja_cadastrado',v_existing_group=g.id,'grupo',g.nome);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('ok',false,'motivo','ja_vinculado');
END;$function$;

-- Painel enxuto: membros, atividade e conclusoes, agregados no banco.
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
    g.coordinator_person_id,c.nome,
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

CREATE OR REPLACE FUNCTION public.digital_group_members_list(p_client_id uuid,p_group_id uuid DEFAULT NULL)
RETURNS TABLE(member_id uuid,group_id uuid,grupo text,participant_id uuid,nome text,telefone text,
  status text,joined_at timestamptz,missoes_acessadas bigint,missoes_concluidas bigint,ultimo_acesso timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $function$
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;
  RETURN QUERY SELECT m.id,m.group_id,g.nome,mp.id,mp.nome,mp.phone_e164,m.status,m.joined_at,
    count(DISTINCT ch.mission_id),count(DISTINCT ch.mission_id) FILTER(WHERE ch.concluido_em IS NOT NULL),
    max(ch.ultimo_acesso_em)
  FROM engagement_digital_group_members m
  JOIN engagement_digital_groups g ON g.id=m.group_id
  JOIN mission_participants mp ON mp.id=m.participant_id
  LEFT JOIN mission_checkins ch ON ch.participant_id=m.participant_id AND ch.client_id=m.client_id
  WHERE m.client_id=p_client_id AND (p_group_id IS NULL OR m.group_id=p_group_id)
  GROUP BY m.id,g.nome,mp.id ORDER BY m.status='ativo' DESC,m.joined_at DESC;
END;$function$;

REVOKE ALL ON FUNCTION public.digital_group_public_info(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.digital_group_join(text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.digital_group_dashboard(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.digital_group_members_list(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.digital_group_public_info(text) TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.digital_group_join(text,text,text) TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.digital_group_dashboard(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.digital_group_members_list(uuid,uuid) TO authenticated,service_role;

NOTIFY pgrst,'reload schema';
