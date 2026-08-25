DROP FUNCTION IF EXISTS public.tele_admin_listar_contatos_full(uuid);
CREATE FUNCTION public.tele_admin_listar_contatos_full(_client_id uuid)
RETURNS TABLE(tabela text, id uuid, nome text, telefone text, cidade text, bairro text, ligacao_status text, vota_candidato text, candidato_alternativo text, operador_nome text, ligacao_em timestamp with time zone, tipo text, lider_id uuid, contratado_id uuid, campanha_id uuid, campanha_nome text, is_lider boolean, candidato_federal text, federal_status text, candidato_senador text, senador_status text, candidato_governador text, governador_status text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT 'contratados'::text, c.id, c.nome, c.telefone, c.cidade, c.bairro,
         c.ligacao_status, c.vota_candidato, c.candidato_alternativo, c.operador_nome,
         c.ligacao_em, CASE WHEN c.is_lider THEN 'lider' ELSE 'liderado' END,
         c.lider_id, NULL::uuid, c.campanha_id, cam.nome, c.is_lider,
         c.candidato_federal, c.federal_status, c.candidato_senador, c.senador_status,
         c.candidato_governador, c.governador_status
  FROM public.contratados c
  LEFT JOIN public.telemarketing_campanhas cam ON cam.id = c.campanha_id
  WHERE c.client_id = _client_id AND public.user_can_access_client(_client_id)
  UNION ALL
  SELECT 'contratado_indicados', i.id, i.nome, i.telefone, i.cidade, i.bairro,
         i.ligacao_status, i.vota_candidato, i.candidato_alternativo, i.operador_nome,
         i.ligacao_em, 'indicado', NULL::uuid, i.contratado_id, i.campanha_id, cam.nome, false,
         i.candidato_federal, i.federal_status, i.candidato_senador, i.senador_status,
         i.candidato_governador, i.governador_status
  FROM public.contratado_indicados i
  LEFT JOIN public.telemarketing_campanhas cam ON cam.id = i.campanha_id
  WHERE i.client_id = _client_id AND public.user_can_access_client(_client_id)
  UNION ALL
  SELECT 'eleicao_pessoas', p.id, p.nome, p.telefone, p.cidade, p.bairro,
         p.ligacao_status, p.vota_candidato, p.candidato_alternativo, p.operador_nome,
         p.ligacao_em, 'eleicao_pessoa', NULL::uuid, NULL::uuid, p.campanha_id, cam.nome, false,
         p.candidato_federal, p.federal_status, p.candidato_senador, p.senador_status,
         p.candidato_governador, p.governador_status
  FROM public.eleicao_pessoas p
  LEFT JOIN public.telemarketing_campanhas cam ON cam.id = p.campanha_id
  WHERE p.client_id = _client_id AND p.telefone IS NOT NULL AND public.user_can_access_client(_client_id)
  UNION ALL
  SELECT 'eleicao_indicados', ei.id, ei.nome, ei.telefone, ei.cidade, ei.bairro,
         ei.ultimo_status_ligacao, ei.vota_candidato, ei.candidato_alternativo, ei.operador_nome,
         ei.ultima_ligacao_em, 'eleicao_indicado', NULL::uuid, NULL::uuid, ei.campanha_id, cam.nome, false,
         ei.candidato_federal, ei.federal_status, ei.candidato_senador, ei.senador_status,
         ei.candidato_governador, ei.governador_status
  FROM public.eleicao_indicados ei
  LEFT JOIN public.telemarketing_campanhas cam ON cam.id = ei.campanha_id
  WHERE ei.client_id = _client_id AND public.user_can_access_client(_client_id)
  UNION ALL
  SELECT 'contatos_avulsos', a.id, a.nome, a.telefone, a.cidade, a.bairro,
         a.ligacao_status, a.vota_candidato, a.candidato_alternativo, a.operador_nome,
         a.ligacao_em, 'avulso', NULL::uuid, NULL::uuid, a.campanha_id, cam.nome, false,
         a.candidato_federal, a.federal_status, a.candidato_senador, a.senador_status,
         a.candidato_governador, a.governador_status
  FROM public.telemarketing_contatos_avulsos a
  LEFT JOIN public.telemarketing_campanhas cam ON cam.id = a.campanha_id
  WHERE a.client_id = _client_id AND COALESCE(a.ativo, true) AND public.user_can_access_client(_client_id);
$function$;

DROP FUNCTION IF EXISTS public.tele_indicador_report_rows(uuid);
CREATE FUNCTION public.tele_indicador_report_rows(_client_id uuid)
RETURNS TABLE(contato_id uuid, indicador_id uuid, indicador_nome text, indicador_tipo text, indicador_regiao text, nome text, telefone text, cidade text, bairro text, status_telemarketing text, ultimo_status_ligacao text, vota_candidato text, candidato_alternativo text, operador_nome text, ultima_ligacao_em timestamp with time zone, total_tentativas integer, proxima_tentativa_em timestamp with time zone, campanha_id uuid, campanha_nome text, candidato_federal text, federal_status text, candidato_senador text, senador_status text, candidato_governador text, governador_status text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    ei.id, ei.indicador_id, ep.nome, ei.indicador_tipo::text, ep.regiao,
    ei.nome, ei.telefone, ei.cidade, ei.bairro,
    ei.status_telemarketing, ei.ultimo_status_ligacao,
    ei.vota_candidato, ei.candidato_alternativo, ei.operador_nome,
    ei.ultima_ligacao_em, COALESCE(ei.total_tentativas, 0), ei.proxima_tentativa_em,
    ei.campanha_id, tc.nome,
    ei.candidato_federal, ei.federal_status, ei.candidato_senador, ei.senador_status,
    ei.candidato_governador, ei.governador_status
  FROM public.eleicao_indicados ei
  JOIN public.eleicao_pessoas ep ON ep.id = ei.indicador_id
  LEFT JOIN public.telemarketing_campanhas tc ON tc.id = ei.campanha_id
  WHERE ei.client_id = _client_id
    AND public.user_can_access_client(_client_id)
  ORDER BY ep.nome, ei.nome;
$function$;

-- Sugestões de nomes já citados, por cargo (para autocomplete do operador)
CREATE OR REPLACE FUNCTION public.tele_sugestoes_candidatos(
  _client_id uuid, _nome text, _senha text, _cargo text, _termo text DEFAULT NULL::text, _limite integer DEFAULT 8)
RETURNS TABLE(candidato text, mencoes bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_like text;
  v_lim integer;
BEGIN
  PERFORM public._tele_assert_operador(_client_id, _nome, _senha);
  IF _cargo NOT IN ('estadual','federal','senador','governador') THEN
    RAISE EXCEPTION 'Cargo inválido'; END IF;
  v_like := '%' || lower(btrim(COALESCE(_termo, ''))) || '%';
  v_lim := LEAST(GREATEST(COALESCE(_limite, 8), 1), 30);

  RETURN QUERY
  SELECT x.c, count(*)::bigint
    FROM (
      SELECT CASE _cargo
               WHEN 'estadual' THEN l.candidato_alternativo
               WHEN 'federal' THEN l.candidato_federal
               WHEN 'senador' THEN l.candidato_senador
               ELSE l.candidato_governador END AS c
        FROM public.telemarketing_call_log l
       WHERE l.client_id = _client_id
    ) AS x(c)
   WHERE x.c IS NOT NULL AND btrim(x.c) <> ''
     AND lower(x.c) LIKE v_like
   GROUP BY x.c
   ORDER BY count(*) DESC, x.c
   LIMIT v_lim;
END;
$function$;