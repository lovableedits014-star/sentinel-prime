-- ============ GRUPOS DE PÚBLICO ============
CREATE TABLE public.engagement_publico_grupos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descricao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.engagement_publico_grupos TO authenticated;
GRANT ALL ON public.engagement_publico_grupos TO service_role;
ALTER TABLE public.engagement_publico_grupos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members manage publico grupos" ON public.engagement_publico_grupos
  FOR ALL TO authenticated USING (public.is_client_member(client_id)) WITH CHECK (public.is_client_member(client_id));
CREATE TRIGGER trg_eng_pub_grupos_updated BEFORE UPDATE ON public.engagement_publico_grupos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.engagement_publico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  grupo_id uuid REFERENCES public.engagement_publico_grupos(id) ON DELETE CASCADE,
  origem text NOT NULL,
  ref_id uuid NOT NULL,
  nome text NOT NULL,
  cargo text,
  telefone text,
  regiao text,
  cidade text,
  incluido boolean NOT NULL DEFAULT true,
  dispensado boolean NOT NULL DEFAULT false,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_eng_publico_unq_grupo ON public.engagement_publico(client_id, grupo_id, origem, ref_id)
  WHERE grupo_id IS NOT NULL;
CREATE UNIQUE INDEX idx_eng_publico_unq_global ON public.engagement_publico(client_id, origem, ref_id)
  WHERE grupo_id IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.engagement_publico TO authenticated;
GRANT ALL ON public.engagement_publico TO service_role;
ALTER TABLE public.engagement_publico ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members manage publico" ON public.engagement_publico
  FOR ALL TO authenticated USING (public.is_client_member(client_id)) WITH CHECK (public.is_client_member(client_id));
CREATE TRIGGER trg_eng_publico_updated BEFORE UPDATE ON public.engagement_publico
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.engagement_regras
  ADD COLUMN IF NOT EXISTS modo_publico text NOT NULL DEFAULT 'automatico',
  ADD COLUMN IF NOT EXISTS grupo_id uuid REFERENCES public.engagement_publico_grupos(id) ON DELETE SET NULL;

-- ============ PÚBLICO-ALVO COM MODO MANUAL / EXCEÇÕES ============
CREATE OR REPLACE FUNCTION public.engagement_publico_alvo(
  p_client_id uuid, p_cargos text[] DEFAULT '{}', p_regioes text[] DEFAULT '{}', p_cidades text[] DEFAULT '{}',
  p_modo text DEFAULT 'automatico', p_grupo_id uuid DEFAULT NULL
) RETURNS TABLE(ref_id uuid, origem text, cargo text, nome text, telefone text, regiao text, cidade text,
  phone_norm text, instagram_handle text, facebook_key text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
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
  ), uniao AS (
    SELECT * FROM auto
    UNION
    SELECT * FROM manuais
  )
  SELECT u.* FROM uniao u
   WHERE NOT EXISTS (
     SELECT 1 FROM engagement_publico d
      WHERE d.client_id = p_client_id AND d.origem = u.origem AND d.ref_id = u.ref_id
        AND d.dispensado
        AND ((p_grupo_id IS NOT NULL AND d.grupo_id = p_grupo_id) OR (p_grupo_id IS NULL AND d.grupo_id IS NULL))
   );
END $$;

DROP FUNCTION IF EXISTS public.engagement_publico_alvo(uuid, text[], text[], text[]);

