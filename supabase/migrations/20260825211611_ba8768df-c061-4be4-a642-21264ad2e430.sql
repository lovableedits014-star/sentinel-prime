-- 1. Config pública passa a devolver os links extras
CREATE OR REPLACE FUNCTION public.public_mission_config(p_mission_id uuid, p_code text, p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mission record; v_client_name text; v_dist record; v_tok record;
  v_participant record; v_distribution_valid boolean := false;
  v_group_name text := null; v_participant_json jsonb := null; v_done timestamptz;
  v_links jsonb := '[]'::jsonb;
BEGIN
  SELECT id, client_id, title, tracking_enabled, link_facebook, link_instagram,
         link_avulso, instructions, post_url, platform, archived_at
    INTO v_mission FROM portal_missions WHERE id = p_mission_id;
  IF v_mission.id IS NULL THEN RETURN jsonb_build_object('error','not_found'); END IF;

  SELECT name INTO v_client_name FROM clients WHERE id = v_mission.client_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'label', l.label, 'url', l.url, 'kind', l.kind)
                            ORDER BY l.display_order, l.created_at), '[]'::jsonb)
    INTO v_links FROM portal_mission_links l WHERE l.mission_id = p_mission_id;

  IF p_code IS NOT NULL AND length(p_code) > 0 AND p_code <> 'invalid' THEN
    SELECT id, group_name_snapshot INTO v_dist FROM mission_distributions
     WHERE short_code = p_code AND mission_id = p_mission_id;
    IF v_dist.id IS NOT NULL THEN
      v_distribution_valid := true;
      v_group_name := v_dist.group_name_snapshot;
    END IF;
  END IF;

  IF p_token IS NOT NULL AND length(p_token) > 0 THEN
    SELECT participant_id, client_id, revoked_at INTO v_tok
      FROM mission_visitor_tokens WHERE token = p_token;
    IF v_tok.participant_id IS NOT NULL AND v_tok.revoked_at IS NULL
       AND v_tok.client_id = v_mission.client_id THEN
      SELECT id, nome, cargo_snapshot, regiao_snapshot, match_source
        INTO v_participant FROM mission_participants WHERE id = v_tok.participant_id;
      IF v_participant.id IS NOT NULL THEN
        SELECT concluido_em INTO v_done FROM mission_checkins
         WHERE mission_id = p_mission_id AND participant_id = v_participant.id;
        v_participant_json := jsonb_build_object(
          'id', v_participant.id, 'nome', v_participant.nome,
          'cargo', v_participant.cargo_snapshot, 'regiao', v_participant.regiao_snapshot,
          'reconhecido', v_participant.match_source IS NOT NULL,
          'concluido_em', v_done);
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'mission', jsonb_build_object(
      'id', v_mission.id, 'title', v_mission.title,
      'tracking_enabled', v_mission.tracking_enabled,
      'link_facebook', v_mission.link_facebook,
      'link_instagram', v_mission.link_instagram,
      'link_avulso', v_mission.link_avulso,
      'instructions', v_mission.instructions,
      'legacy_post_url', v_mission.post_url,
      'legacy_platform', v_mission.platform,
      'archived_at', v_mission.archived_at),
    'links', v_links,
    'client_id', v_mission.client_id,
    'client_name', v_client_name,
    'distribution_valid', v_distribution_valid,
    'group_name', v_group_name,
    'participant', v_participant_json);
END $function$;

