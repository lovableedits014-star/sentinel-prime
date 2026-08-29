-- Elegibilidade temporal e fotografia imutavel do publico de cada missao.
-- Pessoas que entram depois da publicacao nunca viram falta retroativa.

ALTER TABLE public.portal_missions
  ADD COLUMN IF NOT EXISTS audience_snapshotted_at timestamptz,
  ADD COLUMN IF NOT EXISTS eligible_count integer;

ALTER TABLE public.engagement_obrigacoes
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS eligible_from timestamptz,
  ADD COLUMN IF NOT EXISTS eligible_until timestamptz,
  ADD COLUMN IF NOT EXISTS assignment_source text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS snapshot_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS dispensa_motivo text;

CREATE TABLE IF NOT EXISTS public.engagement_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  audience_id uuid REFERENCES public.engagement_publico_grupos(id) ON DELETE CASCADE,
  origem text NOT NULL,
  ref_id uuid NOT NULL,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_until timestamptz,
  source text NOT NULL DEFAULT 'manual',
  motivo text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_until IS NULL OR effective_until > effective_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_eng_memberships_active
  ON public.engagement_memberships(client_id, audience_id, origem, ref_id)
  NULLS NOT DISTINCT
  WHERE effective_until IS NULL;
CREATE INDEX IF NOT EXISTS idx_eng_memberships_period
  ON public.engagement_memberships(client_id, origem, ref_id, effective_from, effective_until);

ALTER TABLE public.engagement_memberships ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.engagement_memberships TO authenticated;
GRANT ALL ON public.engagement_memberships TO service_role;
DROP POLICY IF EXISTS "Members manage engagement memberships" ON public.engagement_memberships;
CREATE POLICY "Members manage engagement memberships" ON public.engagement_memberships
  FOR ALL TO authenticated USING (public.is_client_member(client_id)) WITH CHECK (public.is_client_member(client_id));

-- Converte o estado atual da lista manual em periodos ativos.
INSERT INTO public.engagement_memberships (
  client_id, audience_id, origem, ref_id, effective_from, source, motivo
)
SELECT ep.client_id, ep.grupo_id, ep.origem, ep.ref_id, ep.created_at, 'backfill', 'Estado ativo na implantacao'
FROM public.engagement_publico ep
WHERE ep.incluido AND NOT ep.dispensado
ON CONFLICT (client_id, audience_id, origem, ref_id) WHERE effective_until IS NULL DO NOTHING;

CREATE OR REPLACE FUNCTION public.engagement_publico_membership_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_old_active boolean := false;
  v_new_active boolean := false;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    v_old_active := OLD.incluido AND NOT OLD.dispensado;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_new_active := NEW.incluido AND NOT NEW.dispensado;
  END IF;

  IF v_old_active AND (NOT v_new_active OR OLD.grupo_id IS DISTINCT FROM NEW.grupo_id) THEN
    UPDATE public.engagement_memberships
       SET effective_until = now(), motivo = coalesce(
         CASE WHEN TG_OP='DELETE' THEN NULL ELSE NEW.observacao END,
         motivo, 'Removido do publico'
       )
     WHERE client_id=OLD.client_id AND audience_id IS NOT DISTINCT FROM OLD.grupo_id
       AND origem=OLD.origem AND ref_id=OLD.ref_id AND effective_until IS NULL;
  END IF;

  IF v_new_active AND (NOT v_old_active OR OLD.grupo_id IS DISTINCT FROM NEW.grupo_id) THEN
    INSERT INTO public.engagement_memberships (
      client_id, audience_id, origem, ref_id, effective_from, source, motivo, created_by
    ) VALUES (
      NEW.client_id, NEW.grupo_id, NEW.origem, NEW.ref_id, now(), 'engagement_publico', NEW.observacao, auth.uid()
    ) ON CONFLICT (client_id, audience_id, origem, ref_id) WHERE effective_until IS NULL DO NOTHING;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_engagement_publico_membership_history ON public.engagement_publico;
