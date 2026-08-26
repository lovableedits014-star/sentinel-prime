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
    SELECT f.pessoa_id, f.origem,
           count(*)::int AS tot,
           count(*) FILTER (WHERE f.status = 'cumpriu')::int AS cump
      FROM public.engagement_pub_facts(p_client_id, p_dias, p_audience_id, coalesce(p_dias,30)) f
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
           (array_agg(c.prova ORDER BY c.prova))[1] AS prova_principal,
           jsonb_agg(jsonb_build_object(
             'mission_id', c.mission_id,
             'titulo', c.titulo,
             'publicado_em', c.publicado_em,
             'status', c.status,
             'prova', c.prova
           ) ORDER BY c.publicado_em DESC NULLS LAST) AS detalhe
      FROM cur c
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
         nullif(greatest(coalesce(g.ultimo_cump, 'epoch'::timestamptz), coalesce(g.ultimo_acesso, 'epoch'::timestamptz)), 'epoch'::timestamptz),
         g.detalhe
    FROM agg g
    LEFT JOIN ant a ON a.pessoa_id = g.pessoa_id AND a.origem = g.origem
   ORDER BY (CASE WHEN g.publicacoes > 0 THEN g.cumpridas::numeric / g.publicacoes ELSE 0 END) DESC,
            g.cumpridas DESC, g.nome;
END $function$;