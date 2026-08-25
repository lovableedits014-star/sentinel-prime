-- ============ 1. TABELAS ============
CREATE TABLE public.engagement_regras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descricao text,
  cargos text[] NOT NULL DEFAULT '{}',
  regioes text[] NOT NULL DEFAULT '{}',
  cidades text[] NOT NULL DEFAULT '{}',
  tipo_obrigacao text NOT NULL DEFAULT 'interagir',
  esperado integer NOT NULL DEFAULT 1,
  prazo_horas integer NOT NULL DEFAULT 48,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.engagement_regras TO authenticated;
GRANT ALL ON public.engagement_regras TO service_role;
ALTER TABLE public.engagement_regras ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members manage engagement regras" ON public.engagement_regras
  FOR ALL TO authenticated USING (public.is_client_member(client_id)) WITH CHECK (public.is_client_member(client_id));

CREATE TABLE public.engagement_obrigacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES public.portal_missions(id) ON DELETE CASCADE,
  regra_id uuid REFERENCES public.engagement_regras(id) ON DELETE SET NULL,
  origem text NOT NULL,
  ref_id uuid NOT NULL,
  nome text NOT NULL,
  cargo text,
  telefone text,
  regiao text,
  cidade text,
  phone_norm text,
  instagram_handle text,
  facebook_key text,
  tipo_obrigacao text NOT NULL DEFAULT 'interagir',
  esperado integer NOT NULL DEFAULT 1,
  prazo_em timestamptz,
  status text NOT NULL DEFAULT 'pendente',
  evidencia_nivel text,
  evidencia_url text,
  evidencia_validada boolean NOT NULL DEFAULT false,
  pontos numeric NOT NULL DEFAULT 0,
  pontos_possiveis numeric NOT NULL DEFAULT 1,
  cumprida_em timestamptz,
  atraso_horas numeric,
  justificativa text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mission_id, origem, ref_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.engagement_obrigacoes TO authenticated;
GRANT ALL ON public.engagement_obrigacoes TO service_role;
ALTER TABLE public.engagement_obrigacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members manage engagement obrigacoes" ON public.engagement_obrigacoes
  FOR ALL TO authenticated USING (public.is_client_member(client_id)) WITH CHECK (public.is_client_member(client_id));
CREATE POLICY "Pessoa can view own obrigacoes" ON public.engagement_obrigacoes
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.eleicao_pessoas ep WHERE ep.id = engagement_obrigacoes.ref_id AND ep.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.contratados c WHERE c.id = engagement_obrigacoes.ref_id AND c.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.funcionarios f WHERE f.id = engagement_obrigacoes.ref_id AND f.user_id = auth.uid())
  );
CREATE INDEX idx_eng_obr_client_mission ON public.engagement_obrigacoes(client_id, mission_id);
CREATE INDEX idx_eng_obr_pessoa ON public.engagement_obrigacoes(client_id, origem, ref_id);
CREATE INDEX idx_eng_obr_status ON public.engagement_obrigacoes(client_id, status);
CREATE INDEX idx_eng_obr_prazo ON public.engagement_obrigacoes(client_id, prazo_em);

CREATE TABLE public.engagement_indices_diarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  dia date NOT NULL DEFAULT current_date,
  origem text NOT NULL,
  ref_id uuid NOT NULL,
  nome text NOT NULL,
  cargo text,
  telefone text,
  regiao text,
  cidade text,
  periodo_dias integer NOT NULL DEFAULT 30,
  obrigacoes integer NOT NULL DEFAULT 0,
  cumpridas integer NOT NULL DEFAULT 0,
  nao_cumpridas integer NOT NULL DEFAULT 0,
  cumprimento numeric NOT NULL DEFAULT 0,
  qualidade numeric NOT NULL DEFAULT 0,
  regularidade numeric NOT NULL DEFAULT 0,
  pontualidade numeric NOT NULL DEFAULT 0,
  tendencia numeric NOT NULL DEFAULT 0,
  indice numeric NOT NULL DEFAULT 0,
  faixa text NOT NULL DEFAULT 'critico',
  reincidencia integer NOT NULL DEFAULT 0,
  ultima_interacao timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, dia, origem, ref_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.engagement_indices_diarios TO authenticated;
