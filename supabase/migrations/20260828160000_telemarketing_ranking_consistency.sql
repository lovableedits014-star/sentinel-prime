-- Ranking v2: periodo por atividade/cadastro, conversao sobre atendidos e
-- tentativas_count correto para indicados de contratados.
CREATE OR REPLACE FUNCTION public.tele_ranking_indicadores_v2(
  _client_id uuid, _campanha_id uuid DEFAULT NULL, _data_de timestamptz DEFAULT NULL,
  _data_ate timestamptz DEFAULT NULL, _universo text DEFAULT 'eleicao'
)
RETURNS TABLE(
  pessoa_id uuid,pessoa_nome text,pessoa_tipo text,cidade text,bairro text,
  coordenador_id uuid,coordenador_nome text,filhos_count integer,indicados_diretos integer,
  indicados_total integer,ligados integer,confirmados integer,indecisos integer,rejeitados integer,
  pendentes integer,taxa_conversao numeric,meta integer,ultima_atividade timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_meta_coord int:=30; v_meta_lider int:=30; v_meta_cabo int:=5;
BEGIN
  IF NOT public.user_can_access_client(_client_id) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  SELECT COALESCE(c.meta_coordenador,30),COALESCE(c.meta_lider,30),COALESCE(c.meta_cabo,5)
    INTO v_meta_coord,v_meta_lider,v_meta_cabo FROM public.eleicao_indicacao_config c WHERE c.client_id=_client_id;
  v_meta_coord:=COALESCE(v_meta_coord,30); v_meta_lider:=COALESCE(v_meta_lider,30); v_meta_cabo:=COALESCE(v_meta_cabo,5);

  IF _universo='eleicao' THEN RETURN QUERY
    WITH pessoas AS (
      SELECT p.id,p.nome,p.tipo::text tipo,p.cidade,p.bairro,p.parent_id FROM public.eleicao_pessoas p WHERE p.client_id=_client_id
    ), base AS (
      SELECT i.* FROM public.eleicao_indicados i WHERE i.client_id=_client_id
       AND (_campanha_id IS NULL OR i.campanha_id=_campanha_id)
       AND (_data_de IS NULL OR GREATEST(i.created_at,COALESCE(i.ultima_ligacao_em,i.created_at))>=_data_de)
       AND (_data_ate IS NULL OR GREATEST(i.created_at,COALESCE(i.ultima_ligacao_em,i.created_at))<=_data_ate)
    ), direto AS (
      SELECT indicador_id pid,count(*)::int qtd,
       count(*) FILTER(WHERE ultima_ligacao_em IS NOT NULL OR COALESCE(total_tentativas,0)>0)::int trab,
       count(*) FILTER(WHERE ultimo_status_ligacao='atendeu')::int atend,
       count(*) FILTER(WHERE vota_candidato='sim')::int conf,
       count(*) FILTER(WHERE vota_candidato='indeciso')::int ind,
       count(*) FILTER(WHERE vota_candidato='nao')::int rej,max(ultima_ligacao_em) ult
      FROM base WHERE indicador_id IS NOT NULL GROUP BY indicador_id
    ), filhos AS (SELECT parent_id pid,count(*)::int qt FROM pessoas WHERE parent_id IS NOT NULL GROUP BY parent_id),
    roll AS (
      SELECT p.id pid,
       COALESCE(sum(d.qtd) FILTER(WHERE d.pid=p.id OR d.pid IN(SELECT id FROM pessoas WHERE parent_id=p.id)),0)::int qtd,
       COALESCE(sum(d.trab) FILTER(WHERE d.pid=p.id OR d.pid IN(SELECT id FROM pessoas WHERE parent_id=p.id)),0)::int trab,
       COALESCE(sum(d.atend) FILTER(WHERE d.pid=p.id OR d.pid IN(SELECT id FROM pessoas WHERE parent_id=p.id)),0)::int atend,
       COALESCE(sum(d.conf) FILTER(WHERE d.pid=p.id OR d.pid IN(SELECT id FROM pessoas WHERE parent_id=p.id)),0)::int conf,
       COALESCE(sum(d.ind) FILTER(WHERE d.pid=p.id OR d.pid IN(SELECT id FROM pessoas WHERE parent_id=p.id)),0)::int ind,
       COALESCE(sum(d.rej) FILTER(WHERE d.pid=p.id OR d.pid IN(SELECT id FROM pessoas WHERE parent_id=p.id)),0)::int rej,
       max(d.ult) FILTER(WHERE d.pid=p.id OR d.pid IN(SELECT id FROM pessoas WHERE parent_id=p.id)) ult
      FROM pessoas p LEFT JOIN direto d ON true GROUP BY p.id
    )
    SELECT p.id,p.nome,p.tipo,p.cidade,p.bairro,p.parent_id,par.nome,COALESCE(f.qt,0),COALESCE(d.qtd,0),
      r.qtd,r.trab,r.conf,r.ind,r.rej,GREATEST(r.qtd-r.trab,0),
      CASE WHEN r.atend>0 THEN round(r.conf::numeric/r.atend*100,1) END,
      CASE WHEN p.tipo='coordenador' THEN v_meta_coord ELSE v_meta_lider END,r.ult
    FROM pessoas p LEFT JOIN pessoas par ON par.id=p.parent_id LEFT JOIN filhos f ON f.pid=p.id
    LEFT JOIN direto d ON d.pid=p.id LEFT JOIN roll r ON r.pid=p.id
    ORDER BY r.conf DESC NULLS LAST,r.trab DESC NULLS LAST,p.nome;
  ELSE RETURN QUERY
    WITH pessoas AS (
      SELECT c.id,c.nome,CASE WHEN c.is_lider THEN 'lider' ELSE 'liderado' END tipo,c.cidade,c.bairro,
       c.lider_id parent_id,c.is_lider,COALESCE(c.quota_indicados,v_meta_cabo)::int quota
      FROM public.contratados c WHERE c.client_id=_client_id
    ), base AS (
      SELECT i.* FROM public.contratado_indicados i WHERE i.client_id=_client_id
       AND (_campanha_id IS NULL OR i.campanha_id=_campanha_id)
       AND (_data_de IS NULL OR GREATEST(i.created_at,COALESCE(i.ligacao_em,i.created_at))>=_data_de)
       AND (_data_ate IS NULL OR GREATEST(i.created_at,COALESCE(i.ligacao_em,i.created_at))<=_data_ate)
    ), direto AS (
      SELECT contratado_id pid,count(*)::int qtd,
       count(*) FILTER(WHERE ligacao_em IS NOT NULL OR COALESCE(tentativas_count,0)>0)::int trab,
       count(*) FILTER(WHERE ligacao_status='atendeu')::int atend,
       count(*) FILTER(WHERE vota_candidato='sim')::int conf,
       count(*) FILTER(WHERE vota_candidato='indeciso')::int ind,
       count(*) FILTER(WHERE vota_candidato='nao')::int rej,max(ligacao_em) ult
      FROM base WHERE contratado_id IS NOT NULL GROUP BY contratado_id
    ), filhos AS (SELECT parent_id pid,count(*)::int qt FROM pessoas WHERE parent_id IS NOT NULL GROUP BY parent_id),
    roll AS (
      SELECT p.id pid,
       COALESCE(sum(d.qtd) FILTER(WHERE d.pid=p.id OR (p.is_lider AND d.pid IN(SELECT id FROM pessoas WHERE parent_id=p.id))),0)::int qtd,
       COALESCE(sum(d.trab) FILTER(WHERE d.pid=p.id OR (p.is_lider AND d.pid IN(SELECT id FROM pessoas WHERE parent_id=p.id))),0)::int trab,
       COALESCE(sum(d.atend) FILTER(WHERE d.pid=p.id OR (p.is_lider AND d.pid IN(SELECT id FROM pessoas WHERE parent_id=p.id))),0)::int atend,
       COALESCE(sum(d.conf) FILTER(WHERE d.pid=p.id OR (p.is_lider AND d.pid IN(SELECT id FROM pessoas WHERE parent_id=p.id))),0)::int conf,
       COALESCE(sum(d.ind) FILTER(WHERE d.pid=p.id OR (p.is_lider AND d.pid IN(SELECT id FROM pessoas WHERE parent_id=p.id))),0)::int ind,
       COALESCE(sum(d.rej) FILTER(WHERE d.pid=p.id OR (p.is_lider AND d.pid IN(SELECT id FROM pessoas WHERE parent_id=p.id))),0)::int rej,
       max(d.ult) FILTER(WHERE d.pid=p.id OR (p.is_lider AND d.pid IN(SELECT id FROM pessoas WHERE parent_id=p.id))) ult
      FROM pessoas p LEFT JOIN direto d ON true GROUP BY p.id
    )
    SELECT p.id,p.nome,p.tipo,p.cidade,p.bairro,p.parent_id,par.nome,COALESCE(f.qt,0),COALESCE(d.qtd,0),
      r.qtd,r.trab,r.conf,r.ind,r.rej,GREATEST(r.qtd-r.trab,0),
      CASE WHEN r.atend>0 THEN round(r.conf::numeric/r.atend*100,1) END,
      CASE WHEN p.is_lider THEN v_meta_lider ELSE p.quota END,r.ult
    FROM pessoas p LEFT JOIN pessoas par ON par.id=p.parent_id LEFT JOIN filhos f ON f.pid=p.id
    LEFT JOIN direto d ON d.pid=p.id LEFT JOIN roll r ON r.pid=p.id
    ORDER BY r.conf DESC NULLS LAST,r.trab DESC NULLS LAST,p.nome;
  END IF;
END;$function$;

CREATE OR REPLACE FUNCTION public.tele_ranking_indicados_da_pessoa_v2(
 _client_id uuid,_pessoa_id uuid,_universo text DEFAULT 'eleicao',_incluir_filhos boolean DEFAULT false,
 _campanha_id uuid DEFAULT NULL,_data_de timestamptz DEFAULT NULL,_data_ate timestamptz DEFAULT NULL
)
RETURNS TABLE(indicado_id uuid,nome text,telefone text,cidade text,bairro text,vota_candidato text,
 candidato_alternativo text,ultimo_status_ligacao text,operador_nome text,observacao_tele text,
 ultima_ligacao_em timestamptz,total_tentativas integer,indicador_id uuid,indicador_nome text,created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
 IF NOT public.user_can_access_client(_client_id) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 IF _universo='eleicao' THEN RETURN QUERY WITH alvos AS(
  SELECT _pessoa_id id UNION SELECT p.id FROM public.eleicao_pessoas p WHERE _incluir_filhos AND p.parent_id=_pessoa_id AND p.client_id=_client_id)
  SELECT i.id,i.nome,i.telefone,i.cidade,i.bairro,i.vota_candidato,i.candidato_alternativo,i.ultimo_status_ligacao,
   i.operador_nome,i.observacao_tele,i.ultima_ligacao_em,COALESCE(i.total_tentativas,0),i.indicador_id,p.nome,i.created_at
  FROM public.eleicao_indicados i LEFT JOIN public.eleicao_pessoas p ON p.id=i.indicador_id
  WHERE i.client_id=_client_id AND i.indicador_id IN(SELECT id FROM alvos)
   AND (_campanha_id IS NULL OR i.campanha_id=_campanha_id)
   AND (_data_de IS NULL OR GREATEST(i.created_at,COALESCE(i.ultima_ligacao_em,i.created_at))>=_data_de)
   AND (_data_ate IS NULL OR GREATEST(i.created_at,COALESCE(i.ultima_ligacao_em,i.created_at))<=_data_ate)
  ORDER BY i.ultima_ligacao_em DESC NULLS LAST,i.created_at DESC;
 ELSE RETURN QUERY WITH alvos AS(
  SELECT _pessoa_id id UNION SELECT c.id FROM public.contratados c WHERE _incluir_filhos AND c.lider_id=_pessoa_id AND c.client_id=_client_id)
  SELECT i.id,i.nome,i.telefone,i.cidade,i.bairro,i.vota_candidato,i.candidato_alternativo,i.ligacao_status,
   i.operador_nome,i.observacao_tele,i.ligacao_em,COALESCE(i.tentativas_count,0),i.contratado_id,c.nome,i.created_at
  FROM public.contratado_indicados i LEFT JOIN public.contratados c ON c.id=i.contratado_id
  WHERE i.client_id=_client_id AND i.contratado_id IN(SELECT id FROM alvos)
   AND (_campanha_id IS NULL OR i.campanha_id=_campanha_id)
   AND (_data_de IS NULL OR GREATEST(i.created_at,COALESCE(i.ligacao_em,i.created_at))>=_data_de)
   AND (_data_ate IS NULL OR GREATEST(i.created_at,COALESCE(i.ligacao_em,i.created_at))<=_data_ate)
  ORDER BY i.ligacao_em DESC NULLS LAST,i.created_at DESC;
 END IF;
END;$function$;

REVOKE ALL ON FUNCTION public.tele_ranking_indicadores_v2(uuid,uuid,timestamptz,timestamptz,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tele_ranking_indicados_da_pessoa_v2(uuid,uuid,text,boolean,uuid,timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tele_ranking_indicadores_v2(uuid,uuid,timestamptz,timestamptz,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tele_ranking_indicados_da_pessoa_v2(uuid,uuid,text,boolean,uuid,timestamptz,timestamptz) TO authenticated;