CREATE TRIGGER trg_engagement_publico_membership_history
AFTER INSERT OR UPDATE OF incluido, dispensado, grupo_id OR DELETE ON public.engagement_publico
FOR EACH ROW EXECUTE FUNCTION public.engagement_publico_membership_history();

-- Data objetiva em que a pessoa passou a existir no sistema. NULL significa
-- origem legada/desconhecida e nao deve gerar uma presuncao contra a pessoa.
CREATE OR REPLACE FUNCTION public.engagement_entity_created_at(p_origem text, p_ref_id uuid)
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public AS $$
  SELECT CASE p_origem
    WHEN 'eleicao' THEN (SELECT created_at FROM public.eleicao_pessoas WHERE id=p_ref_id)
    WHEN 'funcionario' THEN (SELECT created_at FROM public.funcionarios WHERE id=p_ref_id)
    WHEN 'contratado' THEN (SELECT created_at FROM public.contratados WHERE id=p_ref_id)
    WHEN 'manual' THEN (SELECT min(created_at) FROM public.engagement_publico WHERE origem='manual' AND ref_id=p_ref_id)
    ELSE NULL
  END;
$$;
REVOKE ALL ON FUNCTION public.engagement_entity_created_at(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.engagement_entity_created_at(text,uuid) TO service_role;

-- Missao que ja possui obrigacoes ja tem uma fotografia historica: congele-a.
UPDATE public.portal_missions m
SET audience_snapshotted_at = coalesce(m.audience_snapshotted_at, s.first_assigned),
    eligible_count = coalesce(m.eligible_count, s.qty)
FROM (
  SELECT mission_id, min(created_at) first_assigned,
         count(*) FILTER (WHERE status <> 'dispensada')::integer qty
  FROM public.engagement_obrigacoes GROUP BY mission_id
) s
WHERE s.mission_id=m.id AND m.audience_snapshotted_at IS NULL;

-- Saneamento conservador: so dispensa quando ha prova objetiva de que o cadastro
-- da pessoa e posterior a publicacao. Nada e apagado.
WITH invalidas AS (
  SELECT o.id, public.engagement_entity_created_at(o.origem,o.ref_id) entrada
  FROM public.engagement_obrigacoes o
  JOIN public.portal_missions m ON m.id=o.mission_id
  WHERE o.status <> 'cumprida'
    AND public.engagement_entity_created_at(o.origem,o.ref_id) IS NOT NULL
    AND public.engagement_entity_created_at(o.origem,o.ref_id) > coalesce(m.publicado_em,m.created_at)
)
UPDATE public.engagement_obrigacoes o
SET status='dispensada', pontos=0, eligible_from=i.entrada,
    dispensa_motivo='entrada_posterior_publicacao',
    justificativa=coalesce(o.justificativa,'Entrada posterior a publicacao'), updated_at=now()
FROM invalidas i WHERE i.id=o.id;

UPDATE public.portal_missions m
SET eligible_count=(SELECT count(*)::integer FROM public.engagement_obrigacoes o
  WHERE o.mission_id=m.id AND o.status<>'dispensada')
WHERE m.audience_snapshotted_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.engagement_gerar_obrigacoes(
  p_client_id uuid, p_mission_id uuid, p_regra_id uuid DEFAULT NULL::uuid
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_regra record; v_mission record; v_prazo timestamptz; v_count integer := 0;
  v_default_prazo integer; v_publicado timestamptz;
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;
  SELECT * INTO v_mission FROM portal_missions WHERE id=p_mission_id AND client_id=p_client_id FOR UPDATE;
  IF v_mission IS NULL THEN RAISE EXCEPTION 'Publicacao nao encontrada'; END IF;

  -- Fotografia fechada: nunca acrescente hoje alguem a uma missao antiga.
  IF v_mission.audience_snapshotted_at IS NOT NULL THEN
    SELECT count(*)::integer INTO v_count FROM engagement_obrigacoes
     WHERE mission_id=p_mission_id AND status <> 'dispensada';
    RETURN v_count;
  END IF;

  SELECT * INTO v_regra FROM engagement_regras
   WHERE id=coalesce(p_regra_id,v_mission.regra_id) AND client_id=p_client_id;
  IF v_regra IS NULL THEN RAISE EXCEPTION 'Defina uma regra de obrigacao para esta publicacao'; END IF;

  SELECT coalesce(prazo_horas_default,48) INTO v_default_prazo FROM engagement_config WHERE client_id=p_client_id;
  v_publicado := coalesce(v_mission.publicado_em,v_mission.created_at);
  v_prazo := v_publicado + (coalesce(v_mission.prazo_horas,v_regra.prazo_horas,v_default_prazo,48)||' hours')::interval;

  INSERT INTO engagement_obrigacoes (
    client_id,mission_id,regra_id,origem,ref_id,nome,cargo,telefone,regiao,cidade,
    phone_norm,instagram_handle,facebook_key,tipo_obrigacao,esperado,prazo_em,pontos_possiveis,
    assigned_at,eligible_from,assignment_source,snapshot_version
  )
  SELECT p_client_id,p_mission_id,v_regra.id,a.origem,a.ref_id,a.nome,a.cargo,a.telefone,a.regiao,a.cidade,
    a.phone_norm,a.instagram_handle,a.facebook_key,v_regra.tipo_obrigacao,greatest(coalesce(v_regra.esperado,1),1),v_prazo,
    CASE v_regra.tipo_obrigacao WHEN 'comentar' THEN 2 WHEN 'evidencia' THEN 3 ELSE 1 END,
    now(), eligibility.eligible_from,'mission_snapshot',2
  FROM public.engagement_publico_alvo(
    p_client_id,v_regra.cargos,v_regra.regioes,v_regra.cidades,v_regra.modo_publico,v_regra.grupo_id
  ) a
  CROSS JOIN LATERAL (
    SELECT CASE WHEN v_regra.modo_publico='manual' THEN (
      SELECT min(em.effective_from) FROM engagement_memberships em
       WHERE em.client_id=p_client_id AND em.audience_id IS NOT DISTINCT FROM v_regra.grupo_id
         AND em.origem=a.origem AND em.ref_id=a.ref_id
         AND em.effective_from <= v_publicado
         AND (em.effective_until IS NULL OR em.effective_until > v_publicado)
    ) ELSE public.engagement_entity_created_at(a.origem,a.ref_id) END eligible_from
  ) eligibility
  WHERE (eligibility.eligible_from IS NULL OR eligibility.eligible_from <= v_publicado)
    AND (v_regra.modo_publico <> 'manual' OR eligibility.eligible_from IS NOT NULL)
    AND CASE v_regra.tipo_obrigacao
      WHEN 'comentar' THEN coalesce(a.instagram_handle,'')<>'' OR coalesce(a.facebook_key,'')<>''
      WHEN 'evidencia' THEN coalesce(a.phone_norm,'')<>''
      ELSE coalesce(a.instagram_handle,'')<>'' OR coalesce(a.facebook_key,'')<>'' OR coalesce(a.phone_norm,'')<>''
    END
  ON CONFLICT (mission_id,origem,ref_id) DO NOTHING;

  SELECT count(*)::integer INTO v_count FROM engagement_obrigacoes
   WHERE mission_id=p_mission_id AND status <> 'dispensada';
  UPDATE portal_missions SET monitorada=true,regra_id=v_regra.id,publicado_em=v_publicado,
    audience_snapshotted_at=now(),eligible_count=v_count,updated_at=now()
   WHERE id=p_mission_id;
  RETURN v_count;
END $$;

-- Relatorios operacionais devem usar exclusivamente a fotografia, nunca o publico atual.
CREATE OR REPLACE FUNCTION public.engagement_adesao_publicacoes(p_client_id uuid,p_limit integer DEFAULT 100)
RETURNS TABLE(mission_id uuid,titulo text,plataforma text,publicado_em timestamptz,prazo_em timestamptz,
  obrigacoes bigint,cumpridas bigint,nao_cumpridas bigint,pendentes bigint,adesao numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO public AS $$
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;
  RETURN QUERY SELECT m.id,coalesce(m.title,m.post_url),m.platform,coalesce(m.publicado_em,m.created_at),max(o.prazo_em),
    count(o.id) FILTER(WHERE o.status<>'dispensada'),count(o.id) FILTER(WHERE o.status='cumprida'),
    count(o.id) FILTER(WHERE o.status='nao_cumprida'),count(o.id) FILTER(WHERE o.status='pendente'),
    CASE WHEN count(o.id) FILTER(WHERE o.status<>'dispensada')>0 THEN round(100.0*count(o.id) FILTER(WHERE o.status='cumprida')/count(o.id) FILTER(WHERE o.status<>'dispensada'),1) ELSE 0 END
  FROM portal_missions m LEFT JOIN engagement_obrigacoes o ON o.mission_id=m.id
  WHERE m.client_id=p_client_id AND m.monitorada
  GROUP BY m.id,m.title,m.post_url,m.platform,m.publicado_em,m.created_at
  ORDER BY coalesce(m.publicado_em,m.created_at) DESC LIMIT greatest(coalesce(p_limit,100),1);
END $$;

CREATE OR REPLACE FUNCTION public.engagement_eligibility_audit(p_client_id uuid)
RETURNS TABLE(mission_id uuid,titulo text,publicado_em timestamptz,fotografia_em timestamptz,
  elegiveis integer,dispensados_entrada_posterior integer,sem_fotografia boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO public AS $$
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;
  RETURN QUERY SELECT m.id,coalesce(m.title,m.post_url),coalesce(m.publicado_em,m.created_at),m.audience_snapshotted_at,
    count(o.id) FILTER(WHERE o.status<>'dispensada')::integer,
    count(o.id) FILTER(WHERE o.dispensa_motivo='entrada_posterior_publicacao')::integer,
    m.audience_snapshotted_at IS NULL
  FROM portal_missions m LEFT JOIN engagement_obrigacoes o ON o.mission_id=m.id
  WHERE m.client_id=p_client_id AND m.monitorada
  GROUP BY m.id,m.title,m.post_url,m.publicado_em,m.created_at,m.audience_snapshotted_at
  ORDER BY coalesce(m.publicado_em,m.created_at) DESC;
END $$;

-- A camada analitica tambem usa apenas obrigacoes validas congeladas. A antiga
-- resolucao dinamica de audiencia foi removida deliberadamente.
CREATE OR REPLACE FUNCTION public.engagement_pub_facts_v2(
  p_client_id uuid,p_dias integer DEFAULT 30,p_audience_id uuid DEFAULT NULL,
  p_offset_dias integer DEFAULT 0,p_root_id uuid DEFAULT NULL,p_mission_id uuid DEFAULT NULL
) RETURNS TABLE(
  mission_id uuid,titulo text,plataforma text,publicado_em timestamptz,
  pessoa_id uuid,origem text,nome text,telefone text,cargo text,regiao text,cidade text,
  is_voluntario boolean,tem_contrato boolean,status text,prova text,
  cumprido_em timestamptz,primeiro_acesso_em timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_ini timestamptz := now()-make_interval(days=>coalesce(p_dias,30)+coalesce(p_offset_dias,0));
  v_fim timestamptz := now()-make_interval(days=>coalesce(p_offset_dias,0));
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;
  RETURN QUERY
  WITH RECURSIVE team AS (
    SELECT p.id FROM eleicao_pessoas p WHERE p.id=p_root_id AND p.client_id=p_client_id
    UNION ALL SELECT p.id FROM eleicao_pessoas p JOIN team t ON p.parent_id=t.id WHERE p.client_id=p_client_id
  ), miss AS (
    SELECT m.id,m.title,m.platform,coalesce(m.publicado_em,m.created_at) pub_em,m.audience_id
    FROM portal_missions m
    WHERE m.client_id=p_client_id AND m.archived_at IS NULL AND m.audience_snapshotted_at IS NOT NULL
      AND (p_mission_id IS NULL OR m.id=p_mission_id)
      AND (p_audience_id IS NULL OR m.audience_id IS NULL OR m.audience_id=p_audience_id)
      AND coalesce(m.publicado_em,m.created_at) BETWEEN v_ini AND v_fim
  ), base AS (
    SELECT m.*,o.ref_id pessoa_id,o.origem,o.nome,o.telefone,o.cargo,o.regiao,o.cidade,
      (o.cargo='voluntario') is_voluntario,
      coalesce((SELECT coalesce(ep.valor_contratacao,0)>0 FROM eleicao_pessoas ep WHERE o.origem='eleicao' AND ep.id=o.ref_id),false) tem_contrato
    FROM miss m JOIN engagement_obrigacoes o ON o.mission_id=m.id AND o.client_id=p_client_id
    WHERE o.status<>'dispensada'
      AND (p_root_id IS NULL OR (o.origem='eleicao' AND o.ref_id IN (SELECT id FROM team)))
  ), ck AS (
    SELECT c.* FROM mission_checkins c WHERE c.client_id=p_client_id AND c.mission_id IN(SELECT id FROM miss)
  ), ob AS (
    SELECT o.mission_id,o.origem,o.ref_id,
      bool_or(o.status='cumprida' AND (o.evidencia_nivel='E2' OR (o.evidencia_nivel IN('E1','E3') AND o.evidencia_validada))) cumprida,
      bool_or(o.evidencia_nivel='E1' AND o.evidencia_validada) e1,
      bool_or(o.evidencia_nivel='E3' AND o.evidencia_validada) e3,max(o.cumprida_em) cumprida_em
    FROM engagement_obrigacoes o
    WHERE o.client_id=p_client_id AND o.mission_id IN(SELECT id FROM miss) AND o.status<>'dispensada'
    GROUP BY 1,2,3
  ), paired AS (
    SELECT b.*,c.primeiro_acesso_em,c.concluido_em,c.participant_id,
      coalesce(o.cumprida,false) ob_cumprida,coalesce(o.e1,false) ob_e1,coalesce(o.e3,false) ob_e3,o.cumprida_em ob_em,
      EXISTS(SELECT 1 FROM mission_events e WHERE e.mission_id=b.id AND e.participant_id=c.participant_id
        AND coalesce(e.is_bot,false)=false AND e.event_type::text LIKE 'click_%') clicou
    FROM base b LEFT JOIN ck c ON c.mission_id=b.id AND
      ((b.origem='eleicao' AND c.pessoa_id=b.pessoa_id) OR (b.origem='funcionario' AND c.funcionario_id=b.pessoa_id))
    LEFT JOIN ob o ON o.mission_id=b.id AND o.origem=b.origem AND o.ref_id=b.pessoa_id
  )
  SELECT p.id,p.title,p.platform,p.pub_em,p.pessoa_id,p.origem,p.nome,p.telefone,p.cargo,p.regiao,p.cidade,
    p.is_voluntario,p.tem_contrato,
    CASE WHEN p.concluido_em IS NOT NULL OR p.ob_cumprida OR p.ob_e1 OR p.ob_e3 THEN 'cumpriu'
      WHEN p.primeiro_acesso_em IS NOT NULL OR p.clicou THEN 'abriu' ELSE 'nao_abriu' END,
    CASE WHEN p.ob_e1 THEN 'E1' WHEN p.ob_e3 THEN 'E3' WHEN p.concluido_em IS NOT NULL OR p.ob_cumprida THEN 'E2' ELSE NULL END,
    coalesce(p.concluido_em,p.ob_em),p.primeiro_acesso_em FROM paired p;
END $$;

CREATE OR REPLACE FUNCTION public.engagement_monitor_overview(p_client_id uuid)
RETURNS TABLE(total_pessoas bigint,publicacoes_monitoradas bigint,obrigacoes bigint,cumpridas bigint,
  nao_cumpridas bigint,pendentes bigint,cumprimento_geral numeric,
  excelente bigint,atencao bigint,baixo bigint,critico bigint,indice_medio numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO public AS $$
DECLARE v_dia date;
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;
  SELECT max(dia) INTO v_dia FROM engagement_indices_diarios WHERE client_id=p_client_id;
  RETURN QUERY SELECT
    (SELECT count(DISTINCT(origem,ref_id)) FROM engagement_obrigacoes WHERE client_id=p_client_id AND status<>'dispensada'),
    (SELECT count(*) FROM portal_missions WHERE client_id=p_client_id AND monitorada),
    (SELECT count(*) FROM engagement_obrigacoes WHERE client_id=p_client_id AND status<>'dispensada'),
    (SELECT count(*) FROM engagement_obrigacoes WHERE client_id=p_client_id AND status='cumprida'),
    (SELECT count(*) FROM engagement_obrigacoes WHERE client_id=p_client_id AND status='nao_cumprida'),
    (SELECT count(*) FROM engagement_obrigacoes WHERE client_id=p_client_id AND status='pendente'),
    (SELECT CASE WHEN count(*) FILTER(WHERE status<>'dispensada')>0 THEN round(100.0*count(*) FILTER(WHERE status='cumprida')/count(*) FILTER(WHERE status<>'dispensada'),1) ELSE 0 END FROM engagement_obrigacoes WHERE client_id=p_client_id),
    (SELECT count(*) FROM engagement_indices_diarios WHERE client_id=p_client_id AND dia=v_dia AND faixa='excelente'),
    (SELECT count(*) FROM engagement_indices_diarios WHERE client_id=p_client_id AND dia=v_dia AND faixa='atencao'),
    (SELECT count(*) FROM engagement_indices_diarios WHERE client_id=p_client_id AND dia=v_dia AND faixa='baixo'),
    (SELECT count(*) FROM engagement_indices_diarios WHERE client_id=p_client_id AND dia=v_dia AND faixa='critico'),
    (SELECT coalesce(round(avg(indice),1),0) FROM engagement_indices_diarios WHERE client_id=p_client_id AND dia=v_dia);
END $$;

CREATE OR REPLACE FUNCTION public.mission_checkin_dashboard_v2(
  p_client_id uuid,p_mission_id uuid,p_audience_id uuid DEFAULT NULL,
  p_incluir_sem_valor boolean DEFAULT true,p_incluir_funcionarios boolean DEFAULT false
) RETURNS TABLE(
  pessoa_id uuid,origem text,nome text,telefone text,cargo text,regiao text,cidade text,
  is_voluntario boolean,tem_contrato boolean,indicador_nome text,indicador_id uuid,status text,
  primeiro_acesso_em timestamptz,concluido_em timestamptz,clicks integer,tem_cadastro boolean,
  links_clicados text[],missoes_cobradas integer,missoes_cumpridas integer,pct_cumprimento integer,
  ultimas_missoes jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO public AS $$
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;
  RETURN QUERY
  WITH base AS (
    SELECT o.ref_id pessoa_id,o.origem,o.nome,o.telefone,o.cargo,o.regiao,o.cidade,o.status obrig_status,o.cumprida_em,
      (o.cargo='voluntario') is_voluntario,
      coalesce((SELECT coalesce(ep.valor_contratacao,0)>0 FROM eleicao_pessoas ep WHERE o.origem='eleicao' AND ep.id=o.ref_id),o.cargo IN('contratado','funcionario')) tem_contrato,
      (SELECT pai.nome FROM eleicao_pessoas ep LEFT JOIN eleicao_pessoas pai ON pai.id=ep.parent_id WHERE o.origem='eleicao' AND ep.id=o.ref_id) indicador_nome,
      (SELECT ep.parent_id FROM eleicao_pessoas ep WHERE o.origem='eleicao' AND ep.id=o.ref_id) indicador_id
    FROM engagement_obrigacoes o JOIN portal_missions m ON m.id=o.mission_id
    WHERE o.client_id=p_client_id AND o.mission_id=p_mission_id AND o.status<>'dispensada'
      AND (p_audience_id IS NULL OR m.audience_id IS NULL OR m.audience_id=p_audience_id)
  ), ck AS (
    SELECT c.pessoa_id,c.funcionario_id,c.participant_id,c.primeiro_acesso_em,c.concluido_em,c.clicks
    FROM mission_checkins c WHERE c.client_id=p_client_id AND c.mission_id=p_mission_id
  ), hist AS (
    SELECT o.origem,o.ref_id,count(*)::integer total,
      count(*) FILTER(WHERE o.status='cumprida')::integer cumpridas,
      jsonb_agg(jsonb_build_object('mission_id',o.mission_id,'cumpriu',o.status='cumprida',
        'em',coalesce(o.cumprida_em,o.created_at)) ORDER BY o.created_at DESC) trilha
    FROM engagement_obrigacoes o
    WHERE o.client_id=p_client_id AND o.status<>'dispensada' GROUP BY o.origem,o.ref_id
  )
  SELECT b.pessoa_id,b.origem,b.nome,b.telefone,b.cargo,b.regiao,b.cidade,b.is_voluntario,b.tem_contrato,
    b.indicador_nome,b.indicador_id,
    CASE WHEN b.obrig_status='cumprida' OR k.concluido_em IS NOT NULL THEN 'cumpriu'
      WHEN k.primeiro_acesso_em IS NOT NULL THEN 'abriu' ELSE 'nao_abriu' END,
    k.primeiro_acesso_em,coalesce(k.concluido_em,b.cumprida_em),coalesce(k.clicks,0),true,
    coalesce((SELECT array_agg(DISTINCT l.label) FROM mission_events e JOIN portal_mission_links l ON l.id=e.mission_link_id
      WHERE e.mission_id=p_mission_id AND e.participant_id=k.participant_id),ARRAY[]::text[]),
    coalesce(h.total,0),coalesce(h.cumpridas,0),
    CASE WHEN coalesce(h.total,0)>0 THEN round(h.cumpridas::numeric/h.total*100)::integer ELSE 0 END,
    coalesce(h.trilha,'[]'::jsonb)
  FROM base b LEFT JOIN ck k ON
    (b.origem='eleicao' AND k.pessoa_id=b.pessoa_id) OR (b.origem='funcionario' AND k.funcionario_id=b.pessoa_id)
  LEFT JOIN hist h ON h.origem=b.origem AND h.ref_id=b.pessoa_id ORDER BY b.nome;
END $$;

CREATE OR REPLACE FUNCTION public.mission_snapshot_audience(
  p_client_id uuid,p_mission_id uuid,p_audience_id uuid DEFAULT NULL
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE v_m record; v_regra jsonb; v_count integer; v_audience_id uuid := p_audience_id;
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;
  SELECT * INTO v_m FROM portal_missions WHERE id=p_mission_id AND client_id=p_client_id FOR UPDATE;
  IF v_m.id IS NULL THEN RAISE EXCEPTION 'Missao nao encontrada'; END IF;
  IF v_m.audience_snapshotted_at IS NOT NULL THEN
    IF v_m.audience_id IS DISTINCT FROM p_audience_id THEN
      RAISE EXCEPTION 'O publico historico desta missao ja foi congelado';
    END IF;
    RETURN coalesce(v_m.eligible_count,0);
  END IF;

  IF p_audience_id IS NOT NULL THEN
    SELECT regra INTO v_regra FROM mission_audiences WHERE id=p_audience_id AND client_id=p_client_id;
    IF v_regra IS NULL THEN RAISE EXCEPTION 'Lista nao encontrada'; END IF;
  ELSE
    SELECT a.regra,a.id INTO v_regra,v_audience_id FROM mission_audiences a
      WHERE a.client_id=p_client_id AND a.is_default ORDER BY a.created_at LIMIT 1;
    v_regra := coalesce(v_regra,'{"grupos":["coordenador","lider","cabo","voluntario","contratado"]}'::jsonb);
  END IF;

  INSERT INTO engagement_obrigacoes(
    client_id,mission_id,origem,ref_id,nome,cargo,telefone,regiao,cidade,tipo_obrigacao,
    esperado,prazo_em,pontos_possiveis,assigned_at,eligible_from,assignment_source,snapshot_version
  )
  SELECT p_client_id,p_mission_id,r.origem,r.pessoa_id,r.nome,r.cargo,r.telefone,r.regiao,r.cidade,'checkin',
    1,NULL,1,now(),e.eligible_from,'mission_audience_snapshot',2
  FROM mission_audience_resolve(p_client_id,v_regra,v_audience_id) r
  CROSS JOIN LATERAL (
    SELECT greatest(
      public.engagement_entity_created_at(r.origem,r.pessoa_id),
      CASE WHEN v_audience_id IS NOT NULL THEN (
        SELECT mam.created_at FROM mission_audience_members mam
        WHERE mam.audience_id=v_audience_id AND mam.origem=r.origem AND mam.ref_id=r.pessoa_id AND mam.modo='incluido'
      ) ELSE NULL END
    ) eligible_from
  ) e
  WHERE e.eligible_from IS NULL OR e.eligible_from<=coalesce(v_m.publicado_em,v_m.created_at)
  ON CONFLICT(mission_id,origem,ref_id) DO NOTHING;

  SELECT count(*)::integer INTO v_count FROM engagement_obrigacoes
    WHERE mission_id=p_mission_id AND status<>'dispensada';
  UPDATE portal_missions SET audience_id=v_audience_id,audience_snapshotted_at=now(),eligible_count=v_count,updated_at=now()
    WHERE id=p_mission_id;
  RETURN v_count;
END $$;

CREATE OR REPLACE FUNCTION public.mission_checkin_nao_obrigados(
  p_client_id uuid,p_mission_id uuid,p_audience_id uuid DEFAULT NULL
) RETURNS TABLE(participant_id uuid,pessoa_id uuid,nome text,telefone text,cargo text,regiao text,status text,
  primeiro_acesso_em timestamptz,concluido_em timestamptz,clicks integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO public AS $$
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;
  RETURN QUERY SELECT c.participant_id,c.pessoa_id,coalesce(pe.nome,mp.nome,'Sem nome'),
    coalesce(pe.telefone,mp.phone_e164),coalesce(CASE WHEN pe.is_voluntario THEN 'voluntario' ELSE pe.tipo::text END,mp.cargo_snapshot),
    coalesce(pe.regiao::text,pe.cidade,mp.regiao_snapshot),
    CASE WHEN c.concluido_em IS NOT NULL THEN 'cumpriu' WHEN c.primeiro_acesso_em IS NOT NULL THEN 'abriu' ELSE 'nao_abriu' END,
    c.primeiro_acesso_em,c.concluido_em,coalesce(c.clicks,0)
  FROM mission_checkins c LEFT JOIN mission_participants mp ON mp.id=c.participant_id
  LEFT JOIN eleicao_pessoas pe ON pe.id=c.pessoa_id
  WHERE c.client_id=p_client_id AND c.mission_id=p_mission_id
    AND NOT EXISTS(SELECT 1 FROM engagement_obrigacoes o WHERE o.mission_id=p_mission_id AND o.status<>'dispensada' AND
      ((c.pessoa_id IS NOT NULL AND o.origem='eleicao' AND o.ref_id=c.pessoa_id) OR
       (c.funcionario_id IS NOT NULL AND o.origem='funcionario' AND o.ref_id=c.funcionario_id)))
  ORDER BY c.primeiro_acesso_em DESC NULLS LAST;
END $$;

REVOKE ALL ON FUNCTION public.engagement_gerar_obrigacoes(uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.engagement_gerar_obrigacoes(uuid,uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.engagement_eligibility_audit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.engagement_eligibility_audit(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.mission_snapshot_audience(uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mission_snapshot_audience(uuid,uuid,uuid) TO authenticated;
