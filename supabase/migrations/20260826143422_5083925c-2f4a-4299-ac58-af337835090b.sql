CREATE TABLE IF NOT EXISTS public.mission_audiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  nome text NOT NULL,
  descricao text,
  regra jsonb NOT NULL DEFAULT '{"grupos":[],"regioes":[],"indicadores":[],"escopos":[]}'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_audiences TO authenticated;
GRANT ALL ON public.mission_audiences TO service_role;
ALTER TABLE public.mission_audiences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members manage mission audiences"
ON public.mission_audiences FOR ALL TO authenticated
USING (public.is_client_member(client_id))
WITH CHECK (public.is_client_member(client_id));

CREATE TABLE IF NOT EXISTS public.mission_audience_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  audience_id uuid NOT NULL REFERENCES public.mission_audiences(id) ON DELETE CASCADE,
  origem text NOT NULL DEFAULT 'eleicao',
  ref_id uuid NOT NULL,
  modo text NOT NULL DEFAULT 'incluido',
  motivo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (audience_id, origem, ref_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_audience_members TO authenticated;
GRANT ALL ON public.mission_audience_members TO service_role;
ALTER TABLE public.mission_audience_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members manage mission audience members"
ON public.mission_audience_members FOR ALL TO authenticated
USING (public.is_client_member(client_id))
WITH CHECK (public.is_client_member(client_id));

CREATE INDEX IF NOT EXISTS idx_mission_audiences_client ON public.mission_audiences(client_id);
CREATE INDEX IF NOT EXISTS idx_mission_audience_members_aud ON public.mission_audience_members(audience_id, modo);

CREATE TRIGGER trg_mission_audiences_updated
BEFORE UPDATE ON public.mission_audiences
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_mission_audience_members_updated
BEFORE UPDATE ON public.mission_audience_members
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.portal_missions
  ADD COLUMN IF NOT EXISTS audience_id uuid REFERENCES public.mission_audiences(id) ON DELETE SET NULL;

-- Resolve members of an audience rule (or an ad-hoc rule) into people
CREATE OR REPLACE FUNCTION public.mission_audience_resolve(
  p_client_id uuid,
  p_regra jsonb,
  p_audience_id uuid DEFAULT NULL
)
RETURNS TABLE(
  pessoa_id uuid, origem text, nome text, telefone text, cargo text,
  regiao text, cidade text, is_voluntario boolean, tem_contrato boolean,
  indicador_nome text, indicador_id uuid, escopo text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_grupos text[] := coalesce((SELECT array_agg(x::text) FROM jsonb_array_elements_text(coalesce(p_regra->'grupos','[]'::jsonb)) x), ARRAY[]::text[]);
  v_regioes text[] := coalesce((SELECT array_agg(x::text) FROM jsonb_array_elements_text(coalesce(p_regra->'regioes','[]'::jsonb)) x), ARRAY[]::text[]);
  v_indic uuid[] := coalesce((SELECT array_agg(x::uuid) FROM jsonb_array_elements_text(coalesce(p_regra->'indicadores','[]'::jsonb)) x), ARRAY[]::uuid[]);
  v_escopos text[] := coalesce((SELECT array_agg(x::text) FROM jsonb_array_elements_text(coalesce(p_regra->'escopos','[]'::jsonb)) x), ARRAY[]::text[]);
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;

  RETURN QUERY
  WITH ep AS (
    SELECT p.id, 'eleicao'::text AS origem, p.nome, p.telefone,
           CASE WHEN p.is_voluntario THEN 'voluntario' ELSE p.tipo::text END AS cargo,
           coalesce(p.regiao, p.cidade) AS regiao, p.cidade,
           coalesce(p.is_voluntario, false) AS is_voluntario,
           (coalesce(p.valor_contratacao, 0) > 0
             AND (p.vigencia_inicio IS NULL OR p.vigencia_inicio <= current_date)
             AND (p.vigencia_fim IS NULL OR p.vigencia_fim >= current_date)) AS tem_contrato,
           p.parent_id,
           p.escopo::text AS escopo,
           p.tipo::text AS tipo
      FROM eleicao_pessoas p
     WHERE p.client_id = p_client_id
  ), auto AS (
    SELECT e.id, e.origem, e.nome, e.telefone, e.cargo, e.regiao, e.cidade,
           e.is_voluntario, e.tem_contrato, e.parent_id, e.escopo
      FROM ep e
     WHERE (
             e.tipo = ANY(v_grupos)
             OR (e.is_voluntario AND 'voluntario' = ANY(v_grupos))
             OR (e.tem_contrato AND 'contratado' = ANY(v_grupos))
           )
       AND (cardinality(v_regioes) = 0 OR coalesce(e.regiao, '') = ANY(v_regioes))
       AND (cardinality(v_indic) = 0 OR e.parent_id = ANY(v_indic))
       AND (cardinality(v_escopos) = 0 OR e.escopo = ANY(v_escopos))
    UNION
    SELECT e.id, e.origem, e.nome, e.telefone, e.cargo, e.regiao, e.cidade,
           e.is_voluntario, e.tem_contrato, e.parent_id, e.escopo
      FROM ep e
     WHERE p_audience_id IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM mission_audience_members m
          WHERE m.audience_id = p_audience_id AND m.modo = 'incluido'
            AND m.origem = 'eleicao' AND m.ref_id = e.id
       )
    UNION
    SELECT f.id, 'funcionario', f.nome, f.telefone, 'funcionario',
           f.cidade, f.cidade, false, true, NULL::uuid, NULL::text
      FROM funcionarios f
     WHERE f.client_id = p_client_id
       AND (
         'funcionario' = ANY(v_grupos)
         OR (p_audience_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM mission_audience_members m
               WHERE m.audience_id = p_audience_id AND m.modo = 'incluido'
                 AND m.origem = 'funcionario' AND m.ref_id = f.id))
       )
  )
  SELECT a.id, a.origem, a.nome, a.telefone, a.cargo, a.regiao, a.cidade,
         a.is_voluntario, a.tem_contrato,
         (SELECT pai.nome FROM eleicao_pessoas pai WHERE pai.id = a.parent_id),
         a.parent_id, a.escopo
    FROM auto a
   WHERE p_audience_id IS NULL OR NOT EXISTS (
     SELECT 1 FROM mission_audience_members m
      WHERE m.audience_id = p_audience_id AND m.modo = 'dispensado'
        AND m.origem = a.origem AND m.ref_id = a.id
   )
   ORDER BY 3;