GRANT ALL ON public.engagement_indices_diarios TO service_role;
ALTER TABLE public.engagement_indices_diarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view engagement indices" ON public.engagement_indices_diarios
  FOR ALL TO authenticated USING (public.is_client_member(client_id)) WITH CHECK (public.is_client_member(client_id));
CREATE INDEX idx_eng_idx_client_dia ON public.engagement_indices_diarios(client_id, dia DESC);

CREATE TABLE public.engagement_cobrancas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  origem text NOT NULL,
  ref_id uuid NOT NULL,
  nome text NOT NULL,
  indice_no_momento numeric,
  periodo_dias integer NOT NULL DEFAULT 30,
  canal text NOT NULL DEFAULT 'whatsapp',
  texto text,
  resultado text NOT NULL DEFAULT 'registrada',
  registrado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.engagement_cobrancas TO authenticated;
GRANT ALL ON public.engagement_cobrancas TO service_role;
ALTER TABLE public.engagement_cobrancas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members manage engagement cobrancas" ON public.engagement_cobrancas
  FOR ALL TO authenticated USING (public.is_client_member(client_id)) WITH CHECK (public.is_client_member(client_id));
CREATE INDEX idx_eng_cob_pessoa ON public.engagement_cobrancas(client_id, origem, ref_id, created_at DESC);

