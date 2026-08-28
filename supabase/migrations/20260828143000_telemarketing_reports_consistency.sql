-- Fonte unica e deterministica para os relatorios de telemarketing.
-- Inclui contatos sem fila quando _campanha_id for NULL.
CREATE OR REPLACE FUNCTION public.tele_fila_report_rows_v2(_client_id uuid, _campanha_id uuid DEFAULT NULL)
RETURNS TABLE(
  contato_id uuid, tabela text, origem text, nome text, telefone text,
  cidade text, bairro text, ligacao_status text, status_telemarketing text,
  vota_candidato text, candidato_alternativo text,
  candidato_federal text, federal_status text, candidato_senador text, senador_status text,
  candidato_governador text, governador_status text,
  operador_nome text, ligacao_em timestamptz, total_tentativas integer,
  proxima_tentativa_em timestamptz, campanha_id uuid, campanha_nome text,
  indicador_id uuid, indicador_nome text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  WITH base AS (
    SELECT c.id, 'contratados'::text AS tabela,
      CASE WHEN c.is_lider THEN 'Lider (contratado)' ELSE 'Contratado' END AS origem,
      c.nome,c.telefone,c.cidade,c.bairro,c.ligacao_status,NULL::text AS status_telemarketing,
      c.vota_candidato,c.candidato_alternativo,c.candidato_federal,c.federal_status,
      c.candidato_senador,c.senador_status,c.candidato_governador,c.governador_status,
      c.operador_nome,c.ligacao_em,COALESCE(c.tentativas_count,0) AS total_tentativas,c.proxima_tentativa_em,
      c.campanha_id,NULL::uuid AS indicador_id,NULL::text AS indicador_nome
    FROM public.contratados c WHERE c.client_id=_client_id
    UNION ALL
    SELECT i.id,'contratado_indicados','Indicado de contratado',i.nome,i.telefone,i.cidade,i.bairro,
      i.ligacao_status,i.status,i.vota_candidato,i.candidato_alternativo,i.candidato_federal,i.federal_status,
      i.candidato_senador,i.senador_status,i.candidato_governador,i.governador_status,
      i.operador_nome,i.ligacao_em,COALESCE(i.tentativas_count,0),i.proxima_tentativa_em,
      i.campanha_id,i.contratado_id,ct.nome
    FROM public.contratado_indicados i LEFT JOIN public.contratados ct ON ct.id=i.contratado_id
    WHERE i.client_id=_client_id
    UNION ALL
    SELECT p.id,'eleicao_pessoas','Estrutura eleitoral',p.nome,p.telefone,p.cidade,p.bairro,
      p.ligacao_status,NULL,p.vota_candidato,p.candidato_alternativo,p.candidato_federal,p.federal_status,
      p.candidato_senador,p.senador_status,p.candidato_governador,p.governador_status,
      p.operador_nome,p.ligacao_em,COALESCE(p.tentativas_count,0),p.proxima_tentativa_em,
      p.campanha_id,NULL::uuid,NULL::text
    FROM public.eleicao_pessoas p WHERE p.client_id=_client_id AND p.telefone IS NOT NULL
    UNION ALL
    SELECT ei.id,'eleicao_indicados','Indicado (eleicao)',ei.nome,ei.telefone,ei.cidade,ei.bairro,
      ei.ultimo_status_ligacao,ei.status_telemarketing,ei.vota_candidato,ei.candidato_alternativo,
      ei.candidato_federal,ei.federal_status,ei.candidato_senador,ei.senador_status,
      ei.candidato_governador,ei.governador_status,ei.operador_nome,ei.ultima_ligacao_em,
      COALESCE(ei.total_tentativas,0),ei.proxima_tentativa_em,ei.campanha_id,ei.indicador_id,ep.nome
    FROM public.eleicao_indicados ei LEFT JOIN public.eleicao_pessoas ep ON ep.id=ei.indicador_id
    WHERE ei.client_id=_client_id
    UNION ALL
    SELECT a.id,'contatos_avulsos','Lista externa / planilha',a.nome,a.telefone,a.cidade,a.bairro,
      a.ligacao_status,NULL,a.vota_candidato,a.candidato_alternativo,a.candidato_federal,a.federal_status,
      a.candidato_senador,a.senador_status,a.candidato_governador,a.governador_status,
      a.operador_nome,a.ligacao_em,COALESCE(a.tentativas_count,0),a.proxima_tentativa_em,
      a.campanha_id,NULL::uuid,NULL::text
    FROM public.telemarketing_contatos_avulsos a
    WHERE a.client_id=_client_id AND COALESCE(a.ativo,true)
  )
  SELECT b.id,b.tabela,b.origem,b.nome,b.telefone,b.cidade,b.bairro,b.ligacao_status,
    b.status_telemarketing,b.vota_candidato,b.candidato_alternativo,b.candidato_federal,
    b.federal_status,b.candidato_senador,b.senador_status,b.candidato_governador,
    b.governador_status,b.operador_nome,b.ligacao_em,b.total_tentativas,b.proxima_tentativa_em,
    b.campanha_id,COALESCE(cam.nome,'Sem fila') AS campanha_nome,b.indicador_id,b.indicador_nome
  FROM base b LEFT JOIN public.telemarketing_campanhas cam ON cam.id=b.campanha_id
  WHERE public.user_can_access_client(_client_id)
    AND (_campanha_id IS NULL OR b.campanha_id=_campanha_id)
  ORDER BY b.tabela,b.id;
$function$;

REVOKE ALL ON FUNCTION public.tele_fila_report_rows_v2(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tele_fila_report_rows_v2(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tele_fila_report_rows_v2(uuid,uuid) TO service_role;
