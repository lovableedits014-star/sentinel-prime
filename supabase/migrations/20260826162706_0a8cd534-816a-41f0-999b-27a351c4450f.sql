-- Base unificada de fatos: publicação x pessoa obrigada, com prova de cumprimento
CREATE OR REPLACE FUNCTION public.engagement_pub_facts(
  p_client_id uuid,
  p_dias integer DEFAULT 30,
  p_audience_id uuid DEFAULT NULL,
  p_offset_dias integer DEFAULT 0
)
RETURNS TABLE(
  mission_id uuid, titulo text, plataforma text, publicado_em timestamptz,
  pessoa_id uuid, origem text, nome text, telefone text, cargo text,
  regiao text, cidade text, is_voluntario boolean, tem_contrato boolean,
  status text, prova text, cumprido_em timestamptz, primeiro_acesso_em timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_regra jsonb;
  v_ini timestamptz := now() - make_interval(days => (coalesce(p_dias,30) + coalesce(p_offset_dias,0)));
  v_fim timestamptz := now() - make_interval(days => coalesce(p_offset_dias,0));
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;

  IF p_audience_id IS NOT NULL THEN
    SELECT a.regra INTO v_regra FROM mission_audiences a
     WHERE a.id = p_audience_id AND a.client_id = p_client_id;
    IF v_regra IS NULL THEN RAISE EXCEPTION 'Lista não encontrada'; END IF;
  ELSE
    SELECT a.regra INTO v_regra FROM mission_audiences a
     WHERE a.client_id = p_client_id AND coalesce(a.is_default,false)
     ORDER BY a.created_at LIMIT 1;
    IF v_regra IS NULL THEN
      v_regra := jsonb_build_object('grupos', '["coordenador","lider","cabo","voluntario","contratado"]'::jsonb);
    END IF;
  END IF;

  RETURN QUERY
  WITH miss AS (
    SELECT m.id, m.title, m.platform, coalesce(m.publicado_em, m.created_at) AS pub_em
      FROM portal_missions m
     WHERE m.client_id = p_client_id
       AND m.archived_at IS NULL
       AND coalesce(m.publicado_em, m.created_at) >= v_ini
       AND coalesce(m.publicado_em, m.created_at) <= v_fim
  ), base AS (
    SELECT * FROM public.mission_audience_resolve(p_client_id, v_regra, p_audience_id)
  ), ck AS (
    SELECT c.mission_id, c.pessoa_id, c.funcionario_id, c.participant_id,
           c.primeiro_acesso_em, c.concluido_em
      FROM mission_checkins c
     WHERE c.client_id = p_client_id
       AND c.mission_id IN (SELECT id FROM miss)
  ), ob AS (
    SELECT o.mission_id, o.origem, o.ref_id,
           bool_or(o.status = 'cumprida') AS cumprida,
           bool_or(o.evidencia_nivel = 'E1') AS e1,
           bool_or(coalesce(o.evidencia_validada,false)) AS e3,
           max(o.cumprida_em) AS cumprida_em
      FROM engagement_obrigacoes o
     WHERE o.client_id = p_client_id
       AND o.mission_id IN (SELECT id FROM miss)
     GROUP BY 1,2,3
  ), pair AS (
    SELECT m.id AS mission_id, m.title, m.platform, m.pub_em,
           b.pessoa_id, b.origem, b.nome, b.telefone, b.cargo, b.regiao, b.cidade,
           b.is_voluntario, b.tem_contrato,
           k.primeiro_acesso_em, k.concluido_em, k.participant_id,
           o.cumprida AS ob_cumprida, o.e1 AS ob_e1, o.e3 AS ob_e3, o.cumprida_em AS ob_em
      FROM miss m
      CROSS JOIN base b
      LEFT JOIN ck k
        ON k.mission_id = m.id
       AND ((b.origem = 'eleicao' AND k.pessoa_id = b.pessoa_id)
         OR (b.origem = 'funcionario' AND k.funcionario_id = b.pessoa_id))
      LEFT JOIN ob o
        ON o.mission_id = m.id AND o.origem = b.origem AND o.ref_id = b.pessoa_id
  ), enr AS (
    SELECT p.*,
           (p.participant_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM mission_events e
               WHERE e.mission_id = p.mission_id
                 AND e.participant_id = p.participant_id
                 AND coalesce(e.is_bot,false) = false
                 AND e.event_type IN ('click_facebook','click_instagram')
           )) AS click_rede
      FROM pair p
  )
  SELECT e.mission_id, e.title, e.platform, e.pub_em,
         e.pessoa_id, e.origem, e.nome, e.telefone, e.cargo, e.regiao, e.cidade,
         e.is_voluntario, e.tem_contrato,
         CASE
           WHEN e.click_rede OR coalesce(e.ob_cumprida,false) OR e.concluido_em IS NOT NULL THEN 'cumpriu'
           WHEN e.primeiro_acesso_em IS NOT NULL THEN 'abriu'
           ELSE 'nao_abriu'
         END,
         CASE
           WHEN e.click_rede OR coalesce(e.ob_e1,false) THEN 'E1'
           WHEN coalesce(e.ob_e3,false) THEN 'E3'
           WHEN e.concluido_em IS NOT NULL OR coalesce(e.ob_cumprida,false) THEN 'E2'
           ELSE NULL
         END,
         coalesce(e.concluido_em, e.ob_em),
         e.primeiro_acesso_em
    FROM enr e;
