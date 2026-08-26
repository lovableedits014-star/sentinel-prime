-- Relatório real por várias missões, com filtro recursivo de coordenador/líder avulso.

CREATE OR REPLACE FUNCTION public.engagement_team_roots(p_client_id uuid)
RETURNS TABLE(root_id uuid, nome text, tipo text, is_avulso boolean, pessoas integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO public AS $$
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  RETURN QUERY
  WITH RECURSIVE roots AS (
    SELECT p.id, p.nome, p.tipo::text tipo,
           (p.tipo::text = 'lider' AND p.parent_id IS NULL) avulso
    FROM eleicao_pessoas p
    WHERE p.client_id = p_client_id
      AND (p.tipo::text = 'coordenador' OR (p.tipo::text = 'lider' AND p.parent_id IS NULL))
  ), tree AS (
    SELECT r.id root_id, r.id pessoa_id FROM roots r
    UNION ALL
    SELECT t.root_id, p.id FROM tree t
    JOIN eleicao_pessoas p ON p.parent_id = t.pessoa_id AND p.client_id = p_client_id
  )
  SELECT r.id, r.nome, r.tipo, r.avulso, count(DISTINCT t.pessoa_id)::int
  FROM roots r LEFT JOIN tree t ON t.root_id = r.id
  GROUP BY r.id, r.nome, r.tipo, r.avulso
  ORDER BY r.avulso, r.nome;
END $$;
GRANT EXECUTE ON FUNCTION public.engagement_team_roots(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.engagement_pub_facts_v2(
  p_client_id uuid, p_dias integer DEFAULT 30, p_audience_id uuid DEFAULT NULL,
  p_offset_dias integer DEFAULT 0, p_root_id uuid DEFAULT NULL, p_mission_id uuid DEFAULT NULL
)
RETURNS TABLE(
  mission_id uuid, titulo text, plataforma text, publicado_em timestamptz,
  pessoa_id uuid, origem text, nome text, telefone text, cargo text,
  regiao text, cidade text, is_voluntario boolean, tem_contrato boolean,
  status text, prova text, cumprido_em timestamptz, primeiro_acesso_em timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_ini timestamptz := now() - make_interval(days => coalesce(p_dias,30) + coalesce(p_offset_dias,0));
  v_fim timestamptz := now() - make_interval(days => coalesce(p_offset_dias,0));
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  RETURN QUERY
  WITH RECURSIVE team AS (
    SELECT p.id FROM eleicao_pessoas p
    WHERE p.id = p_root_id AND p.client_id = p_client_id
    UNION ALL
    SELECT p.id FROM eleicao_pessoas p JOIN team t ON p.parent_id = t.id
    WHERE p.client_id = p_client_id
  ), miss AS (
    SELECT m.id, m.title, m.platform, coalesce(m.publicado_em,m.created_at) pub_em,
           coalesce(m.audience_id, p_audience_id,
             (SELECT a.id FROM mission_audiences a WHERE a.client_id=p_client_id AND a.is_default ORDER BY a.created_at LIMIT 1)) aud_id
    FROM portal_missions m
    WHERE m.client_id=p_client_id AND m.archived_at IS NULL
      AND (p_mission_id IS NULL OR m.id=p_mission_id)
      AND coalesce(m.publicado_em,m.created_at) BETWEEN v_ini AND v_fim
  ), resolved AS (
    -- Obrigações são a fotografia histórica prioritária do público da missão.
    SELECT m.id mission_id, o.ref_id pessoa_id, o.origem, o.nome, o.telefone, o.cargo,
           o.regiao, o.cidade, false is_voluntario, (coalesce(ep.valor_contratacao,0)>0) tem_contrato
    FROM miss m JOIN engagement_obrigacoes o ON o.mission_id=m.id AND o.client_id=p_client_id
    LEFT JOIN eleicao_pessoas ep ON o.origem='eleicao' AND ep.id=o.ref_id
    WHERE p_audience_id IS NULL OR m.aud_id=p_audience_id
    UNION ALL
    -- Fallback somente para missões antigas que ainda não possuem obrigações congeladas.
    SELECT m.id, r.pessoa_id, r.origem, r.nome, r.telefone, r.cargo,
           r.regiao, r.cidade, r.is_voluntario, r.tem_contrato
    FROM miss m
    LEFT JOIN mission_audiences a ON a.id=m.aud_id
    CROSS JOIN LATERAL mission_audience_resolve(
      p_client_id,
      coalesce(a.regra,'{"grupos":["coordenador","lider","cabo","voluntario","contratado"]}'::jsonb),
      m.aud_id
    ) r
    WHERE NOT EXISTS (SELECT 1 FROM engagement_obrigacoes o WHERE o.mission_id=m.id)
      AND (p_audience_id IS NULL OR m.aud_id=p_audience_id)
  ), base AS (
    SELECT m.*, r.pessoa_id,r.origem,r.nome,r.telefone,r.cargo,r.regiao,r.cidade,r.is_voluntario,r.tem_contrato
    FROM miss m JOIN resolved r ON r.mission_id=m.id
    WHERE p_root_id IS NULL OR (r.origem='eleicao' AND r.pessoa_id IN (SELECT id FROM team))
  ), ck AS (
    SELECT c.* FROM mission_checkins c WHERE c.client_id=p_client_id AND c.mission_id IN (SELECT id FROM miss)
  ), ob AS (
    SELECT o.mission_id,o.origem,o.ref_id,
      bool_or(o.status='cumprida' AND (
        o.evidencia_nivel='E2' OR (o.evidencia_nivel IN ('E1','E3') AND o.evidencia_validada)
      )) cumprida,
      bool_or(o.evidencia_nivel='E1' AND o.evidencia_validada) e1,
      bool_or(coalesce(o.evidencia_validada,false) AND o.evidencia_nivel='E3') e3,
      max(o.cumprida_em) cumprida_em
    FROM engagement_obrigacoes o WHERE o.client_id=p_client_id AND o.mission_id IN (SELECT id FROM miss)
    GROUP BY 1,2,3
  ), paired AS (
    SELECT b.*,c.primeiro_acesso_em,c.concluido_em,c.participant_id,
           coalesce(o.cumprida,false) ob_cumprida,coalesce(o.e1,false) ob_e1,
           coalesce(o.e3,false) ob_e3,o.cumprida_em ob_em,
           EXISTS(SELECT 1 FROM mission_events e WHERE e.mission_id=b.id AND e.participant_id=c.participant_id
             AND coalesce(e.is_bot,false)=false AND e.event_type::text LIKE 'click_%') clicou
    FROM base b LEFT JOIN ck c ON c.mission_id=b.id AND
      ((b.origem='eleicao' AND c.pessoa_id=b.pessoa_id) OR (b.origem='funcionario' AND c.funcionario_id=b.pessoa_id))
    LEFT JOIN ob o ON o.mission_id=b.id AND o.origem=b.origem AND o.ref_id=b.pessoa_id
  )
  SELECT p.id,p.title,p.platform,p.pub_em,p.pessoa_id,p.origem,p.nome,p.telefone,p.cargo,
    p.regiao,p.cidade,p.is_voluntario,p.tem_contrato,
    CASE WHEN p.concluido_em IS NOT NULL OR p.ob_cumprida OR p.ob_e1 OR p.ob_e3 THEN 'cumpriu'
         WHEN p.primeiro_acesso_em IS NOT NULL OR p.clicou THEN 'abriu' ELSE 'nao_abriu' END,
    CASE WHEN p.ob_e1 THEN 'E1' WHEN p.ob_e3 THEN 'E3'
         WHEN p.concluido_em IS NOT NULL OR p.ob_cumprida THEN 'E2' ELSE NULL END,
    coalesce(p.concluido_em,p.ob_em),p.primeiro_acesso_em FROM paired p;
END $$;
GRANT EXECUTE ON FUNCTION public.engagement_pub_facts_v2(uuid,integer,uuid,integer,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.engagement_pub_kpis_v2(p_client_id uuid,p_dias integer DEFAULT 30,p_audience_id uuid DEFAULT NULL,p_root_id uuid DEFAULT NULL,p_mission_id uuid DEFAULT NULL)
RETURNS TABLE(publicacoes integer,obrigados integer,pares integer,cumprimentos integer,abriu_sem_confirmar integer,nunca_engajaram integer,adesao numeric,e1 integer,e2 integer,e3 integer,publicacoes_ant integer,cumprimentos_ant integer,adesao_ant numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public AS $$
WITH cur AS (SELECT * FROM engagement_pub_facts_v2(p_client_id,p_dias,p_audience_id,0,p_root_id,p_mission_id)),
ant AS (SELECT * FROM engagement_pub_facts_v2(p_client_id,p_dias,p_audience_id,p_dias,p_root_id,NULL)),
c AS (SELECT count(DISTINCT mission_id)::int pubs,count(DISTINCT pessoa_id)::int obrig,count(*)::int pares,count(*) FILTER(WHERE status='cumpriu')::int cump,count(*) FILTER(WHERE status='abriu')::int abriu,count(*) FILTER(WHERE prova='E1')::int e1,count(*) FILTER(WHERE prova='E2')::int e2,count(*) FILTER(WHERE prova='E3')::int e3 FROM cur),
n AS (SELECT count(*)::int n FROM (SELECT pessoa_id FROM cur GROUP BY pessoa_id HAVING count(*) FILTER(WHERE status<>'nao_abriu')=0)x),
a AS (SELECT count(DISTINCT mission_id)::int pubs,count(*)::int pares,count(*) FILTER(WHERE status='cumpriu')::int cump FROM ant)
SELECT c.pubs,c.obrig,c.pares,c.cump,c.abriu,n.n,CASE WHEN c.pares>0 THEN round(c.cump::numeric/c.pares*100,1) ELSE 0 END,c.e1,c.e2,c.e3,a.pubs,a.cump,CASE WHEN a.pares>0 THEN round(a.cump::numeric/a.pares*100,1) ELSE 0 END FROM c,n,a;
$$;

CREATE OR REPLACE FUNCTION public.engagement_publicacoes_desempenho_v2(p_client_id uuid,p_dias integer DEFAULT 30,p_audience_id uuid DEFAULT NULL,p_root_id uuid DEFAULT NULL,p_mission_id uuid DEFAULT NULL)
RETURNS TABLE(mission_id uuid,titulo text,plataforma text,publicado_em timestamptz,obrigados integer,cumpriram integer,abriu_sem_confirmar integer,faltaram integer,e1 integer,e2 integer,e3 integer,adesao numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public AS $$
SELECT f.mission_id,min(f.titulo),min(f.plataforma),min(f.publicado_em),count(*)::int,count(*) FILTER(WHERE status='cumpriu')::int,count(*) FILTER(WHERE status='abriu')::int,count(*) FILTER(WHERE status='nao_abriu')::int,count(*) FILTER(WHERE prova='E1')::int,count(*) FILTER(WHERE prova='E2')::int,count(*) FILTER(WHERE prova='E3')::int,round(count(*) FILTER(WHERE status='cumpriu')::numeric/nullif(count(*),0)*100,1)
FROM engagement_pub_facts_v2(p_client_id,p_dias,p_audience_id,0,p_root_id,p_mission_id) f GROUP BY f.mission_id ORDER BY min(f.publicado_em) DESC;
$$;

CREATE OR REPLACE FUNCTION public.engagement_equipe_desempenho_v2(p_client_id uuid,p_dias integer DEFAULT 30,p_audience_id uuid DEFAULT NULL,p_root_id uuid DEFAULT NULL,p_mission_id uuid DEFAULT NULL)
RETURNS TABLE(pessoa_id uuid,origem text,nome text,telefone text,cargo text,regiao text,cidade text,is_voluntario boolean,tem_contrato boolean,publicacoes integer,cumpridas integer,abriu_sem_confirmar integer,faltas integer,pct numeric,prova_principal text,faixa text,pct_anterior numeric,variacao numeric,ultima_atividade timestamptz,detalhe jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public AS $$
WITH cur AS (SELECT * FROM engagement_pub_facts_v2(p_client_id,p_dias,p_audience_id,0,p_root_id,p_mission_id)), agg AS (
 SELECT f.pessoa_id,f.origem,min(f.nome) nome,min(f.telefone) telefone,min(f.cargo) cargo,min(f.regiao) regiao,min(f.cidade) cidade,bool_or(f.is_voluntario) volunt,bool_or(f.tem_contrato) contrato,count(*)::int pubs,count(*) FILTER(WHERE status='cumpriu')::int cump,count(*) FILTER(WHERE status='abriu')::int abriu,count(*) FILTER(WHERE status='nao_abriu')::int faltas,(array_agg(f.prova ORDER BY f.prova))[1] prova,max(greatest(coalesce(f.cumprido_em,'epoch'),coalesce(f.primeiro_acesso_em,'epoch'))) ult,jsonb_agg(jsonb_build_object('mission_id',f.mission_id,'titulo',f.titulo,'publicado_em',f.publicado_em,'status',f.status,'prova',f.prova) ORDER BY f.publicado_em DESC) detalhe FROM cur f GROUP BY 1,2)
SELECT a.pessoa_id,a.origem,a.nome,a.telefone,a.cargo,a.regiao,a.cidade,a.volunt,a.contrato,a.pubs,a.cump,a.abriu,a.faltas,round(a.cump::numeric/nullif(a.pubs,0)*100,1),a.prova,CASE WHEN a.cump::numeric/a.pubs>=.8 THEN 'excelente' WHEN a.cump::numeric/a.pubs>=.5 THEN 'atencao' WHEN a.cump>0 THEN 'baixo' ELSE 'critico' END,NULL::numeric,NULL::numeric,nullif(a.ult,'epoch'),a.detalhe FROM agg a ORDER BY a.cump::numeric/nullif(a.pubs,0) DESC,a.nome;
$$;

GRANT EXECUTE ON FUNCTION public.engagement_pub_kpis_v2(uuid,integer,uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.engagement_publicacoes_desempenho_v2(uuid,integer,uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.engagement_equipe_desempenho_v2(uuid,integer,uuid,uuid,uuid) TO authenticated;
