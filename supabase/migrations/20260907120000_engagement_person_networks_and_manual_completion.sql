-- Preferencias individuais de rede e correcao administrativa auditavel de missoes.
-- Nao altera historico existente nem marca qualquer pessoa automaticamente.

ALTER TABLE public.eleicao_pessoas
  ADD COLUMN IF NOT EXISTS missao_facebook_ativo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS missao_instagram_ativo boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.eleicao_pessoas.missao_facebook_ativo IS
  'Quando falso, links do Facebook nao sao exibidos nem exigidos nas missoes desta pessoa.';
COMMENT ON COLUMN public.eleicao_pessoas.missao_instagram_ativo IS
  'Quando falso, links do Instagram nao sao exibidos nem exigidos nas missoes desta pessoa.';

CREATE TABLE IF NOT EXISTS public.engagement_manual_completion_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES public.portal_missions(id) ON DELETE CASCADE,
  pessoa_id uuid NOT NULL REFERENCES public.eleicao_pessoas(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('complete','revert')),
  reason text NOT NULL,
  previous_status text,
  previous_completed_at timestamptz,
  previous_evidence_level text,
  previous_evidence_validated boolean,
  changed_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.engagement_manual_completion_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.engagement_manual_completion_audit FROM PUBLIC, anon;
GRANT SELECT ON public.engagement_manual_completion_audit TO authenticated;
GRANT ALL ON public.engagement_manual_completion_audit TO service_role;

DROP POLICY IF EXISTS "Members read manual completion audit" ON public.engagement_manual_completion_audit;
CREATE POLICY "Members read manual completion audit"
  ON public.engagement_manual_completion_audit FOR SELECT TO authenticated
  USING (public.is_client_member(client_id));

