-- 1. supporter_id em engagement_publico (para pessoas manuais)
ALTER TABLE public.engagement_publico
  ADD COLUMN IF NOT EXISTS supporter_id uuid REFERENCES public.supporters(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_engagement_publico_manual
  ON public.engagement_publico (client_id, origem) WHERE origem = 'manual';

-- 2. ensure supporter: suportar origem 'manual'
CREATE OR REPLACE FUNCTION public.engagement_ensure_entity_supporter(p_origem text, p_ref uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_client uuid; v_nome text; v_tel text; v_sid uuid;
BEGIN
  IF p_origem = 'pessoas' THEN
    SELECT client_id, nome, telefone, supporter_id INTO v_client, v_nome, v_tel, v_sid FROM pessoas WHERE id = p_ref;
  ELSIF p_origem = 'funcionarios' THEN
    SELECT client_id, nome, telefone, supporter_id INTO v_client, v_nome, v_tel, v_sid FROM funcionarios WHERE id = p_ref;
  ELSIF p_origem = 'eleicao_pessoas' THEN
    SELECT client_id, nome, telefone, supporter_id INTO v_client, v_nome, v_tel, v_sid FROM eleicao_pessoas WHERE id = p_ref;
  ELSIF p_origem = 'contratados' THEN
    SELECT client_id, nome, telefone, supporter_id INTO v_client, v_nome, v_tel, v_sid FROM contratados WHERE id = p_ref;
  ELSIF p_origem = 'supporter_accounts' THEN
    SELECT client_id, name, phone, supporter_id INTO v_client, v_nome, v_tel, v_sid FROM supporter_accounts WHERE id = p_ref;
  ELSIF p_origem = 'manual' THEN
    SELECT client_id, nome, telefone, supporter_id INTO v_client, v_nome, v_tel, v_sid
      FROM engagement_publico WHERE origem = 'manual' AND ref_id = p_ref LIMIT 1;
  ELSE
    RAISE EXCEPTION 'Origem inválida: %', p_origem;
  END IF;

  IF v_client IS NULL THEN RAISE EXCEPTION 'Cadastro não encontrado'; END IF;
  IF NOT public.is_client_member(v_client) THEN RAISE EXCEPTION 'Sem permissão'; END IF;

  IF v_sid IS NOT NULL AND EXISTS (SELECT 1 FROM supporters WHERE id = v_sid) THEN
    RETURN v_sid;
  END IF;
  v_sid := NULL;

  IF public.normalize_br_phone(v_tel) IS NOT NULL THEN
    SELECT s.id INTO v_sid FROM supporters s
     WHERE s.client_id = v_client
       AND public.normalize_br_phone(s.telefone) = public.normalize_br_phone(v_tel)
     LIMIT 1;
  END IF;

  IF v_sid IS NULL AND COALESCE(TRIM(v_nome), '') <> '' THEN
    SELECT s.id INTO v_sid FROM supporters s
     WHERE s.client_id = v_client
       AND public.normalize_person_name(s.name) = public.normalize_person_name(v_nome)
     LIMIT 1;
  END IF;

  IF v_sid IS NULL THEN
    INSERT INTO supporters (client_id, name, classification, first_contact_date, engagement_score, telefone)
    VALUES (v_client, COALESCE(NULLIF(TRIM(v_nome), ''), 'Sem nome'), 'neutro', now(), 0, v_tel)
    RETURNING id INTO v_sid;
  END IF;

  IF p_origem = 'manual' THEN
    UPDATE engagement_publico SET supporter_id = v_sid, updated_at = now()
     WHERE origem = 'manual' AND ref_id = p_ref;
  ELSE
    EXECUTE format('UPDATE public.%I SET supporter_id = $1 WHERE id = $2', p_origem) USING v_sid, p_ref;
  END IF;
  RETURN v_sid;
END $function$;

-- 3. remover social: aceitar manual
CREATE OR REPLACE FUNCTION public.engagement_entity_remove_social(p_origem text, p_ref uuid, p_plataforma text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_client uuid; v_sid uuid;
BEGIN
  IF p_origem NOT IN ('pessoas','funcionarios','eleicao_pessoas','contratados','supporter_accounts','manual') THEN
    RAISE EXCEPTION 'Origem inválida: %', p_origem;
  END IF;
  IF p_origem = 'manual' THEN
    SELECT client_id, supporter_id INTO v_client, v_sid
      FROM engagement_publico WHERE origem = 'manual' AND ref_id = p_ref LIMIT 1;
  ELSE
    EXECUTE format('SELECT client_id, supporter_id FROM public.%I WHERE id = $1', p_origem)
      INTO v_client, v_sid USING p_ref;
  END IF;
  IF v_client IS NULL THEN RAISE EXCEPTION 'Cadastro não encontrado'; END IF;
  IF NOT public.is_client_member(v_client) THEN RAISE EXCEPTION 'Sem permissão'; END IF;

  IF p_origem = 'pessoas' THEN
    DELETE FROM pessoa_social WHERE pessoa_id = p_ref AND plataforma = p_plataforma;
  END IF;
  IF v_sid IS NOT NULL THEN
    DELETE FROM supporter_profiles WHERE supporter_id = v_sid AND platform = p_plataforma;
  END IF;
  RETURN true;
END $function$;

-- 4. criar pessoa manual
CREATE OR REPLACE FUNCTION public.engagement_publico_criar_manual(
  p_client_id uuid,
  p_nome text,
  p_telefone text DEFAULT NULL,
  p_cargo text DEFAULT NULL,
  p_regiao text DEFAULT NULL,
  p_cidade text DEFAULT NULL,
  p_grupo_id uuid DEFAULT NULL,
  p_instagram text DEFAULT NULL,
  p_facebook text DEFAULT NULL,
  p_observacao text DEFAULT NULL
) RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_ref uuid := gen_random_uuid(); v_tel text; v_sid uuid; v_relinked int := 0; v_res jsonb;
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF COALESCE(TRIM(p_nome),'') = '' THEN RAISE EXCEPTION 'Informe o nome'; END IF;
  v_tel := NULLIF(regexp_replace(COALESCE(p_telefone,''), '\D', '', 'g'), '');

  INSERT INTO engagement_publico (client_id, grupo_id, origem, ref_id, nome, cargo, telefone,
    regiao, cidade, incluido, dispensado, observacao)
  VALUES (p_client_id, p_grupo_id, 'manual', v_ref, TRIM(p_nome), COALESCE(NULLIF(TRIM(COALESCE(p_cargo,'')),''),'manual'),
    v_tel, NULLIF(TRIM(COALESCE(p_regiao,'')),''), NULLIF(TRIM(COALESCE(p_cidade,'')),''), true, false, p_observacao);

  v_sid := public.engagement_ensure_entity_supporter('manual', v_ref);

  IF COALESCE(TRIM(COALESCE(p_instagram,'')),'') <> '' THEN
    v_res := public.engagement_entity_upsert_social('manual', v_ref, 'instagram', p_instagram, NULL);
    v_relinked := v_relinked + COALESCE((v_res->>'relinked')::int, 0);
  END IF;
  IF COALESCE(TRIM(COALESCE(p_facebook,'')),'') <> '' THEN
    v_res := public.engagement_entity_upsert_social('manual', v_ref, 'facebook', p_facebook, NULL);
    v_relinked := v_relinked + COALESCE((v_res->>'relinked')::int, 0);
  END IF;

  RETURN jsonb_build_object('ref_id', v_ref, 'origem', 'manual', 'supporter_id', v_sid, 'relinked', v_relinked);
END $function$;

CREATE OR REPLACE FUNCTION public.engagement_publico_excluir_manual(p_client_id uuid, p_ref_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  DELETE FROM engagement_publico
   WHERE client_id = p_client_id AND origem = 'manual' AND ref_id = p_ref_id;
END $function$;

-- 5. telefone: aceitar manual
CREATE OR REPLACE FUNCTION public.engagement_publico_set_telefone(p_client_id uuid, p_origem text, p_ref_id uuid, p_telefone text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_tel text;
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  v_tel := NULLIF(regexp_replace(COALESCE(p_telefone,''), '\D', '', 'g'), '');
  IF v_tel IS NULL THEN RAISE EXCEPTION 'Telefone inválido'; END IF;

  IF p_origem = 'eleicao_pessoas' THEN
    UPDATE eleicao_pessoas SET telefone = v_tel WHERE id = p_ref_id AND client_id = p_client_id;
  ELSIF p_origem = 'contratados' THEN
    UPDATE contratados SET telefone = v_tel WHERE id = p_ref_id AND client_id = p_client_id;
  ELSIF p_origem = 'funcionarios' THEN
    UPDATE funcionarios SET telefone = v_tel WHERE id = p_ref_id AND client_id = p_client_id;
  ELSIF p_origem = 'pessoas' THEN
    UPDATE pessoas SET telefone = v_tel WHERE id = p_ref_id AND client_id = p_client_id;
  ELSIF p_origem = 'supporter_accounts' THEN
    UPDATE supporter_accounts SET phone = v_tel WHERE id = p_ref_id AND client_id = p_client_id;
  ELSIF p_origem = 'manual' THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Origem não suportada: %', p_origem;
  END IF;

  UPDATE engagement_publico SET telefone = v_tel, updated_at = now()
   WHERE client_id = p_client_id AND origem = p_origem AND ref_id = p_ref_id;
END $function$;

-- 6. definir público: aceitar manual (marcar/dispensar/remover)
CREATE OR REPLACE FUNCTION public.engagement_publico_definir(p_client_id uuid, p_origem text, p_ref_id uuid, p_incluido boolean, p_grupo_id uuid DEFAULT NULL::uuid, p_dispensado boolean DEFAULT false, p_observacao text DEFAULT NULL::text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v record;
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;

  IF p_origem = 'manual' THEN
    UPDATE engagement_publico
       SET incluido = p_incluido, dispensado = p_dispensado,
           observacao = COALESCE(p_observacao, observacao), updated_at = now()
     WHERE client_id = p_client_id AND origem = 'manual' AND ref_id = p_ref_id;
    RETURN;
  END IF;

  SELECT t.nome, t.cargo, t.telefone, t.regiao, t.cidade INTO v
    FROM public.engagement_time_overview(p_client_id, 1) t
   WHERE t.origem = p_origem AND t.ref_id = p_ref_id;
  IF v IS NULL THEN RAISE EXCEPTION 'Pessoa não encontrada neste cliente'; END IF;

  IF NOT p_incluido AND NOT p_dispensado THEN
    DELETE FROM engagement_publico
     WHERE client_id = p_client_id AND origem = p_origem AND ref_id = p_ref_id
       AND ((p_grupo_id IS NOT NULL AND grupo_id = p_grupo_id) OR (p_grupo_id IS NULL AND grupo_id IS NULL));
    RETURN;
  END IF;

  UPDATE engagement_publico SET incluido = p_incluido, dispensado = p_dispensado,
         observacao = COALESCE(p_observacao, observacao), nome = v.nome, cargo = v.cargo,
         telefone = v.telefone, regiao = v.regiao, cidade = v.cidade, updated_at = now()
   WHERE client_id = p_client_id AND origem = p_origem AND ref_id = p_ref_id
     AND ((p_grupo_id IS NOT NULL AND grupo_id = p_grupo_id) OR (p_grupo_id IS NULL AND grupo_id IS NULL));
  IF NOT FOUND THEN
    INSERT INTO engagement_publico (client_id, grupo_id, origem, ref_id, nome, cargo, telefone, regiao, cidade,
      incluido, dispensado, observacao)
    VALUES (p_client_id, p_grupo_id, p_origem, p_ref_id, v.nome, v.cargo, v.telefone, v.regiao, v.cidade,
      p_incluido, p_dispensado, p_observacao);
  END IF;
END $function$;

-- 7. alvo: incluir pessoas manuais
CREATE OR REPLACE FUNCTION public.engagement_publico_alvo(p_client_id uuid, p_cargos text[] DEFAULT '{}'::text[], p_regioes text[] DEFAULT '{}'::text[], p_cidades text[] DEFAULT '{}'::text[], p_modo text DEFAULT 'automatico'::text, p_grupo_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(ref_id uuid, origem text, cargo text, nome text, telefone text, regiao text, cidade text, phone_norm text, instagram_handle text, facebook_key text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;

  RETURN QUERY
  WITH todos AS (
    SELECT t.ref_id, t.origem, t.cargo, t.nome, t.telefone, t.regiao, t.cidade,
           public.normalize_br_phone(t.telefone) AS phone_norm, t.instagram_handle, t.facebook_key
      FROM public.engagement_time_overview(p_client_id, 1) t
  ), auto AS (
    SELECT t.* FROM todos t
     WHERE COALESCE(p_modo,'automatico') = 'automatico'
       AND (COALESCE(array_length(p_cargos,1),0) = 0 OR t.cargo = ANY(p_cargos))
       AND (COALESCE(array_length(p_regioes,1),0) = 0 OR COALESCE(t.regiao,'') = ANY(p_regioes))
       AND (COALESCE(array_length(p_cidades,1),0) = 0 OR COALESCE(t.cidade,'') = ANY(p_cidades))
  ), manuais AS (
    SELECT t.* FROM todos t
      JOIN engagement_publico ep
        ON ep.client_id = p_client_id AND ep.origem = t.origem AND ep.ref_id = t.ref_id
       AND ep.incluido AND NOT ep.dispensado
       AND ((p_grupo_id IS NOT NULL AND ep.grupo_id = p_grupo_id)
         OR (p_grupo_id IS NULL AND ep.grupo_id IS NULL))
  ), soltas AS (
    SELECT ep.ref_id, 'manual'::text AS origem, COALESCE(ep.cargo,'manual') AS cargo, ep.nome, ep.telefone,
           ep.regiao, ep.cidade, public.normalize_br_phone(ep.telefone) AS phone_norm,
           (SELECT lower(sp.platform_user_id) FROM supporter_profiles sp
             WHERE sp.supporter_id = ep.supporter_id AND sp.platform = 'instagram' LIMIT 1) AS instagram_handle,
           (SELECT sp.platform_user_id FROM supporter_profiles sp
             WHERE sp.supporter_id = ep.supporter_id AND sp.platform = 'facebook' LIMIT 1) AS facebook_key
      FROM engagement_publico ep
     WHERE ep.client_id = p_client_id AND ep.origem = 'manual'
       AND ep.incluido AND NOT ep.dispensado
       AND ((p_grupo_id IS NOT NULL AND ep.grupo_id = p_grupo_id)
         OR (p_grupo_id IS NULL AND ep.grupo_id IS NULL))
  ), uniao AS (
    SELECT * FROM auto
    UNION
    SELECT * FROM manuais
    UNION
    SELECT * FROM soltas
  )
  SELECT u.* FROM uniao u
   WHERE NOT EXISTS (
     SELECT 1 FROM engagement_publico d
      WHERE d.client_id = p_client_id AND d.origem = u.origem AND d.ref_id = u.ref_id
        AND d.dispensado
        AND ((p_grupo_id IS NOT NULL AND d.grupo_id = p_grupo_id) OR (p_grupo_id IS NULL AND d.grupo_id IS NULL))
   );
END $function$;

-- 8. candidatos: incluir pessoas manuais na listagem
CREATE OR REPLACE FUNCTION public.engagement_publico_candidatos(p_client_id uuid, p_grupo_id uuid DEFAULT NULL::uuid, p_busca text DEFAULT NULL::text, p_limit integer DEFAULT 800)
 RETURNS TABLE(origem text, ref_id uuid, nome text, cargo text, telefone text, regiao text, cidade text, instagram_handle text, facebook_key text, no_publico boolean, dispensado boolean)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  RETURN QUERY
  WITH base AS (
    SELECT t.origem, t.ref_id, t.nome, t.cargo, t.telefone, t.regiao, t.cidade,
           t.instagram_handle, t.facebook_key,
           COALESCE(ep.incluido, false) AND NOT COALESCE(ep.dispensado,false) AS no_publico,
           COALESCE(ep.dispensado, false) AS dispensado
      FROM public.engagement_time_overview(p_client_id, 1) t
      LEFT JOIN engagement_publico ep
        ON ep.client_id = p_client_id AND ep.origem = t.origem AND ep.ref_id = t.ref_id
       AND ((p_grupo_id IS NOT NULL AND ep.grupo_id = p_grupo_id) OR (p_grupo_id IS NULL AND ep.grupo_id IS NULL))
    UNION ALL
    SELECT 'manual'::text, ep.ref_id, ep.nome, COALESCE(ep.cargo,'manual'), ep.telefone, ep.regiao, ep.cidade,
           (SELECT lower(sp.platform_user_id) FROM supporter_profiles sp
             WHERE sp.supporter_id = ep.supporter_id AND sp.platform = 'instagram' LIMIT 1),
           (SELECT sp.platform_user_id FROM supporter_profiles sp
             WHERE sp.supporter_id = ep.supporter_id AND sp.platform = 'facebook' LIMIT 1),
           COALESCE(ep.incluido,false) AND NOT COALESCE(ep.dispensado,false),
           COALESCE(ep.dispensado,false)
      FROM engagement_publico ep
     WHERE ep.client_id = p_client_id AND ep.origem = 'manual'
       AND ((p_grupo_id IS NOT NULL AND ep.grupo_id = p_grupo_id) OR (p_grupo_id IS NULL AND ep.grupo_id IS NULL))
  )
  SELECT b.* FROM base b
   WHERE p_busca IS NULL OR btrim(p_busca) = ''
      OR public.normalize_person_name(b.nome) LIKE '%' || public.normalize_person_name(p_busca) || '%'
      OR COALESCE(b.telefone,'') LIKE '%' || regexp_replace(COALESCE(p_busca,''), '\D', '', 'g') || '%'
   ORDER BY b.no_publico DESC, b.nome
   LIMIT GREATEST(COALESCE(p_limit,800),1);
END $function$;

-- 9. pendências: prontidão para cobrança
DROP FUNCTION IF EXISTS public.engagement_publico_pendencias(uuid, uuid, uuid);
CREATE OR REPLACE FUNCTION public.engagement_publico_pendencias(p_client_id uuid, p_grupo_id uuid DEFAULT NULL::uuid, p_regra_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(origem text, ref_id uuid, nome text, cargo text, telefone text, regiao text, cidade text,
   instagram_handle text, facebook_key text, sem_instagram boolean, sem_facebook boolean, sem_telefone boolean,
   sem_prova boolean, pronta_para_cobranca boolean, motivo_bloqueio text, ultimo_comentario timestamptz)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_regra record;
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF p_regra_id IS NOT NULL THEN
    SELECT * INTO v_regra FROM engagement_regras WHERE id = p_regra_id AND client_id = p_client_id;
  END IF;

  RETURN QUERY
  WITH alvo AS (
    SELECT * FROM public.engagement_publico_alvo(
      p_client_id,
      COALESCE(v_regra.cargos, '{}'::text[]),
      COALESCE(v_regra.regioes, '{}'::text[]),
      COALESCE(v_regra.cidades, '{}'::text[]),
      COALESCE(v_regra.modo_publico, CASE WHEN p_grupo_id IS NOT NULL THEN 'manual' ELSE 'automatico' END),
      COALESCE(v_regra.grupo_id, p_grupo_id))
  ), calc AS (
    SELECT a.*,
           (a.instagram_handle IS NULL OR a.instagram_handle = '') AS f_sem_ig,
           (a.facebook_key IS NULL OR a.facebook_key = '') AS f_sem_fb,
           (a.phone_norm IS NULL OR a.phone_norm = '') AS f_sem_tel
      FROM alvo a
  )
  SELECT c.origem, c.ref_id, c.nome, c.cargo, c.telefone, c.regiao, c.cidade,
         c.instagram_handle, c.facebook_key, c.f_sem_ig, c.f_sem_fb, c.f_sem_tel,
         (c.f_sem_ig AND c.f_sem_fb AND c.f_sem_tel) AS sem_prova,
         NOT (c.f_sem_ig AND c.f_sem_fb AND c.f_sem_tel) AS pronta_para_cobranca,
         CASE
           WHEN c.f_sem_ig AND c.f_sem_fb AND c.f_sem_tel THEN 'Sem @ , sem perfil e sem telefone: não há como comprovar'
           WHEN c.f_sem_ig AND c.f_sem_fb THEN 'Sem rede social: só dá para cobrar clique no link'
           WHEN c.f_sem_tel THEN 'Sem telefone: não dá para cobrar clique no link nem conclusão no portal'
           ELSE NULL
         END AS motivo_bloqueio,
         (SELECT max(cm.created_at) FROM comments cm
           WHERE cm.client_id = p_client_id AND cm.is_page_owner = false
             AND ((c.instagram_handle IS NOT NULL AND c.instagram_handle <> ''
                   AND cm.platform = 'instagram' AND lower(cm.platform_user_id) = c.instagram_handle)
               OR (c.facebook_key IS NOT NULL AND c.facebook_key <> ''
                   AND COALESCE(cm.platform,'facebook') = 'facebook'
                   AND lower(cm.platform_user_id) = lower(c.facebook_key))))
    FROM calc c
   ORDER BY c.nome;
END $function$;

-- 10. prévia do público antes de gerar obrigações
CREATE OR REPLACE FUNCTION public.engagement_publico_previa(p_client_id uuid, p_regra_id uuid DEFAULT NULL, p_grupo_id uuid DEFAULT NULL)
 RETURNS TABLE(total integer, prontas integer, sem_rede integer, sem_telefone integer, sem_dados integer)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  RETURN QUERY
  SELECT count(*)::int,
         count(*) FILTER (WHERE p.pronta_para_cobranca)::int,
         count(*) FILTER (WHERE p.sem_instagram AND p.sem_facebook)::int,
         count(*) FILTER (WHERE p.sem_telefone)::int,
         count(*) FILTER (WHERE NOT p.pronta_para_cobranca)::int
    FROM public.engagement_publico_pendencias(p_client_id, p_grupo_id, p_regra_id) p;
END $function$;

-- 11. gerar obrigações: só quem tem meio de comprovação
CREATE OR REPLACE FUNCTION public.engagement_gerar_obrigacoes(p_client_id uuid, p_mission_id uuid, p_regra_id uuid DEFAULT NULL::uuid)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_regra record; v_mission record; v_prazo timestamptz; v_count integer := 0; v_default_prazo integer;
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  SELECT * INTO v_mission FROM portal_missions WHERE id = p_mission_id AND client_id = p_client_id;
  IF v_mission IS NULL THEN RAISE EXCEPTION 'Publicação não encontrada'; END IF;

  SELECT * INTO v_regra FROM engagement_regras
   WHERE id = COALESCE(p_regra_id, v_mission.regra_id) AND client_id = p_client_id;
  IF v_regra IS NULL THEN RAISE EXCEPTION 'Defina uma regra de obrigação para esta publicação'; END IF;

  SELECT COALESCE(prazo_horas_default, 48) INTO v_default_prazo FROM engagement_config WHERE client_id = p_client_id;
  v_prazo := COALESCE(v_mission.publicado_em, v_mission.created_at)
             + (COALESCE(v_mission.prazo_horas, v_regra.prazo_horas, v_default_prazo, 48) || ' hours')::interval;

  INSERT INTO engagement_obrigacoes (
    client_id, mission_id, regra_id, origem, ref_id, nome, cargo, telefone, regiao, cidade,
    phone_norm, instagram_handle, facebook_key, tipo_obrigacao, esperado, prazo_em, pontos_possiveis
  )
  SELECT p_client_id, p_mission_id, v_regra.id, a.origem, a.ref_id, a.nome, a.cargo, a.telefone, a.regiao, a.cidade,
         a.phone_norm, a.instagram_handle, a.facebook_key, v_regra.tipo_obrigacao,
         GREATEST(COALESCE(v_regra.esperado,1),1), v_prazo,
         CASE v_regra.tipo_obrigacao WHEN 'comentar' THEN 2 WHEN 'evidencia' THEN 3 ELSE 1 END
    FROM public.engagement_publico_alvo(p_client_id, v_regra.cargos, v_regra.regioes, v_regra.cidades,
                                        v_regra.modo_publico, v_regra.grupo_id) a
   WHERE CASE v_regra.tipo_obrigacao
           WHEN 'comentar' THEN COALESCE(a.instagram_handle,'') <> '' OR COALESCE(a.facebook_key,'') <> ''
           WHEN 'evidencia' THEN COALESCE(a.phone_norm,'') <> ''
           ELSE COALESCE(a.instagram_handle,'') <> '' OR COALESCE(a.facebook_key,'') <> '' OR COALESCE(a.phone_norm,'') <> ''
         END
  ON CONFLICT (mission_id, origem, ref_id) DO UPDATE
    SET regra_id = EXCLUDED.regra_id, tipo_obrigacao = EXCLUDED.tipo_obrigacao,
        esperado = EXCLUDED.esperado, prazo_em = EXCLUDED.prazo_em,
        instagram_handle = EXCLUDED.instagram_handle, facebook_key = EXCLUDED.facebook_key,
        phone_norm = EXCLUDED.phone_norm, updated_at = now();

  -- remove obrigações de quem deixou de ter meio de comprovação
  UPDATE engagement_obrigacoes o
     SET status = 'dispensada', pontos = 0,
         justificativa = COALESCE(o.justificativa, 'Sem meio de comprovação cadastrado'), updated_at = now()
   WHERE o.mission_id = p_mission_id AND o.client_id = p_client_id
     AND o.status <> 'cumprida'
     AND COALESCE(o.instagram_handle,'') = '' AND COALESCE(o.facebook_key,'') = ''
     AND COALESCE(o.phone_norm,'') = '';

  SELECT count(*) INTO v_count FROM engagement_obrigacoes
   WHERE mission_id = p_mission_id AND status <> 'dispensada';
  UPDATE portal_missions SET monitorada = true, regra_id = v_regra.id,
         publicado_em = COALESCE(publicado_em, created_at), updated_at = now()
   WHERE id = p_mission_id;
  RETURN v_count;
END $function$;