CREATE OR REPLACE FUNCTION public.engagement_gerar_obrigacoes(
  p_client_id uuid, p_mission_id uuid, p_regra_id uuid DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
  ON CONFLICT (mission_id, origem, ref_id) DO UPDATE
    SET regra_id = EXCLUDED.regra_id, tipo_obrigacao = EXCLUDED.tipo_obrigacao,
        esperado = EXCLUDED.esperado, prazo_em = EXCLUDED.prazo_em,
        instagram_handle = EXCLUDED.instagram_handle, facebook_key = EXCLUDED.facebook_key,
        phone_norm = EXCLUDED.phone_norm, updated_at = now();

  SELECT count(*) INTO v_count FROM engagement_obrigacoes WHERE mission_id = p_mission_id;
  UPDATE portal_missions SET monitorada = true, regra_id = v_regra.id,
         publicado_em = COALESCE(publicado_em, created_at), updated_at = now()
   WHERE id = p_mission_id;
  RETURN v_count;
END $$;

-- ============ CANDIDATOS PARA A LISTA MANUAL ============
CREATE OR REPLACE FUNCTION public.engagement_publico_candidatos(
  p_client_id uuid, p_grupo_id uuid DEFAULT NULL, p_busca text DEFAULT NULL, p_limit integer DEFAULT 800
) RETURNS TABLE(origem text, ref_id uuid, nome text, cargo text, telefone text, regiao text, cidade text,
  instagram_handle text, facebook_key text, no_publico boolean, dispensado boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  RETURN QUERY
  SELECT t.origem, t.ref_id, t.nome, t.cargo, t.telefone, t.regiao, t.cidade,
         t.instagram_handle, t.facebook_key,
         COALESCE(ep.incluido, false) AND NOT COALESCE(ep.dispensado,false),
         COALESCE(ep.dispensado, false)
    FROM public.engagement_time_overview(p_client_id, 1) t
    LEFT JOIN engagement_publico ep
      ON ep.client_id = p_client_id AND ep.origem = t.origem AND ep.ref_id = t.ref_id
     AND ((p_grupo_id IS NOT NULL AND ep.grupo_id = p_grupo_id) OR (p_grupo_id IS NULL AND ep.grupo_id IS NULL))
   WHERE p_busca IS NULL OR btrim(p_busca) = ''
      OR public.normalize_person_name(t.nome) LIKE '%' || public.normalize_person_name(p_busca) || '%'
      OR COALESCE(t.telefone,'') LIKE '%' || regexp_replace(COALESCE(p_busca,''), '\D', '', 'g') || '%'
   ORDER BY t.nome
   LIMIT GREATEST(COALESCE(p_limit,800),1);
END $$;

CREATE OR REPLACE FUNCTION public.engagement_publico_definir(
  p_client_id uuid, p_origem text, p_ref_id uuid, p_incluido boolean,
  p_grupo_id uuid DEFAULT NULL, p_dispensado boolean DEFAULT false, p_observacao text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v record;
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
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
END $$;

-- ============ PENDÊNCIAS DE CADASTRO ============
CREATE OR REPLACE FUNCTION public.engagement_publico_pendencias(
  p_client_id uuid, p_grupo_id uuid DEFAULT NULL, p_regra_id uuid DEFAULT NULL
) RETURNS TABLE(origem text, ref_id uuid, nome text, cargo text, telefone text, regiao text, cidade text,
  instagram_handle text, facebook_key text, sem_instagram boolean, sem_facebook boolean, sem_telefone boolean,
  sem_prova boolean, ultimo_comentario timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
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
  )
  SELECT a.origem, a.ref_id, a.nome, a.cargo, a.telefone, a.regiao, a.cidade,
         a.instagram_handle, a.facebook_key,
         (a.instagram_handle IS NULL OR a.instagram_handle = ''),
         (a.facebook_key IS NULL OR a.facebook_key = ''),
         (a.phone_norm IS NULL OR a.phone_norm = ''),
         ((a.instagram_handle IS NULL OR a.instagram_handle = '')
          AND (a.facebook_key IS NULL OR a.facebook_key = '')
          AND (a.phone_norm IS NULL OR a.phone_norm = '')),
         (SELECT max(c.created_at) FROM comments c
           WHERE c.client_id = p_client_id AND c.is_page_owner = false
             AND ((a.instagram_handle IS NOT NULL AND a.instagram_handle <> ''
                   AND c.platform = 'instagram' AND lower(c.platform_user_id) = a.instagram_handle)
               OR (a.facebook_key IS NOT NULL AND a.facebook_key <> ''
                   AND COALESCE(c.platform,'facebook') = 'facebook'
                   AND lower(c.platform_user_id) = lower(a.facebook_key))))
    FROM alvo a
   ORDER BY a.nome;
END $$;

-- ============ GRAVAR TELEFONE DA PESSOA ============
CREATE OR REPLACE FUNCTION public.engagement_publico_set_telefone(
  p_client_id uuid, p_origem text, p_ref_id uuid, p_telefone text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
  ELSE
    RAISE EXCEPTION 'Origem não suportada: %', p_origem;
  END IF;

  UPDATE engagement_publico SET telefone = v_tel, updated_at = now()
   WHERE client_id = p_client_id AND origem = p_origem AND ref_id = p_ref_id;
END $$;

REVOKE ALL ON FUNCTION public.engagement_publico_alvo(uuid, text[], text[], text[], text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.engagement_publico_candidatos(uuid, uuid, text, integer) FROM anon;
REVOKE ALL ON FUNCTION public.engagement_publico_definir(uuid, text, uuid, boolean, uuid, boolean, text) FROM anon;
REVOKE ALL ON FUNCTION public.engagement_publico_pendencias(uuid, uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.engagement_publico_set_telefone(uuid, text, uuid, text) FROM anon;