END $function$;

GRANT EXECUTE ON FUNCTION public.engagement_pub_facts(uuid,integer,uuid,integer) TO authenticated;

-- KPIs do período com comparação ao período anterior
CREATE OR REPLACE FUNCTION public.engagement_pub_kpis(
  p_client_id uuid, p_dias integer DEFAULT 30, p_audience_id uuid DEFAULT NULL
)
RETURNS TABLE(
  publicacoes integer, obrigados integer, pares integer, cumprimentos integer,
  abriu_sem_confirmar integer, nunca_engajaram integer, adesao numeric,
  e1 integer, e2 integer, e3 integer,
  publicacoes_ant integer, cumprimentos_ant integer, adesao_ant numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;

  RETURN QUERY
  WITH cur AS (
    SELECT * FROM public.engagement_pub_facts(p_client_id, p_dias, p_audience_id, 0)
  ), ant AS (
    SELECT * FROM public.engagement_pub_facts(p_client_id, p_dias, p_audience_id, coalesce(p_dias,30))
  ), c AS (
    SELECT
      count(DISTINCT mission_id)::int AS publicacoes,
      count(DISTINCT pessoa_id)::int AS obrigados,
      count(*)::int AS pares,
      count(*) FILTER (WHERE status = 'cumpriu')::int AS cumprimentos,
      count(*) FILTER (WHERE status = 'abriu')::int AS abriu,
      count(*) FILTER (WHERE prova = 'E1')::int AS e1,
      count(*) FILTER (WHERE prova = 'E2')::int AS e2,
      count(*) FILTER (WHERE prova = 'E3')::int AS e3
    FROM cur
  ), nunca AS (
    SELECT count(*)::int AS n FROM (
      SELECT pessoa_id FROM cur GROUP BY pessoa_id
       HAVING count(*) FILTER (WHERE status <> 'nao_abriu') = 0
    ) x
  ), a AS (
    SELECT count(DISTINCT mission_id)::int AS publicacoes,
           count(*)::int AS pares,
           count(*) FILTER (WHERE status = 'cumpriu')::int AS cumprimentos
      FROM ant
  )
  SELECT c.publicacoes, c.obrigados, c.pares, c.cumprimentos, c.abriu, nunca.n,
         CASE WHEN c.pares > 0 THEN round((c.cumprimentos::numeric / c.pares) * 100, 1) ELSE 0 END,
         c.e1, c.e2, c.e3,
         a.publicacoes, a.cumprimentos,
         CASE WHEN a.pares > 0 THEN round((a.cumprimentos::numeric / a.pares) * 100, 1) ELSE 0 END
    FROM c, nunca, a;
END $function$;

GRANT EXECUTE ON FUNCTION public.engagement_pub_kpis(uuid,integer,uuid) TO authenticated;

-- Desempenho por publicação
CREATE OR REPLACE FUNCTION public.engagement_publicacoes_desempenho(
  p_client_id uuid, p_dias integer DEFAULT 30, p_audience_id uuid DEFAULT NULL
)
RETURNS TABLE(
  mission_id uuid, titulo text, plataforma text, publicado_em timestamptz,
  obrigados integer, cumpriram integer, abriu_sem_confirmar integer, faltaram integer,
  e1 integer, e2 integer, e3 integer, adesao numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;

  RETURN QUERY
  SELECT f.mission_id, f.titulo, f.plataforma, f.publicado_em,
         count(*)::int,
         count(*) FILTER (WHERE f.status = 'cumpriu')::int,
         count(*) FILTER (WHERE f.status = 'abriu')::int,
         count(*) FILTER (WHERE f.status = 'nao_abriu')::int,
         count(*) FILTER (WHERE f.prova = 'E1')::int,
         count(*) FILTER (WHERE f.prova = 'E2')::int,
         count(*) FILTER (WHERE f.prova = 'E3')::int,
         CASE WHEN count(*) > 0
           THEN round((count(*) FILTER (WHERE f.status = 'cumpriu')::numeric / count(*)) * 100, 1)
           ELSE 0 END
    FROM public.engagement_pub_facts(p_client_id, p_dias, p_audience_id, 0) f
   GROUP BY 1,2,3,4
   ORDER BY 4 DESC NULLS LAST;
END $function$;

GRANT EXECUTE ON FUNCTION public.engagement_publicacoes_desempenho(uuid,integer,uuid) TO authenticated;

-- Desempenho por pessoa (ranking + matriz)
CREATE OR REPLACE FUNCTION public.engagement_equipe_desempenho(
  p_client_id uuid, p_dias integer DEFAULT 30, p_audience_id uuid DEFAULT NULL
)
RETURNS TABLE(
  pessoa_id uuid, origem text, nome text, telefone text, cargo text,
  regiao text, cidade text, is_voluntario boolean, tem_contrato boolean,
  publicacoes integer, cumpridas integer, abriu_sem_confirmar integer, faltas integer,
  pct numeric, prova_principal text, faixa text,
  pct_anterior numeric, variacao numeric, ultima_atividade timestamptz,
  detalhe jsonb
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;

  RETURN QUERY
  WITH cur AS (
    SELECT * FROM public.engagement_pub_facts(p_client_id, p_dias, p_audience_id, 0)
  ), ant AS (
    SELECT pessoa_id, origem,
           count(*)::int AS tot,
           count(*) FILTER (WHERE status = 'cumpriu')::int AS cump
      FROM public.engagement_pub_facts(p_client_id, p_dias, p_audience_id, coalesce(p_dias,30))
     GROUP BY 1,2
  ), agg AS (
    SELECT c.pessoa_id, c.origem,
           min(c.nome) AS nome, min(c.telefone) AS telefone, min(c.cargo) AS cargo,
           min(c.regiao) AS regiao, min(c.cidade) AS cidade,
           bool_or(c.is_voluntario) AS is_voluntario, bool_or(c.tem_contrato) AS tem_contrato,
           count(*)::int AS publicacoes,
           count(*) FILTER (WHERE c.status = 'cumpriu')::int AS cumpridas,
           count(*) FILTER (WHERE c.status = 'abriu')::int AS abriu,
           count(*) FILTER (WHERE c.status = 'nao_abriu')::int AS faltas,
           max(c.cumprido_em) AS ultimo_cump,
           max(c.primeiro_acesso_em) AS ultimo_acesso,
           mode() FILTER (WHERE c.prova IS NOT NULL) OVER () AS dummy,
           jsonb_agg(jsonb_build_object(
             'mission_id', c.mission_id,
             'titulo', c.titulo,
             'publicado_em', c.pub_ord,
             'status', c.status,
             'prova', c.prova
           ) ORDER BY c.pub_ord DESC NULLS LAST) AS detalhe,
           (array_agg(c.prova ORDER BY c.prova))[1] AS prova_principal
      FROM (SELECT cc.*, cc.publicado_em AS pub_ord FROM cur cc) c
     GROUP BY c.pessoa_id, c.origem
  )
  SELECT g.pessoa_id, g.origem, g.nome, g.telefone, g.cargo, g.regiao, g.cidade,
         g.is_voluntario, g.tem_contrato,
         g.publicacoes, g.cumpridas, g.abriu, g.faltas,
         CASE WHEN g.publicacoes > 0 THEN round((g.cumpridas::numeric / g.publicacoes) * 100, 1) ELSE 0 END,
         g.prova_principal,
         CASE
           WHEN g.publicacoes = 0 THEN 'critico'
           WHEN (g.cumpridas::numeric / g.publicacoes) >= 0.8 THEN 'excelente'
           WHEN (g.cumpridas::numeric / g.publicacoes) >= 0.5 THEN 'atencao'
           WHEN (g.cumpridas::numeric / g.publicacoes) > 0 THEN 'baixo'
           ELSE 'critico'
         END,
         CASE WHEN coalesce(a.tot,0) > 0 THEN round((a.cump::numeric / a.tot) * 100, 1) ELSE NULL END,
         CASE WHEN coalesce(a.tot,0) > 0 AND g.publicacoes > 0
           THEN round(((g.cumpridas::numeric / g.publicacoes) - (a.cump::numeric / a.tot)) * 100, 1)
           ELSE NULL END,
         greatest(coalesce(g.ultimo_cump, 'epoch'::timestamptz), coalesce(g.ultimo_acesso, 'epoch'::timestamptz)),
         g.detalhe
    FROM agg g
    LEFT JOIN ant a ON a.pessoa_id = g.pessoa_id AND a.origem = g.origem
   ORDER BY (CASE WHEN g.publicacoes > 0 THEN g.cumpridas::numeric / g.publicacoes ELSE 0 END) DESC,
            g.cumpridas DESC, g.nome;
END $function$;

GRANT EXECUTE ON FUNCTION public.engagement_equipe_desempenho(uuid,integer,uuid) TO authenticated;

-- Quem faltou em uma publicação (para cobrança)
CREATE OR REPLACE FUNCTION public.engagement_publicacao_faltantes(
  p_client_id uuid, p_mission_id uuid, p_audience_id uuid DEFAULT NULL, p_dias integer DEFAULT 3650
)
RETURNS TABLE(
  pessoa_id uuid, origem text, nome text, telefone text, cargo text,
  regiao text, cidade text, status text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;

  RETURN QUERY
  SELECT f.pessoa_id, f.origem, f.nome, f.telefone, f.cargo, f.regiao, f.cidade, f.status
    FROM public.engagement_pub_facts(p_client_id, p_dias, p_audience_id, 0) f
   WHERE f.mission_id = p_mission_id AND f.status <> 'cumpriu'
   ORDER BY f.status, f.nome;
END $function$;

GRANT EXECUTE ON FUNCTION public.engagement_publicacao_faltantes(uuid,uuid,uuid,integer) TO authenticated;