-- 2. Evento aceita link específico
CREATE OR REPLACE FUNCTION public.public_mission_event(
  p_mission_id uuid, p_code text, p_token text, p_type text,
  p_user_agent text, p_device text, p_is_bot boolean, p_link_id uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mission record; v_dist_id uuid; v_participant_id uuid; v_tok record; v_link_id uuid;
BEGIN
  IF p_mission_id IS NULL OR p_type IS NULL
     OR p_type NOT IN ('open','click_facebook','click_instagram','click_avulso','click_link','declared_done') THEN
    RETURN jsonb_build_object('error', 'Dados inválidos');
  END IF;

  SELECT id, client_id INTO v_mission FROM portal_missions WHERE id = p_mission_id;
  IF v_mission.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Missão não encontrada');
  END IF;

  IF p_link_id IS NOT NULL THEN
    SELECT id INTO v_link_id FROM portal_mission_links WHERE id = p_link_id AND mission_id = p_mission_id;
  END IF;

  IF p_code IS NOT NULL AND length(p_code) > 0 AND p_code <> 'invalid' THEN
    SELECT id INTO v_dist_id FROM mission_distributions
     WHERE short_code = p_code AND mission_id = p_mission_id;
  END IF;

  IF p_token IS NOT NULL AND length(p_token) > 0 THEN
    SELECT participant_id, client_id, revoked_at, last_distribution_id INTO v_tok
      FROM mission_visitor_tokens WHERE token = p_token;
    IF v_tok.participant_id IS NOT NULL AND v_tok.revoked_at IS NULL
       AND v_tok.client_id = v_mission.client_id THEN
      v_participant_id := v_tok.participant_id;
      IF v_dist_id IS NULL AND v_tok.last_distribution_id IS NOT NULL THEN
        v_dist_id := v_tok.last_distribution_id;
      END IF;
      UPDATE mission_visitor_tokens
         SET last_used_at = now(),
             last_distribution_id = coalesce(v_dist_id, last_distribution_id)
       WHERE token = p_token;
      UPDATE mission_participants SET last_seen_at = now() WHERE id = v_participant_id;
    END IF;
  END IF;

  INSERT INTO mission_events (mission_id, distribution_id, participant_id, client_id, event_type,
                              user_agent, device_category, is_bot, mission_link_id)
  VALUES (p_mission_id, v_dist_id, v_participant_id, v_mission.client_id, p_type::mission_event_type,
          p_user_agent, p_device, coalesce(p_is_bot, false), v_link_id);

  RETURN jsonb_build_object('ok', true);
END $function$;

-- 3. Trigger conta click_link como clique
CREATE OR REPLACE FUNCTION public.mission_events_sync_checkin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE p record; is_click boolean; is_done boolean;
BEGIN
  IF NEW.is_bot OR NEW.participant_id IS NULL OR NEW.mission_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT pessoa_id, funcionario_id, contratado_id, client_id
    INTO p FROM mission_participants WHERE id = NEW.participant_id;

  is_click := NEW.event_type::text IN ('click_facebook','click_instagram','click_avulso','click_link');
  is_done  := NEW.event_type::text = 'declared_done';

  INSERT INTO mission_checkins (
    client_id, mission_id, participant_id, pessoa_id, funcionario_id, contratado_id,
    distribution_id, primeiro_acesso_em, ultimo_acesso_em, primeiro_clique_em, concluido_em, opens, clicks
  ) VALUES (
    coalesce(NEW.client_id, p.client_id), NEW.mission_id, NEW.participant_id,
    p.pessoa_id, p.funcionario_id, p.contratado_id, NEW.distribution_id,
    NEW.created_at, NEW.created_at,
    CASE WHEN is_click THEN NEW.created_at END,
    CASE WHEN is_done THEN NEW.created_at END,
    CASE WHEN NEW.event_type::text = 'open' THEN 1 ELSE 0 END,
    CASE WHEN is_click THEN 1 ELSE 0 END
  )
  ON CONFLICT (mission_id, participant_id) DO UPDATE SET
    ultimo_acesso_em = GREATEST(mission_checkins.ultimo_acesso_em, NEW.created_at),
    primeiro_clique_em = coalesce(mission_checkins.primeiro_clique_em, CASE WHEN is_click THEN NEW.created_at END),
    concluido_em = coalesce(mission_checkins.concluido_em, CASE WHEN is_done THEN NEW.created_at END),
    opens = mission_checkins.opens + CASE WHEN NEW.event_type::text = 'open' THEN 1 ELSE 0 END,
    clicks = mission_checkins.clicks + CASE WHEN is_click THEN 1 ELSE 0 END,
    distribution_id = coalesce(mission_checkins.distribution_id, NEW.distribution_id),
    pessoa_id = coalesce(mission_checkins.pessoa_id, p.pessoa_id),
    funcionario_id = coalesce(mission_checkins.funcionario_id, p.funcionario_id),
    contratado_id = coalesce(mission_checkins.contratado_id, p.contratado_id);

  RETURN NEW;
END $function$;

-- 4. Dashboard estendido
DROP FUNCTION IF EXISTS public.mission_checkin_dashboard(uuid, uuid, boolean, boolean, text);
CREATE OR REPLACE FUNCTION public.mission_checkin_dashboard(
  p_client_id uuid, p_mission_id uuid,
  p_incluir_sem_valor boolean DEFAULT false,
  p_incluir_funcionarios boolean DEFAULT false,
  p_regiao text DEFAULT NULL)
 RETURNS TABLE(pessoa_id uuid, origem text, nome text, telefone text, cargo text, regiao text,
               cidade text, is_voluntario boolean, tem_contrato boolean, indicador_nome text,
               status text, primeiro_acesso_em timestamptz, concluido_em timestamptz, clicks integer,
               tem_cadastro boolean, links_clicados text[], missoes_recentes integer, missoes_cumpridas integer)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;

  RETURN QUERY
  WITH base AS (
    SELECT p.id, 'eleicao'::text AS origem, p.nome, p.telefone,
           CASE WHEN p.is_voluntario THEN 'voluntario' ELSE p.tipo::text END AS cargo,
           coalesce(p.regiao, p.cidade) AS regiao, p.cidade,
           coalesce(p.is_voluntario,false) AS is_voluntario,
           (p.valor_contratacao IS NOT NULL) AS tem_contrato,
           (SELECT pai.nome FROM eleicao_pessoas pai WHERE pai.id = p.parent_id) AS indicador_nome
      FROM eleicao_pessoas p
     WHERE p.client_id = p_client_id
       AND (p_incluir_sem_valor OR p.valor_contratacao IS NOT NULL OR coalesce(p.is_voluntario,false))
    UNION ALL
    SELECT f.id, 'funcionario', f.nome, f.telefone, 'funcionario', f.cidade, f.cidade,
           false, true, NULL
      FROM funcionarios f
     WHERE p_incluir_funcionarios AND f.client_id = p_client_id
  ), ck AS (
    SELECT c.pessoa_id, c.funcionario_id, c.participant_id,
           c.primeiro_acesso_em, c.concluido_em, c.clicks
      FROM mission_checkins c
     WHERE c.client_id = p_client_id AND c.mission_id = p_mission_id
  ), hist AS (
    SELECT h.pessoa_id,
           count(*)::int AS total,
           count(*) FILTER (WHERE h.concluido_em IS NOT NULL)::int AS cumpridas
      FROM mission_checkins h
     WHERE h.client_id = p_client_id AND h.pessoa_id IS NOT NULL
     GROUP BY h.pessoa_id
  )
  SELECT b.id, b.origem, b.nome, b.telefone, b.cargo, b.regiao, b.cidade,
         b.is_voluntario, b.tem_contrato, b.indicador_nome,
         CASE
           WHEN k.concluido_em IS NOT NULL THEN 'cumpriu'
           WHEN k.primeiro_acesso_em IS NOT NULL THEN 'abriu'
           ELSE 'nao_abriu'
         END AS status,
         k.primeiro_acesso_em, k.concluido_em, coalesce(k.clicks, 0),
         true AS tem_cadastro,
         coalesce((
           SELECT array_agg(DISTINCT l.label)
             FROM mission_events e
             JOIN portal_mission_links l ON l.id = e.mission_link_id
            WHERE e.mission_id = p_mission_id AND e.participant_id = k.participant_id
         ), ARRAY[]::text[]) AS links_clicados,
         coalesce(hh.total, 0), coalesce(hh.cumpridas, 0)
    FROM base b
    LEFT JOIN ck k
      ON (b.origem = 'eleicao' AND k.pessoa_id = b.id)
      OR (b.origem = 'funcionario' AND k.funcionario_id = b.id)
    LEFT JOIN hist hh ON b.origem = 'eleicao' AND hh.pessoa_id = b.id
   WHERE p_regiao IS NULL OR b.regiao = p_regiao
   ORDER BY b.nome;
END $function$;

-- 5. Série horária de acessos
CREATE OR REPLACE FUNCTION public.mission_checkin_series(p_client_id uuid, p_mission_id uuid)
 RETURNS TABLE(hora timestamptz, acessos integer, conclusoes integer)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  RETURN QUERY
  SELECT date_trunc('hour', e.created_at) AS hora,
         count(*) FILTER (WHERE e.event_type::text = 'open')::int,
         count(*) FILTER (WHERE e.event_type::text = 'declared_done')::int
    FROM mission_events e
   WHERE e.client_id = p_client_id AND e.mission_id = p_mission_id AND NOT e.is_bot
   GROUP BY 1 ORDER BY 1;
END $function$;

-- 6. Evolução de adesão entre missões
CREATE OR REPLACE FUNCTION public.mission_checkin_evolucao(p_client_id uuid, p_limit integer DEFAULT 10)
 RETURNS TABLE(mission_id uuid, title text, quando timestamptz, participantes integer, cumpriram integer, adesao integer)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  RETURN QUERY
  WITH m AS (
    SELECT pm.id, pm.title, coalesce(pm.publicado_em, pm.created_at) AS quando
      FROM portal_missions pm
     WHERE pm.client_id = p_client_id AND pm.archived_at IS NULL
     ORDER BY coalesce(pm.publicado_em, pm.created_at) DESC
     LIMIT greatest(1, coalesce(p_limit, 10))
  )
  SELECT m.id, m.title, m.quando,
         coalesce(c.tot, 0), coalesce(c.done, 0),
         CASE WHEN coalesce(c.tot,0) > 0 THEN round(100.0 * c.done / c.tot)::int ELSE 0 END
    FROM m
    LEFT JOIN (
      SELECT mission_id, count(*)::int AS tot,
             count(*) FILTER (WHERE concluido_em IS NOT NULL)::int AS done
        FROM mission_checkins WHERE client_id = p_client_id GROUP BY mission_id
    ) c ON c.mission_id = m.id
   ORDER BY m.quando;
END $function$;

-- 7. Participantes que entraram mas não casaram com a base
CREATE OR REPLACE FUNCTION public.mission_participantes_nao_identificados(p_client_id uuid, p_mission_id uuid DEFAULT NULL)
 RETURNS TABLE(participant_id uuid, nome text, telefone text, primeiro_acesso_em timestamptz, ultimo_acesso_em timestamptz, missoes integer)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  RETURN QUERY
  SELECT mp.id, mp.nome, mp.phone_e164, mp.first_seen_at, mp.last_seen_at,
         (SELECT count(DISTINCT c.mission_id)::int FROM mission_checkins c WHERE c.participant_id = mp.id)
    FROM mission_participants mp
   WHERE mp.client_id = p_client_id
     AND mp.pessoa_id IS NULL AND mp.funcionario_id IS NULL AND mp.contratado_id IS NULL
     AND (p_mission_id IS NULL OR EXISTS (
       SELECT 1 FROM mission_checkins c WHERE c.participant_id = mp.id AND c.mission_id = p_mission_id))
   ORDER BY mp.last_seen_at DESC NULLS LAST;
END $function$;

-- 8. Reincidentes (não cumpriram as últimas N missões)
CREATE OR REPLACE FUNCTION public.mission_checkin_reincidentes(p_client_id uuid, p_janela integer DEFAULT 3)
 RETURNS TABLE(pessoa_id uuid, nome text, telefone text, cargo text, regiao text,
               is_voluntario boolean, tem_contrato boolean, faltas integer, janela integer)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_janela int := greatest(1, coalesce(p_janela, 3));
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  RETURN QUERY
  WITH ms AS (
    SELECT pm.id FROM portal_missions pm
     WHERE pm.client_id = p_client_id AND pm.archived_at IS NULL
     ORDER BY coalesce(pm.publicado_em, pm.created_at) DESC LIMIT v_janela
  ), obrig AS (
    SELECT p.id, p.nome, p.telefone,
           CASE WHEN p.is_voluntario THEN 'voluntario' ELSE p.tipo::text END AS cargo,
           coalesce(p.regiao, p.cidade) AS regiao,
           coalesce(p.is_voluntario,false) AS is_voluntario,
           (p.valor_contratacao IS NOT NULL) AS tem_contrato
      FROM eleicao_pessoas p
     WHERE p.client_id = p_client_id
       AND (p.valor_contratacao IS NOT NULL OR coalesce(p.is_voluntario,false))
  )
  SELECT o.id, o.nome, o.telefone, o.cargo, o.regiao, o.is_voluntario, o.tem_contrato,
         (SELECT count(*)::int FROM ms
           WHERE NOT EXISTS (
             SELECT 1 FROM mission_checkins c
              WHERE c.mission_id = ms.id AND c.pessoa_id = o.id AND c.concluido_em IS NOT NULL)),
         v_janela
    FROM obrig o
   ORDER BY 8 DESC, o.nome;
END $function$;