CREATE INDEX IF NOT EXISTS idx_manual_completion_person_mission
  ON public.engagement_manual_completion_audit(client_id, pessoa_id, mission_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.engagement_set_person_social_requirements(
  p_client_id uuid,
  p_pessoa_id uuid,
  p_facebook boolean,
  p_instagram boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE v_nome text;
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;
  IF NOT coalesce(p_facebook,false) AND NOT coalesce(p_instagram,false) THEN
    RAISE EXCEPTION 'Selecione pelo menos uma rede social';
  END IF;

  UPDATE eleicao_pessoas
  SET missao_facebook_ativo=coalesce(p_facebook,false),
      missao_instagram_ativo=coalesce(p_instagram,false),
      updated_at=now()
  WHERE id=p_pessoa_id AND client_id=p_client_id AND arquivado_em IS NULL
  RETURNING nome INTO v_nome;

  IF v_nome IS NULL THEN RAISE EXCEPTION 'Pessoa nao encontrada'; END IF;
  RETURN jsonb_build_object('ok',true,'pessoa_id',p_pessoa_id,'nome',v_nome,
    'facebook',p_facebook,'instagram',p_instagram);
END;$function$;

CREATE OR REPLACE FUNCTION public.engagement_set_manual_completion(
  p_client_id uuid,
  p_mission_id uuid,
  p_pessoa_id uuid,
  p_completed boolean,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE
  v_o engagement_obrigacoes%ROWTYPE;
  v_real_done timestamptz;
  v_reason text:=btrim(coalesce(p_reason,''));
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;
  IF length(v_reason)<5 THEN RAISE EXCEPTION 'Informe um motivo com pelo menos 5 caracteres'; END IF;
  IF NOT EXISTS(SELECT 1 FROM eleicao_pessoas p WHERE p.id=p_pessoa_id AND p.client_id=p_client_id) THEN
    RAISE EXCEPTION 'Pessoa nao encontrada';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM portal_missions m WHERE m.id=p_mission_id AND m.client_id=p_client_id) THEN
    RAISE EXCEPTION 'Missao nao encontrada';
  END IF;

  SELECT * INTO v_o FROM engagement_obrigacoes o
  WHERE o.client_id=p_client_id AND o.mission_id=p_mission_id
    AND o.ref_id=p_pessoa_id AND o.origem IN('eleicao','eleicao_pessoas')
  ORDER BY CASE WHEN o.origem='eleicao' THEN 0 ELSE 1 END LIMIT 1 FOR UPDATE;
  IF v_o.id IS NULL THEN RAISE EXCEPTION 'Esta pessoa nao esta na lista de obrigados da missao'; END IF;

  INSERT INTO engagement_manual_completion_audit(
    client_id,mission_id,pessoa_id,action,reason,previous_status,
    previous_completed_at,previous_evidence_level,previous_evidence_validated
  ) VALUES(
    p_client_id,p_mission_id,p_pessoa_id,CASE WHEN p_completed THEN 'complete' ELSE 'revert' END,
    v_reason,v_o.status,v_o.cumprida_em,v_o.evidencia_nivel,v_o.evidencia_validada
  );

  IF p_completed THEN
    UPDATE engagement_obrigacoes SET status='cumprida',cumprida_em=coalesce(cumprida_em,now()),
      evidencia_nivel='E3',evidencia_validada=true,pontos=pontos_possiveis,
      justificativa=v_reason,updated_at=now()
    WHERE id=v_o.id;
  ELSE
    SELECT max(c.concluido_em) INTO v_real_done
    FROM mission_checkins c JOIN mission_participants mp ON mp.id=c.participant_id
    WHERE c.client_id=p_client_id AND c.mission_id=p_mission_id AND c.concluido_em IS NOT NULL
      AND (c.pessoa_id=p_pessoa_id OR mp.pessoa_id=p_pessoa_id OR
        (public.mission_phone_key(v_o.telefone) IS NOT NULL AND
         public.mission_phone_key(v_o.telefone)=public.mission_phone_key(mp.phone_e164)));

    UPDATE engagement_obrigacoes SET
      status=CASE WHEN v_real_done IS NOT NULL THEN 'cumprida' ELSE 'pendente' END,
      cumprida_em=v_real_done,
      evidencia_nivel=CASE WHEN v_real_done IS NOT NULL THEN 'E2' ELSE NULL END,
      evidencia_validada=false,
      pontos=CASE WHEN v_real_done IS NOT NULL THEN pontos_possiveis ELSE 0 END,
      justificativa=CASE WHEN v_real_done IS NOT NULL THEN justificativa ELSE NULL END,
      updated_at=now()
    WHERE id=v_o.id;
  END IF;

  RETURN jsonb_build_object('ok',true,'completed',p_completed,'mission_id',p_mission_id,'pessoa_id',p_pessoa_id);
END;$function$;

-- A configuracao publica remove a rede dispensada depois de reconhecer a pessoa.
CREATE OR REPLACE FUNCTION public.public_mission_config(p_mission_id uuid, p_code text, p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE
  v_mission record; v_client_name text; v_dist record; v_tok record;
  v_participant record; v_distribution_valid boolean:=false;
  v_group_name text:=null; v_participant_json jsonb:=null; v_done timestamptz;
  v_links jsonb:='[]'::jsonb; v_digits text; v_mask text:=null;
  v_facebook boolean:=true; v_instagram boolean:=true;
BEGIN
  SELECT id,client_id,title,tracking_enabled,link_facebook,link_instagram,link_avulso,
    instructions,post_url,platform,archived_at INTO v_mission FROM portal_missions WHERE id=p_mission_id;
  IF v_mission.id IS NULL THEN RETURN jsonb_build_object('error','not_found'); END IF;
  SELECT name INTO v_client_name FROM clients WHERE id=v_mission.client_id;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id,'label',l.label,'url',l.url,'kind',l.kind)
    ORDER BY l.display_order,l.created_at),'[]'::jsonb) INTO v_links
  FROM portal_mission_links l WHERE l.mission_id=p_mission_id;

  IF p_code IS NOT NULL AND length(p_code)>0 AND p_code<>'invalid' THEN
    SELECT id,group_name_snapshot INTO v_dist FROM mission_distributions
    WHERE short_code=p_code AND mission_id=p_mission_id;
    IF v_dist.id IS NOT NULL THEN v_distribution_valid:=true;v_group_name:=v_dist.group_name_snapshot;END IF;
  END IF;

  IF p_token IS NOT NULL AND length(p_token)>0 THEN
    SELECT participant_id,client_id,revoked_at INTO v_tok FROM mission_visitor_tokens WHERE token=p_token;
    IF v_tok.participant_id IS NOT NULL AND v_tok.revoked_at IS NULL AND v_tok.client_id=v_mission.client_id THEN
      SELECT mp.id,mp.nome,mp.cargo_snapshot,mp.regiao_snapshot,mp.match_source,mp.phone_e164,mp.pessoa_id,
        coalesce(ep.missao_facebook_ativo,true) facebook_ativo,
        coalesce(ep.missao_instagram_ativo,true) instagram_ativo
      INTO v_participant FROM mission_participants mp
      LEFT JOIN eleicao_pessoas ep ON ep.id=mp.pessoa_id AND ep.client_id=mp.client_id
      WHERE mp.id=v_tok.participant_id;
      IF v_participant.id IS NOT NULL THEN
        v_facebook:=v_participant.facebook_ativo;v_instagram:=v_participant.instagram_ativo;
        SELECT concluido_em INTO v_done FROM mission_checkins
          WHERE mission_id=p_mission_id AND participant_id=v_participant.id;
        v_digits:=regexp_replace(coalesce(v_participant.phone_e164,''),'\D','','g');
        IF length(v_digits)>=6 THEN v_mask:=left(v_digits,4)||repeat('•',greatest(length(v_digits)-6,0))||right(v_digits,2);END IF;
        v_participant_json:=jsonb_build_object('id',v_participant.id,'nome',v_participant.nome,
          'cargo',v_participant.cargo_snapshot,'regiao',v_participant.regiao_snapshot,
          'reconhecido',v_participant.match_source IS NOT NULL,'telefone_mascarado',v_mask,
          'concluido_em',v_done,'facebook_ativo',v_facebook,'instagram_ativo',v_instagram);
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('mission',jsonb_build_object(
    'id',v_mission.id,'title',v_mission.title,'tracking_enabled',v_mission.tracking_enabled,
    'link_facebook',CASE WHEN v_facebook THEN v_mission.link_facebook ELSE NULL END,
    'link_instagram',CASE WHEN v_instagram THEN v_mission.link_instagram ELSE NULL END,
    'link_avulso',v_mission.link_avulso,'instructions',v_mission.instructions,
    'legacy_post_url',CASE
      WHEN v_mission.platform='facebook' AND NOT v_facebook THEN NULL
      WHEN v_mission.platform='instagram' AND NOT v_instagram THEN NULL ELSE v_mission.post_url END,
    'legacy_platform',v_mission.platform,'archived_at',v_mission.archived_at),
    'links',v_links,'client_id',v_mission.client_id,'client_name',v_client_name,
    'distribution_valid',v_distribution_valid,'group_name',v_group_name,'participant',v_participant_json);
