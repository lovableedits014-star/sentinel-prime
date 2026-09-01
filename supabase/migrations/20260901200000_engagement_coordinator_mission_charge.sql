-- Resumo acionavel por coordenador e por missao. A equipe e resolvida pela
-- arvore de parent_id, e o resultado vem da mesma fonte canonica da central.

CREATE OR REPLACE FUNCTION public.engagement_coordinator_mission_charge(
  p_client_id uuid,
  p_mission_id uuid
)
RETURNS TABLE(
  coordenador_id uuid,
  coordenador_nome text,
  coordenador_telefone text,
  total_lideres integer,
  concluidos integer,
  abriu_sem_concluir integer,
  nao_abriu integer,
  taxa numeric,
  concluidos_nomes jsonb,
  abriu_nomes jsonb,
  nao_abriu_nomes jsonb
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path=public
AS $function$
  WITH RECURSIVE coordenadores AS MATERIALIZED (
    SELECT p.id,p.nome,p.telefone
    FROM eleicao_pessoas p
    WHERE p.client_id=p_client_id
      AND p.tipo::text='coordenador'
      AND p.arquivado_em IS NULL
      AND (p.vigencia_inicio IS NULL OR p.vigencia_inicio<=current_date)
      AND (p.vigencia_fim IS NULL OR p.vigencia_fim>=current_date)
  ), arvore AS MATERIALIZED (
    SELECT c.id coordenador_id,c.id pessoa_id,ARRAY[c.id] caminho
    FROM coordenadores c
    UNION ALL
    SELECT a.coordenador_id,p.id,a.caminho||p.id
    FROM arvore a
    JOIN eleicao_pessoas p ON p.parent_id=a.pessoa_id AND p.client_id=p_client_id
    WHERE p.arquivado_em IS NULL AND NOT p.id=ANY(a.caminho)
      AND (p.vigencia_inicio IS NULL OR p.vigencia_inicio<=current_date)
      AND (p.vigencia_fim IS NULL OR p.vigencia_fim>=current_date)
  ), facts_raw AS MATERIALIZED (
    SELECT *
    FROM public.engagement_pub_facts_v2(p_client_id,3650,NULL,0,NULL,p_mission_id)
  ), facts AS MATERIALIZED (
    SELECT DISTINCT ON(f.origem,f.pessoa_id) f.*
    FROM facts_raw f
    WHERE f.origem IN('eleicao','eleicao_pessoas')
    ORDER BY f.origem,f.pessoa_id,
      CASE f.status WHEN 'cumpriu' THEN 0 WHEN 'abriu' THEN 1 ELSE 2 END,
      f.cumprido_em DESC NULLS LAST
  ), equipes AS MATERIALIZED (
    SELECT a.coordenador_id,f.pessoa_id,f.nome,f.status
    FROM arvore a
    JOIN facts f ON f.pessoa_id=a.pessoa_id
    WHERE a.pessoa_id<>a.coordenador_id
  )
  SELECT c.id,c.nome,c.telefone,
    count(e.pessoa_id)::integer,
    count(*) FILTER(WHERE e.status='cumpriu')::integer,
    count(*) FILTER(WHERE e.status='abriu')::integer,
    count(*) FILTER(WHERE e.status='nao_abriu')::integer,
    CASE WHEN count(e.pessoa_id)>0
      THEN round(100.0*count(*) FILTER(WHERE e.status='cumpriu')/count(e.pessoa_id),1)
      ELSE 0 END,
    coalesce(jsonb_agg(e.nome ORDER BY e.nome) FILTER(WHERE e.status='cumpriu'),'[]'::jsonb),
    coalesce(jsonb_agg(e.nome ORDER BY e.nome) FILTER(WHERE e.status='abriu'),'[]'::jsonb),
    coalesce(jsonb_agg(e.nome ORDER BY e.nome) FILTER(WHERE e.status='nao_abriu'),'[]'::jsonb)
  FROM coordenadores c
  LEFT JOIN equipes e ON e.coordenador_id=c.id
  GROUP BY c.id,c.nome,c.telefone
  HAVING count(e.pessoa_id)>0
  ORDER BY count(*) FILTER(WHERE e.status<>'cumpriu') DESC,c.nome;
$function$;

REVOKE ALL ON FUNCTION public.engagement_coordinator_mission_charge(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.engagement_coordinator_mission_charge(uuid,uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
