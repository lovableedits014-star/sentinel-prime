-- Remove o produto cartesiano do ranking. O resultado de cada pessoa continua
-- somando seus indicados diretos e, para coordenadores/lideres, os indicados
-- diretos de seus filhos imediatos.

CREATE INDEX IF NOT EXISTS idx_eleicao_pessoas_client_parent
  ON public.eleicao_pessoas(client_id,parent_id);
CREATE INDEX IF NOT EXISTS idx_contratados_client_lider
  ON public.contratados(client_id,lider_id);

CREATE OR REPLACE FUNCTION public.tele_ranking_indicadores_v2(
  _client_id uuid,_campanha_id uuid DEFAULT NULL,_data_de timestamptz DEFAULT NULL,
  _data_ate timestamptz DEFAULT NULL,_universo text DEFAULT 'eleicao'
) RETURNS TABLE(
  pessoa_id uuid,pessoa_nome text,pessoa_tipo text,cidade text,bairro text,
  coordenador_id uuid,coordenador_nome text,filhos_count integer,indicados_diretos integer,
  indicados_total integer,ligados integer,confirmados integer,indecisos integer,rejeitados integer,
  pendentes integer,taxa_conversao numeric,meta integer,ultima_atividade timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $function$
DECLARE v_meta_coord integer:=30;v_meta_lider integer:=30;v_meta_cabo integer:=5;
BEGIN
  IF NOT public.user_can_access_client(_client_id) THEN RAISE EXCEPTION 'Acesso negado';END IF;
  SELECT coalesce(c.meta_coordenador,30),coalesce(c.meta_lider,30),coalesce(c.meta_cabo,5)
  INTO v_meta_coord,v_meta_lider,v_meta_cabo
  FROM public.eleicao_indicacao_config c WHERE c.client_id=_client_id;
  v_meta_coord:=coalesce(v_meta_coord,30);v_meta_lider:=coalesce(v_meta_lider,30);v_meta_cabo:=coalesce(v_meta_cabo,5);

  IF _universo='eleicao' THEN
    RETURN QUERY WITH pessoas AS MATERIALIZED(
      SELECT p.id,p.nome,p.tipo::text tipo,p.cidade,p.bairro,p.parent_id
      FROM public.eleicao_pessoas p WHERE p.client_id=_client_id
    ),direto AS MATERIALIZED(
      SELECT i.indicador_id pid,count(*)::integer qtd,
        count(*)FILTER(WHERE i.ultima_ligacao_em IS NOT NULL OR coalesce(i.total_tentativas,0)>0)::integer trab,
        count(*)FILTER(WHERE i.ultimo_status_ligacao='atendeu')::integer atend,
        count(*)FILTER(WHERE i.vota_candidato='sim')::integer conf,
        count(*)FILTER(WHERE i.vota_candidato='indeciso')::integer ind,
        count(*)FILTER(WHERE i.vota_candidato='nao')::integer rej,max(i.ultima_ligacao_em) ult
      FROM public.eleicao_indicados i
      WHERE i.client_id=_client_id AND i.indicador_id IS NOT NULL
        AND(_campanha_id IS NULL OR i.campanha_id=_campanha_id)
        AND(_data_de IS NULL OR greatest(i.created_at,coalesce(i.ultima_ligacao_em,i.created_at))>=_data_de)
        AND(_data_ate IS NULL OR greatest(i.created_at,coalesce(i.ultima_ligacao_em,i.created_at))<=_data_ate)
      GROUP BY i.indicador_id
    ),escopo AS MATERIALIZED(
      SELECT p.id responsavel_id,p.id membro_id FROM pessoas p
      UNION ALL
      SELECT pai.id,filho.id FROM pessoas pai JOIN pessoas filho ON filho.parent_id=pai.id
    ),roll AS MATERIALIZED(
      SELECT e.responsavel_id pid,coalesce(sum(d.qtd),0)::integer qtd,
        coalesce(sum(d.trab),0)::integer trab,coalesce(sum(d.atend),0)::integer atend,
        coalesce(sum(d.conf),0)::integer conf,coalesce(sum(d.ind),0)::integer ind,
        coalesce(sum(d.rej),0)::integer rej,max(d.ult) ult
      FROM escopo e LEFT JOIN direto d ON d.pid=e.membro_id GROUP BY e.responsavel_id
    ),filhos AS(
      SELECT p.parent_id pid,count(*)::integer qt FROM pessoas p WHERE p.parent_id IS NOT NULL GROUP BY p.parent_id
    )
    SELECT p.id,p.nome,p.tipo,p.cidade,p.bairro,p.parent_id,par.nome,coalesce(f.qt,0),coalesce(d.qtd,0),
      coalesce(r.qtd,0),coalesce(r.trab,0),coalesce(r.conf,0),coalesce(r.ind,0),coalesce(r.rej,0),
      greatest(coalesce(r.qtd,0)-coalesce(r.trab,0),0),
      CASE WHEN coalesce(r.atend,0)>0 THEN round(r.conf::numeric/r.atend*100,1)END,
      CASE WHEN p.tipo='coordenador' THEN v_meta_coord ELSE v_meta_lider END,r.ult
    FROM pessoas p LEFT JOIN pessoas par ON par.id=p.parent_id LEFT JOIN filhos f ON f.pid=p.id
    LEFT JOIN direto d ON d.pid=p.id LEFT JOIN roll r ON r.pid=p.id
    ORDER BY r.conf DESC NULLS LAST,r.trab DESC NULLS LAST,p.nome;
  ELSE
    RETURN QUERY WITH pessoas AS MATERIALIZED(
      SELECT c.id,c.nome,CASE WHEN c.is_lider THEN 'lider' ELSE 'liderado' END tipo,c.cidade,c.bairro,
        c.lider_id parent_id,c.is_lider,coalesce(c.quota_indicados,v_meta_cabo)::integer quota
      FROM public.contratados c WHERE c.client_id=_client_id
    ),direto AS MATERIALIZED(
      SELECT i.contratado_id pid,count(*)::integer qtd,
        count(*)FILTER(WHERE i.ligacao_em IS NOT NULL OR coalesce(i.tentativas_count,0)>0)::integer trab,
        count(*)FILTER(WHERE i.ligacao_status='atendeu')::integer atend,
        count(*)FILTER(WHERE i.vota_candidato='sim')::integer conf,
        count(*)FILTER(WHERE i.vota_candidato='indeciso')::integer ind,
        count(*)FILTER(WHERE i.vota_candidato='nao')::integer rej,max(i.ligacao_em) ult
      FROM public.contratado_indicados i
      WHERE i.client_id=_client_id AND i.contratado_id IS NOT NULL
        AND(_campanha_id IS NULL OR i.campanha_id=_campanha_id)
        AND(_data_de IS NULL OR greatest(i.created_at,coalesce(i.ligacao_em,i.created_at))>=_data_de)
        AND(_data_ate IS NULL OR greatest(i.created_at,coalesce(i.ligacao_em,i.created_at))<=_data_ate)
      GROUP BY i.contratado_id
    ),escopo AS MATERIALIZED(
      SELECT p.id responsavel_id,p.id membro_id FROM pessoas p
      UNION ALL
      SELECT pai.id,filho.id FROM pessoas pai JOIN pessoas filho ON pai.is_lider AND filho.parent_id=pai.id
    ),roll AS MATERIALIZED(
      SELECT e.responsavel_id pid,coalesce(sum(d.qtd),0)::integer qtd,
        coalesce(sum(d.trab),0)::integer trab,coalesce(sum(d.atend),0)::integer atend,
        coalesce(sum(d.conf),0)::integer conf,coalesce(sum(d.ind),0)::integer ind,
        coalesce(sum(d.rej),0)::integer rej,max(d.ult) ult
      FROM escopo e LEFT JOIN direto d ON d.pid=e.membro_id GROUP BY e.responsavel_id
    ),filhos AS(
      SELECT p.parent_id pid,count(*)::integer qt FROM pessoas p WHERE p.parent_id IS NOT NULL GROUP BY p.parent_id
    )
    SELECT p.id,p.nome,p.tipo,p.cidade,p.bairro,p.parent_id,par.nome,coalesce(f.qt,0),coalesce(d.qtd,0),
      coalesce(r.qtd,0),coalesce(r.trab,0),coalesce(r.conf,0),coalesce(r.ind,0),coalesce(r.rej,0),
      greatest(coalesce(r.qtd,0)-coalesce(r.trab,0),0),
      CASE WHEN coalesce(r.atend,0)>0 THEN round(r.conf::numeric/r.atend*100,1)END,
      CASE WHEN p.is_lider THEN v_meta_lider ELSE p.quota END,r.ult
    FROM pessoas p LEFT JOIN pessoas par ON par.id=p.parent_id LEFT JOIN filhos f ON f.pid=p.id
    LEFT JOIN direto d ON d.pid=p.id LEFT JOIN roll r ON r.pid=p.id
    ORDER BY r.conf DESC NULLS LAST,r.trab DESC NULLS LAST,p.nome;
  END IF;
END;$function$;

REVOKE ALL ON FUNCTION public.tele_ranking_indicadores_v2(uuid,uuid,timestamptz,timestamptz,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tele_ranking_indicadores_v2(uuid,uuid,timestamptz,timestamptz,text) TO authenticated;
NOTIFY pgrst,'reload schema';