END;$function$;

CREATE OR REPLACE FUNCTION public.public_mission_can_confirm(p_mission_id uuid,p_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $function$
DECLARE
  v_m record;v_participant uuid;v_facebook boolean:=true;v_instagram boolean:=true;
  v_required integer:=0;v_clicked integer:=0;
BEGIN
  SELECT id,client_id,link_facebook,link_instagram,link_avulso,post_url,platform INTO v_m
  FROM portal_missions WHERE id=p_mission_id AND archived_at IS NULL;
  IF v_m.id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','Missao nao encontrada');END IF;
  SELECT t.participant_id,coalesce(ep.missao_facebook_ativo,true),coalesce(ep.missao_instagram_ativo,true)
    INTO v_participant,v_facebook,v_instagram
  FROM mission_visitor_tokens t JOIN mission_participants mp ON mp.id=t.participant_id
  LEFT JOIN eleicao_pessoas ep ON ep.id=mp.pessoa_id AND ep.client_id=mp.client_id
  WHERE t.token=p_token AND t.revoked_at IS NULL AND t.client_id=v_m.client_id;
  IF v_participant IS NULL THEN RETURN jsonb_build_object('ok',false,'error','Identificacao invalida');END IF;

  v_required:=
    CASE WHEN v_facebook AND (v_m.link_facebook IS NOT NULL OR (v_m.platform='facebook' AND v_m.post_url IS NOT NULL)) THEN 1 ELSE 0 END+
    CASE WHEN v_instagram AND (v_m.link_instagram IS NOT NULL OR (v_m.platform='instagram' AND v_m.post_url IS NOT NULL)) THEN 1 ELSE 0 END+
    CASE WHEN v_m.link_avulso IS NOT NULL THEN 1 ELSE 0 END+
    (SELECT count(*) FROM portal_mission_links l WHERE l.mission_id=p_mission_id);
  SELECT
    CASE WHEN v_facebook AND (v_m.link_facebook IS NOT NULL OR (v_m.platform='facebook' AND v_m.post_url IS NOT NULL)) AND EXISTS(
      SELECT 1 FROM mission_events e WHERE e.mission_id=p_mission_id AND e.participant_id=v_participant AND e.event_type::text='click_facebook' AND NOT coalesce(e.is_bot,false)) THEN 1 ELSE 0 END+
    CASE WHEN v_instagram AND (v_m.link_instagram IS NOT NULL OR (v_m.platform='instagram' AND v_m.post_url IS NOT NULL)) AND EXISTS(
      SELECT 1 FROM mission_events e WHERE e.mission_id=p_mission_id AND e.participant_id=v_participant AND e.event_type::text='click_instagram' AND NOT coalesce(e.is_bot,false)) THEN 1 ELSE 0 END+
    CASE WHEN v_m.link_avulso IS NOT NULL AND EXISTS(
      SELECT 1 FROM mission_events e WHERE e.mission_id=p_mission_id AND e.participant_id=v_participant AND e.event_type::text='click_avulso' AND NOT coalesce(e.is_bot,false)) THEN 1 ELSE 0 END+
    (SELECT count(*) FROM portal_mission_links l WHERE l.mission_id=p_mission_id AND EXISTS(
      SELECT 1 FROM mission_events e WHERE e.mission_id=p_mission_id AND e.participant_id=v_participant AND e.event_type::text='click_link' AND e.mission_link_id=l.id AND NOT coalesce(e.is_bot,false)))
    INTO v_clicked;
  RETURN jsonb_build_object('ok',v_clicked>=v_required,'required',v_required,'clicked',v_clicked,
    'remaining',greatest(v_required-v_clicked,0));
END;$function$;

REVOKE ALL ON FUNCTION public.engagement_set_person_social_requirements(uuid,uuid,boolean,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.engagement_set_manual_completion(uuid,uuid,uuid,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.engagement_set_person_social_requirements(uuid,uuid,boolean,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.engagement_set_manual_completion(uuid,uuid,uuid,boolean,text) TO authenticated;
REVOKE ALL ON FUNCTION public.public_mission_config(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_mission_config(uuid,text,text) TO anon,authenticated;
REVOKE ALL ON FUNCTION public.public_mission_can_confirm(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_mission_can_confirm(uuid,text) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
