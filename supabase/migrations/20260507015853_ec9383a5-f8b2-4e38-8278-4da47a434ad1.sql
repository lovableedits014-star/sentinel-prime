
CREATE OR REPLACE FUNCTION public.get_cobertura_territorial(p_client_id uuid)
RETURNS TABLE(
  bairro text,
  ultima_mencao timestamptz,
  n_falas bigint,
  n_promessas_abertas bigint,
  tom_predominante text,
  dias_silencio integer,
  nivel_alerta text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
WITH expand AS (
  SELECT
    NULLIF(TRIM(b.bairro_obj->>'nome'), '') AS bairro,
    COALESCE(d.data_evento::timestamptz, d.created_at) AS dt,
    d.tom_emocional
  FROM public.ic_knowledge_documents d,
       LATERAL jsonb_array_elements(COALESCE(d.bairros_citados, '[]'::jsonb)) AS b(bairro_obj)
  WHERE d.client_id = p_client_id
    AND public.user_has_client_access(p_client_id, auth.uid())
),
agg AS (
  SELECT
    bairro,
    MAX(dt) AS ultima_mencao,
    COUNT(*)::bigint AS n_falas,
    MODE() WITHIN GROUP (ORDER BY tom_emocional) AS tom_predominante
  FROM expand
  WHERE bairro IS NOT NULL
  GROUP BY bairro
),
prom AS (
  SELECT bairro, COUNT(*)::bigint AS n_open
  FROM public.ic_promessas
  WHERE client_id = p_client_id
    AND status IN ('aberta','em_andamento')
    AND bairro IS NOT NULL
  GROUP BY bairro
)
SELECT
  a.bairro,
  a.ultima_mencao,
  a.n_falas,
  COALESCE(p.n_open, 0) AS n_promessas_abertas,
  a.tom_predominante,
  EXTRACT(DAY FROM (now() - a.ultima_mencao))::integer AS dias_silencio,
  CASE
    WHEN EXTRACT(DAY FROM (now() - a.ultima_mencao)) > 60 THEN 'silenciado'
    WHEN EXTRACT(DAY FROM (now() - a.ultima_mencao)) > 30 THEN 'atencao'
    ELSE 'ok'
  END AS nivel_alerta
FROM agg a
LEFT JOIN prom p ON p.bairro = a.bairro
ORDER BY a.ultima_mencao ASC NULLS FIRST;
$$;