-- ============ 2. ALTERAÇÕES ============
ALTER TABLE public.portal_missions
  ADD COLUMN IF NOT EXISTS monitorada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS regra_id uuid REFERENCES public.engagement_regras(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prazo_horas integer,
  ADD COLUMN IF NOT EXISTS publicado_em timestamptz,
  ADD COLUMN IF NOT EXISTS post_id_facebook text,
  ADD COLUMN IF NOT EXISTS post_id_instagram text;

ALTER TABLE public.engagement_config
  ADD COLUMN IF NOT EXISTS faixa_excelente integer NOT NULL DEFAULT 85,
  ADD COLUMN IF NOT EXISTS faixa_atencao integer NOT NULL DEFAULT 70,
  ADD COLUMN IF NOT EXISTS faixa_baixo integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS prazo_horas_default integer NOT NULL DEFAULT 48,
  ADD COLUMN IF NOT EXISTS exigir_evidencia_share boolean NOT NULL DEFAULT true;

CREATE TRIGGER trg_eng_regras_updated BEFORE UPDATE ON public.engagement_regras
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_eng_obr_updated BEFORE UPDATE ON public.engagement_obrigacoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_eng_cob_updated BEFORE UPDATE ON public.engagement_cobrancas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ 3. PÚBLICO-ALVO ============
CREATE OR REPLACE FUNCTION public.engagement_publico_alvo(
  p_client_id uuid, p_cargos text[] DEFAULT '{}', p_regioes text[] DEFAULT '{}', p_cidades text[] DEFAULT '{}'
) RETURNS TABLE(ref_id uuid, origem text, cargo text, nome text, telefone text, regiao text, cidade text,
  phone_norm text, instagram_handle text, facebook_key text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  RETURN QUERY
  SELECT t.ref_id, t.origem, t.cargo, t.nome, t.telefone, t.regiao, t.cidade,
         public.normalize_br_phone(t.telefone), t.instagram_handle, t.facebook_key
    FROM public.engagement_time_overview(p_client_id, 1) t
   WHERE (COALESCE(array_length(p_cargos,1),0) = 0 OR t.cargo = ANY(p_cargos))
     AND (COALESCE(array_length(p_regioes,1),0) = 0 OR COALESCE(t.regiao,'') = ANY(p_regioes))
     AND (COALESCE(array_length(p_cidades,1),0) = 0 OR COALESCE(t.cidade,'') = ANY(p_cidades));
END $$;

-- ============ 4. GERAR OBRIGAÇÕES ============
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
    FROM public.engagement_publico_alvo(p_client_id, v_regra.cargos, v_regra.regioes, v_regra.cidades) a
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

-- ============ 5. CASAR INTERAÇÕES ============
CREATE OR REPLACE FUNCTION public.engagement_casar_interacoes(
  p_client_id uuid, p_mission_id uuid DEFAULT NULL
) RETURNS TABLE(atualizadas integer, nao_cumpridas integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_cfg record; v_upd integer := 0; v_nc integer := 0; r record;
  v_evt timestamptz; v_nivel text; v_peso numeric; v_conf numeric; v_pont numeric; v_inicio timestamptz;
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  SELECT COALESCE(like_points,1) AS lp, COALESCE(comment_points,2) AS cp, COALESCE(share_points,3) AS sp
    INTO v_cfg FROM engagement_config WHERE client_id = p_client_id;
  IF v_cfg IS NULL THEN v_cfg := ROW(1,2,3); END IF;

  FOR r IN
    SELECT o.*, m.post_id_facebook, m.post_id_instagram,
           COALESCE(m.publicado_em, m.created_at) AS inicio
      FROM engagement_obrigacoes o
      JOIN portal_missions m ON m.id = o.mission_id
     WHERE o.client_id = p_client_id
       AND (p_mission_id IS NULL OR o.mission_id = p_mission_id)
       AND o.status IN ('pendente','nao_cumprida')
  LOOP
    v_evt := NULL; v_nivel := NULL; v_peso := 0; v_inicio := r.inicio;

    -- E1: comentário comprovado pela API
    SELECT min(c.created_at) INTO v_evt FROM comments c
     WHERE c.client_id = p_client_id AND c.is_page_owner = false AND c.created_at >= v_inicio
       AND ((r.post_id_instagram IS NOT NULL AND c.post_id = r.post_id_instagram
             AND r.instagram_handle IS NOT NULL AND r.instagram_handle <> ''
             AND lower(c.platform_user_id) = r.instagram_handle)
         OR (r.post_id_facebook IS NOT NULL AND c.post_id = r.post_id_facebook
             AND r.facebook_key IS NOT NULL AND lower(c.platform_user_id) = lower(r.facebook_key)));
    IF v_evt IS NOT NULL THEN v_nivel := 'E1'; v_peso := v_cfg.cp; END IF;

    -- E1: clique no link rastreado
    IF v_evt IS NULL AND r.phone_norm IS NOT NULL THEN
      SELECT min(me.created_at) INTO v_evt FROM mission_events me
        JOIN mission_participants mp ON mp.id = me.participant_id
       WHERE me.client_id = p_client_id AND me.mission_id = r.mission_id
         AND me.event_type IN ('click_facebook','click_instagram','click_avulso')
         AND COALESCE(me.is_bot,false) = false
         AND public.normalize_br_phone(mp.phone_e164) = r.phone_norm;
      IF v_evt IS NOT NULL THEN v_nivel := 'E1'; v_peso := v_cfg.lp; END IF;
    END IF;

    -- E2: declarou conclusão no portal
    IF v_evt IS NULL AND r.phone_norm IS NOT NULL THEN
      SELECT min(me.created_at) INTO v_evt FROM mission_events me
        JOIN mission_participants mp ON mp.id = me.participant_id
       WHERE me.client_id = p_client_id AND me.mission_id = r.mission_id
         AND me.event_type = 'declared_done' AND COALESCE(me.is_bot,false) = false
         AND public.normalize_br_phone(mp.phone_e164) = r.phone_norm;
      IF v_evt IS NOT NULL THEN v_nivel := 'E2'; v_peso := v_cfg.sp; END IF;
    END IF;

    -- E3: evidência anexada e validada pelo coordenador
    IF v_evt IS NULL AND r.evidencia_url IS NOT NULL AND r.evidencia_validada THEN
      v_evt := COALESCE(r.cumprida_em, now()); v_nivel := 'E3'; v_peso := v_cfg.sp;
    END IF;

    IF v_evt IS NOT NULL THEN
      v_conf := CASE v_nivel WHEN 'E1' THEN 1.0 WHEN 'E3' THEN 0.85 ELSE 0.7 END;
      v_pont := CASE
        WHEN r.prazo_em IS NULL OR v_evt <= r.prazo_em THEN 1.0
        WHEN v_evt <= r.prazo_em + (r.prazo_em - v_inicio) THEN 0.8
        ELSE 0.5 END;
      UPDATE engagement_obrigacoes SET
        status = 'cumprida', evidencia_nivel = v_nivel,
        pontos = round((v_peso * v_conf * v_pont)::numeric, 2),
        pontos_possiveis = GREATEST(pontos_possiveis, v_peso),
        cumprida_em = v_evt,
        atraso_horas = CASE WHEN r.prazo_em IS NOT NULL AND v_evt > r.prazo_em
                            THEN round((EXTRACT(EPOCH FROM (v_evt - r.prazo_em))/3600)::numeric, 1) ELSE 0 END,
        updated_at = now()
       WHERE id = r.id;
      v_upd := v_upd + 1;
    ELSIF r.prazo_em IS NOT NULL AND now() > r.prazo_em AND r.status = 'pendente' THEN
      UPDATE engagement_obrigacoes SET status = 'nao_cumprida', pontos = 0, updated_at = now() WHERE id = r.id;
      v_nc := v_nc + 1;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_upd, v_nc;
END $$;

-- ============ 6. RECALCULAR ÍNDICES ============
CREATE OR REPLACE FUNCTION public.engagement_recalcular_indices(
  p_client_id uuid, p_dias integer DEFAULT 30
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_since timestamptz; v_meio timestamptz; v_n integer := 0; v_cfg record;
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  v_since := now() - (GREATEST(COALESCE(p_dias,30),1) || ' days')::interval;
  v_meio := now() - ((GREATEST(COALESCE(p_dias,30),1)/2.0) || ' days')::interval;
  SELECT COALESCE(faixa_excelente,85) AS fe, COALESCE(faixa_atencao,70) AS fa, COALESCE(faixa_baixo,50) AS fb
    INTO v_cfg FROM engagement_config WHERE client_id = p_client_id;
  IF v_cfg IS NULL THEN v_cfg := ROW(85,70,50); END IF;

  WITH base AS (
    SELECT o.origem, o.ref_id, max(o.nome) AS nome, max(o.cargo) AS cargo, max(o.telefone) AS telefone,
           max(o.regiao) AS regiao, max(o.cidade) AS cidade,
           count(*) AS obrigacoes,
           count(*) FILTER (WHERE o.status = 'cumprida') AS cumpridas,
           count(*) FILTER (WHERE o.status = 'nao_cumprida') AS nao_cumpridas,
           COALESCE(sum(o.pontos),0) AS pontos,
           COALESCE(sum(o.pontos_possiveis),0) AS possiveis,
           count(DISTINCT date_trunc('week', o.cumprida_em)) FILTER (WHERE o.status='cumprida') AS semanas_ativas,
           avg(CASE WHEN o.status='cumprida' THEN
                 CASE WHEN COALESCE(o.atraso_horas,0) = 0 THEN 1.0 WHEN o.atraso_horas <= 24 THEN 0.8 ELSE 0.5 END
               END) AS pont,
           max(o.cumprida_em) AS ultima,
           count(*) FILTER (WHERE o.status='cumprida' AND o.cumprida_em >= v_meio) AS recentes_ok,
           count(*) FILTER (WHERE o.created_at >= v_meio) AS recentes_tot,
           count(*) FILTER (WHERE o.status='cumprida' AND o.cumprida_em < v_meio) AS antigas_ok,
           count(*) FILTER (WHERE o.created_at < v_meio) AS antigas_tot
      FROM engagement_obrigacoes o
     WHERE o.client_id = p_client_id AND o.created_at >= v_since AND o.status <> 'dispensada'
     GROUP BY o.origem, o.ref_id
  ), calc AS (
    SELECT b.*,
      CASE WHEN b.obrigacoes > 0 THEN b.cumpridas::numeric / b.obrigacoes ELSE 0 END AS f_cump,
      CASE WHEN b.possiveis > 0 THEN LEAST(1, b.pontos / b.possiveis) ELSE 0 END AS f_qual,
      LEAST(1, b.semanas_ativas::numeric / GREATEST(1, ceil(GREATEST(COALESCE(p_dias,30),1)/7.0))) AS f_reg,
      COALESCE(b.pont, 0) AS f_pont,
      (CASE WHEN b.recentes_tot > 0 THEN b.recentes_ok::numeric/b.recentes_tot ELSE 0 END)
      - (CASE WHEN b.antigas_tot > 0 THEN b.antigas_ok::numeric/b.antigas_tot ELSE 0 END) AS delta
    FROM base b
  ), fim AS (
    SELECT c.*,
      round((100 * (0.50*c.f_cump + 0.20*c.f_qual + 0.15*c.f_reg + 0.10*c.f_pont
             + 0.05*GREATEST(0, LEAST(1, 0.5 + c.delta/2))))::numeric, 1) AS indice
    FROM calc c
  )
  INSERT INTO engagement_indices_diarios (
    client_id, dia, origem, ref_id, nome, cargo, telefone, regiao, cidade, periodo_dias,
    obrigacoes, cumpridas, nao_cumpridas, cumprimento, qualidade, regularidade, pontualidade,
    tendencia, indice, faixa, ultima_interacao
  )
  SELECT p_client_id, current_date, f.origem, f.ref_id, f.nome, f.cargo, f.telefone, f.regiao, f.cidade, p_dias,
         f.obrigacoes, f.cumpridas, f.nao_cumpridas,
         round((100*f.f_cump)::numeric,1), round((100*f.f_qual)::numeric,1),
         round((100*f.f_reg)::numeric,1), round((100*f.f_pont)::numeric,1),
         round((100*f.delta)::numeric,1), f.indice,
         CASE WHEN f.indice >= v_cfg.fe THEN 'excelente'
              WHEN f.indice >= v_cfg.fa THEN 'atencao'
              WHEN f.indice >= v_cfg.fb THEN 'baixo' ELSE 'critico' END,
         f.ultima
    FROM fim f
  ON CONFLICT (client_id, dia, origem, ref_id) DO UPDATE SET
    nome = EXCLUDED.nome, cargo = EXCLUDED.cargo, telefone = EXCLUDED.telefone,
    regiao = EXCLUDED.regiao, cidade = EXCLUDED.cidade, periodo_dias = EXCLUDED.periodo_dias,
    obrigacoes = EXCLUDED.obrigacoes, cumpridas = EXCLUDED.cumpridas, nao_cumpridas = EXCLUDED.nao_cumpridas,
    cumprimento = EXCLUDED.cumprimento, qualidade = EXCLUDED.qualidade, regularidade = EXCLUDED.regularidade,
    pontualidade = EXCLUDED.pontualidade, tendencia = EXCLUDED.tendencia, indice = EXCLUDED.indice,
    faixa = EXCLUDED.faixa, ultima_interacao = EXCLUDED.ultima_interacao;

  SELECT count(*) INTO v_n FROM engagement_indices_diarios
   WHERE client_id = p_client_id AND dia = current_date;
  RETURN v_n;
END $$;

-- ============ 7. LEITURAS ============
CREATE OR REPLACE FUNCTION public.engagement_monitor_overview(p_client_id uuid)
RETURNS TABLE(total_pessoas bigint, publicacoes_monitoradas bigint, obrigacoes bigint, cumpridas bigint,
  nao_cumpridas bigint, pendentes bigint, cumprimento_geral numeric,
  excelente bigint, atencao bigint, baixo bigint, critico bigint, indice_medio numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_dia date;
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  SELECT max(dia) INTO v_dia FROM engagement_indices_diarios WHERE client_id = p_client_id;
  RETURN QUERY
  SELECT
    (SELECT count(DISTINCT (origem, ref_id)) FROM engagement_obrigacoes WHERE client_id = p_client_id),
    (SELECT count(*) FROM portal_missions WHERE client_id = p_client_id AND monitorada),
    (SELECT count(*) FROM engagement_obrigacoes WHERE client_id = p_client_id),
    (SELECT count(*) FROM engagement_obrigacoes WHERE client_id = p_client_id AND status='cumprida'),
    (SELECT count(*) FROM engagement_obrigacoes WHERE client_id = p_client_id AND status='nao_cumprida'),
    (SELECT count(*) FROM engagement_obrigacoes WHERE client_id = p_client_id AND status='pendente'),
    (SELECT CASE WHEN count(*) FILTER (WHERE status <> 'dispensada') > 0
       THEN round(100.0*count(*) FILTER (WHERE status='cumprida')/count(*) FILTER (WHERE status <> 'dispensada'),1)
       ELSE 0 END FROM engagement_obrigacoes WHERE client_id = p_client_id),
    (SELECT count(*) FROM engagement_indices_diarios WHERE client_id=p_client_id AND dia=v_dia AND faixa='excelente'),
    (SELECT count(*) FROM engagement_indices_diarios WHERE client_id=p_client_id AND dia=v_dia AND faixa='atencao'),
    (SELECT count(*) FROM engagement_indices_diarios WHERE client_id=p_client_id AND dia=v_dia AND faixa='baixo'),
    (SELECT count(*) FROM engagement_indices_diarios WHERE client_id=p_client_id AND dia=v_dia AND faixa='critico'),
    (SELECT COALESCE(round(avg(indice),1),0) FROM engagement_indices_diarios WHERE client_id=p_client_id AND dia=v_dia);
END $$;

CREATE OR REPLACE FUNCTION public.engagement_ranking(p_client_id uuid, p_limit integer DEFAULT 500)
RETURNS TABLE(origem text, ref_id uuid, nome text, cargo text, telefone text, regiao text, cidade text,
  obrigacoes integer, cumpridas integer, nao_cumpridas integer, cumprimento numeric, qualidade numeric,
  regularidade numeric, pontualidade numeric, tendencia numeric, indice numeric, faixa text,
  indice_anterior numeric, variacao numeric, ultima_interacao timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_dia date; v_ant date;
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  SELECT max(dia) INTO v_dia FROM engagement_indices_diarios WHERE client_id = p_client_id;
  SELECT max(dia) INTO v_ant FROM engagement_indices_diarios WHERE client_id = p_client_id AND dia < v_dia;
  RETURN QUERY
  SELECT i.origem, i.ref_id, i.nome, i.cargo, i.telefone, i.regiao, i.cidade,
         i.obrigacoes, i.cumpridas, i.nao_cumpridas, i.cumprimento, i.qualidade,
         i.regularidade, i.pontualidade, i.tendencia, i.indice, i.faixa,
         a.indice, CASE WHEN a.indice IS NULL THEN NULL ELSE round(i.indice - a.indice,1) END,
         i.ultima_interacao
    FROM engagement_indices_diarios i
    LEFT JOIN engagement_indices_diarios a
      ON a.client_id = i.client_id AND a.dia = v_ant AND a.origem = i.origem AND a.ref_id = i.ref_id
   WHERE i.client_id = p_client_id AND i.dia = v_dia
   ORDER BY i.indice DESC, i.nome
   LIMIT GREATEST(COALESCE(p_limit,500),1);
END $$;

CREATE OR REPLACE FUNCTION public.engagement_adesao_publicacoes(p_client_id uuid, p_limit integer DEFAULT 100)
RETURNS TABLE(mission_id uuid, titulo text, plataforma text, publicado_em timestamptz, prazo_em timestamptz,
  obrigacoes bigint, cumpridas bigint, nao_cumpridas bigint, pendentes bigint, adesao numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  RETURN QUERY
  SELECT m.id, COALESCE(m.title, m.post_url), m.platform,
         COALESCE(m.publicado_em, m.created_at), max(o.prazo_em),
         count(o.id), count(o.id) FILTER (WHERE o.status='cumprida'),
         count(o.id) FILTER (WHERE o.status='nao_cumprida'), count(o.id) FILTER (WHERE o.status='pendente'),
         CASE WHEN count(o.id) > 0 THEN round(100.0*count(o.id) FILTER (WHERE o.status='cumprida')/count(o.id),1) ELSE 0 END
    FROM portal_missions m
    LEFT JOIN engagement_obrigacoes o ON o.mission_id = m.id
   WHERE m.client_id = p_client_id AND m.monitorada
   GROUP BY m.id, m.title, m.post_url, m.platform, m.publicado_em, m.created_at
   ORDER BY COALESCE(m.publicado_em, m.created_at) DESC
   LIMIT GREATEST(COALESCE(p_limit,100),1);
END $$;

CREATE OR REPLACE FUNCTION public.engagement_historico_pessoa(
  p_client_id uuid, p_origem text, p_ref_id uuid, p_limit integer DEFAULT 200
) RETURNS TABLE(obrigacao_id uuid, mission_id uuid, titulo text, plataforma text, post_url text,
  publicado_em timestamptz, prazo_em timestamptz, tipo_obrigacao text, status text, evidencia_nivel text,
  evidencia_url text, pontos numeric, cumprida_em timestamptz, atraso_horas numeric, justificativa text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  RETURN QUERY
  SELECT o.id, m.id, COALESCE(m.title, m.post_url), m.platform, m.post_url,
         COALESCE(m.publicado_em, m.created_at), o.prazo_em, o.tipo_obrigacao, o.status, o.evidencia_nivel,
         o.evidencia_url, o.pontos, o.cumprida_em, o.atraso_horas, o.justificativa
    FROM engagement_obrigacoes o
    JOIN portal_missions m ON m.id = o.mission_id
   WHERE o.client_id = p_client_id AND o.origem = p_origem AND o.ref_id = p_ref_id
   ORDER BY COALESCE(m.publicado_em, m.created_at) DESC
   LIMIT GREATEST(COALESCE(p_limit,200),1);
END $$;

CREATE OR REPLACE FUNCTION public.engagement_registrar_cobranca(
  p_client_id uuid, p_origem text, p_ref_id uuid, p_canal text DEFAULT 'whatsapp',
  p_texto text DEFAULT NULL, p_resultado text DEFAULT 'registrada'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid; v_nome text; v_ind numeric; v_dias integer;
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  SELECT i.nome, i.indice, i.periodo_dias INTO v_nome, v_ind, v_dias
    FROM engagement_indices_diarios i
   WHERE i.client_id = p_client_id AND i.origem = p_origem AND i.ref_id = p_ref_id
   ORDER BY i.dia DESC LIMIT 1;
  IF v_nome IS NULL THEN
    SELECT o.nome INTO v_nome FROM engagement_obrigacoes o
     WHERE o.client_id = p_client_id AND o.origem = p_origem AND o.ref_id = p_ref_id LIMIT 1;
  END IF;
  INSERT INTO engagement_cobrancas (client_id, origem, ref_id, nome, indice_no_momento, periodo_dias,
    canal, texto, resultado, registrado_por)
  VALUES (p_client_id, p_origem, p_ref_id, COALESCE(v_nome,'—'), v_ind, COALESCE(v_dias,30),
    COALESCE(p_canal,'whatsapp'), p_texto, COALESCE(p_resultado,'registrada'), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.engagement_publico_alvo(uuid, text[], text[], text[]) FROM anon;
REVOKE ALL ON FUNCTION public.engagement_gerar_obrigacoes(uuid, uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.engagement_casar_interacoes(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.engagement_recalcular_indices(uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION public.engagement_monitor_overview(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.engagement_ranking(uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION public.engagement_adesao_publicacoes(uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION public.engagement_historico_pessoa(uuid, text, uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION public.engagement_registrar_cobranca(uuid, text, uuid, text, text, text) FROM anon;