END $$;

GRANT EXECUTE ON FUNCTION public.mission_audience_resolve(uuid, jsonb, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mission_audience_preview(p_client_id uuid, p_regra jsonb, p_audience_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'total', count(*),
    'contratados', count(*) FILTER (WHERE tem_contrato),
    'voluntarios', count(*) FILTER (WHERE is_voluntario),
    'sem_telefone', count(*) FILTER (WHERE telefone IS NULL OR length(regexp_replace(telefone, '\D', '', 'g')) < 10),
    'por_cargo', coalesce((
      SELECT jsonb_object_agg(cargo, c) FROM (
        SELECT cargo, count(*) AS c
          FROM public.mission_audience_resolve(p_client_id, p_regra, p_audience_id)
         GROUP BY cargo
      ) s
    ), '{}'::jsonb)
  )
  FROM public.mission_audience_resolve(p_client_id, p_regra, p_audience_id);
$$;

GRANT EXECUTE ON FUNCTION public.mission_audience_preview(uuid, jsonb, uuid) TO authenticated;

-- Dashboard scoped to an audience list
CREATE OR REPLACE FUNCTION public.mission_checkin_dashboard_v2(
  p_client_id uuid,
  p_mission_id uuid,
  p_audience_id uuid DEFAULT NULL,
  p_incluir_sem_valor boolean DEFAULT true,
  p_incluir_funcionarios boolean DEFAULT false
)
RETURNS TABLE(
  pessoa_id uuid, origem text, nome text, telefone text, cargo text,
  regiao text, cidade text, is_voluntario boolean, tem_contrato boolean,
  indicador_nome text, indicador_id uuid, status text,
  primeiro_acesso_em timestamptz, concluido_em timestamptz, clicks integer,
  tem_cadastro boolean, links_clicados text[],
  missoes_cobradas integer, missoes_cumpridas integer, pct_cumprimento integer,
  ultimas_missoes jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_regra jsonb;
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;

  IF p_audience_id IS NOT NULL THEN
    SELECT a.regra INTO v_regra FROM mission_audiences a
     WHERE a.id = p_audience_id AND a.client_id = p_client_id;
    IF v_regra IS NULL THEN RAISE EXCEPTION 'Lista não encontrada'; END IF;
  ELSE
    v_regra := jsonb_build_object(
      'grupos',
      CASE WHEN p_incluir_sem_valor
        THEN CASE WHEN p_incluir_funcionarios
               THEN '["coordenador","lider","cabo","voluntario","contratado","funcionario"]'::jsonb
               ELSE '["coordenador","lider","cabo","voluntario","contratado"]'::jsonb END
        ELSE CASE WHEN p_incluir_funcionarios
               THEN '["voluntario","contratado","funcionario"]'::jsonb
               ELSE '["voluntario","contratado"]'::jsonb END
      END
    );
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT * FROM public.mission_audience_resolve(p_client_id, v_regra, p_audience_id)
  ), ck AS (
    SELECT c.pessoa_id, c.funcionario_id, c.participant_id,
           c.primeiro_acesso_em, c.concluido_em, c.clicks
      FROM mission_checkins c
     WHERE c.client_id = p_client_id AND c.mission_id = p_mission_id
  ), hist AS (
    SELECT h.pessoa_id,
           count(*)::int AS total,
           count(*) FILTER (WHERE h.concluido_em IS NOT NULL)::int AS cumpridas,
           jsonb_agg(jsonb_build_object(
             'mission_id', h.mission_id,
             'cumpriu', h.concluido_em IS NOT NULL,
             'em', coalesce(h.concluido_em, h.primeiro_acesso_em)
           ) ORDER BY coalesce(h.concluido_em, h.primeiro_acesso_em) DESC) AS trilha
      FROM mission_checkins h
     WHERE h.client_id = p_client_id AND h.pessoa_id IS NOT NULL
     GROUP BY h.pessoa_id
  )
  SELECT b.pessoa_id, b.origem, b.nome, b.telefone, b.cargo, b.regiao, b.cidade,
         b.is_voluntario, b.tem_contrato, b.indicador_nome, b.indicador_id,
         CASE
           WHEN k.concluido_em IS NOT NULL THEN 'cumpriu'
           WHEN k.primeiro_acesso_em IS NOT NULL THEN 'abriu'
           ELSE 'nao_abriu'
         END,
         k.primeiro_acesso_em, k.concluido_em, coalesce(k.clicks, 0),
         true,
         coalesce((
           SELECT array_agg(DISTINCT l.label)
             FROM mission_events e
             JOIN portal_mission_links l ON l.id = e.mission_link_id
            WHERE e.mission_id = p_mission_id AND e.participant_id = k.participant_id
         ), ARRAY[]::text[]),
         coalesce(hh.total, 0), coalesce(hh.cumpridas, 0),
         CASE WHEN coalesce(hh.total, 0) > 0
           THEN round((hh.cumpridas::numeric / hh.total) * 100)::int ELSE 0 END,
         coalesce(hh.trilha, '[]'::jsonb)
    FROM base b
    LEFT JOIN ck k
      ON (b.origem = 'eleicao' AND k.pessoa_id = b.pessoa_id)
      OR (b.origem = 'funcionario' AND k.funcionario_id = b.pessoa_id)
    LEFT JOIN hist hh ON b.origem = 'eleicao' AND hh.pessoa_id = b.pessoa_id
   ORDER BY b.nome;
END $$;

GRANT EXECUTE ON FUNCTION public.mission_checkin_dashboard_v2(uuid, uuid, uuid, boolean, boolean) TO authenticated;

-- Who entered the link but is not in the audience list
CREATE OR REPLACE FUNCTION public.mission_checkin_nao_obrigados(
  p_client_id uuid,
  p_mission_id uuid,
  p_audience_id uuid DEFAULT NULL
)
RETURNS TABLE(
  participant_id uuid, pessoa_id uuid, nome text, telefone text,
  cargo text, regiao text, status text,
  primeiro_acesso_em timestamptz, concluido_em timestamptz, clicks integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_regra jsonb := '{"grupos":[]}'::jsonb;
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;

  IF p_audience_id IS NOT NULL THEN
    SELECT a.regra INTO v_regra FROM mission_audiences a
     WHERE a.id = p_audience_id AND a.client_id = p_client_id;
  END IF;

  RETURN QUERY
  WITH obrig AS (
    SELECT r.pessoa_id, r.origem
      FROM public.mission_audience_resolve(p_client_id, coalesce(v_regra, '{"grupos":[]}'::jsonb), p_audience_id) r
  )
  SELECT c.participant_id, c.pessoa_id,
         coalesce(pe.nome, mp.nome, 'Sem nome'),
         coalesce(pe.telefone, mp.phone_e164),
         coalesce(CASE WHEN pe.is_voluntario THEN 'voluntario' ELSE pe.tipo::text END, mp.cargo_snapshot),
         coalesce(pe.regiao, pe.cidade, mp.regiao_snapshot),
         CASE WHEN c.concluido_em IS NOT NULL THEN 'cumpriu'
              WHEN c.primeiro_acesso_em IS NOT NULL THEN 'abriu' ELSE 'nao_abriu' END,
         c.primeiro_acesso_em, c.concluido_em, coalesce(c.clicks, 0)
    FROM mission_checkins c
    LEFT JOIN mission_participants mp ON mp.id = c.participant_id
    LEFT JOIN eleicao_pessoas pe ON pe.id = c.pessoa_id
   WHERE c.client_id = p_client_id AND c.mission_id = p_mission_id
     AND NOT EXISTS (
       SELECT 1 FROM obrig o
        WHERE (c.pessoa_id IS NOT NULL AND o.origem = 'eleicao' AND o.pessoa_id = c.pessoa_id)
           OR (c.funcionario_id IS NOT NULL AND o.origem = 'funcionario' AND o.pessoa_id = c.funcionario_id)
     )
   ORDER BY c.primeiro_acesso_em DESC NULLS LAST;
END $$;

GRANT EXECUTE ON FUNCTION public.mission_checkin_nao_obrigados(uuid, uuid, uuid) TO authenticated;