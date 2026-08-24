CREATE OR REPLACE FUNCTION public.tele_indicador_report_rows(_client_id uuid)
RETURNS TABLE(
  contato_id uuid,
  indicador_id uuid,
  indicador_nome text,
  indicador_tipo text,
  indicador_regiao text,
  nome text,
  telefone text,
  cidade text,
  bairro text,
  status_telemarketing text,
  ultimo_status_ligacao text,
  vota_candidato text,
  candidato_alternativo text,
  operador_nome text,
  ultima_ligacao_em timestamptz,
  total_tentativas integer,
  proxima_tentativa_em timestamptz,
  campanha_id uuid,
  campanha_nome text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ei.id,
    ei.indicador_id,
    ep.nome,
    ei.indicador_tipo::text,
    ep.regiao,
    ei.nome,
    ei.telefone,
    ei.cidade,
    ei.bairro,
    ei.status_telemarketing,
    ei.ultimo_status_ligacao,
    ei.vota_candidato,
    ei.candidato_alternativo,
    ei.operador_nome,
    ei.ultima_ligacao_em,
    COALESCE(ei.total_tentativas, 0),
    ei.proxima_tentativa_em,
    ei.campanha_id,
    tc.nome
  FROM public.eleicao_indicados ei
  JOIN public.eleicao_pessoas ep ON ep.id = ei.indicador_id
  LEFT JOIN public.telemarketing_campanhas tc ON tc.id = ei.campanha_id
  WHERE ei.client_id = _client_id
    AND public.user_can_access_client(_client_id)
  ORDER BY ep.nome, ei.nome;
$$;

REVOKE ALL ON FUNCTION public.tele_indicador_report_rows(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tele_indicador_report_rows(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tele_indicador_report_rows(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.tele_admin_listar_contatos_full(_client_id uuid)
RETURNS TABLE(tabela text, id uuid, nome text, telefone text, cidade text, bairro text, ligacao_status text, vota_candidato text, candidato_alternativo text, operador_nome text, ligacao_em timestamptz, tipo text, lider_id uuid, contratado_id uuid, campanha_id uuid, campanha_nome text, is_lider boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'contratados'::text, c.id, c.nome, c.telefone, c.cidade, c.bairro,
         c.ligacao_status, c.vota_candidato, c.candidato_alternativo, c.operador_nome,
         c.ligacao_em, CASE WHEN c.is_lider THEN 'lider' ELSE 'liderado' END,
         c.lider_id, NULL::uuid, c.campanha_id, cam.nome, c.is_lider
  FROM public.contratados c
  LEFT JOIN public.telemarketing_campanhas cam ON cam.id = c.campanha_id
  WHERE c.client_id = _client_id AND public.user_can_access_client(_client_id)
  UNION ALL
  SELECT 'contratado_indicados', i.id, i.nome, i.telefone, i.cidade, i.bairro,
         i.ligacao_status, i.vota_candidato, i.candidato_alternativo, i.operador_nome,
         i.ligacao_em, 'indicado', NULL::uuid, i.contratado_id, i.campanha_id, cam.nome, false
  FROM public.contratado_indicados i
  LEFT JOIN public.telemarketing_campanhas cam ON cam.id = i.campanha_id
  WHERE i.client_id = _client_id AND public.user_can_access_client(_client_id)
  UNION ALL
  SELECT 'eleicao_pessoas', p.id, p.nome, p.telefone, p.cidade, p.bairro,
         p.ligacao_status, p.vota_candidato, p.candidato_alternativo, p.operador_nome,
         p.ligacao_em, 'eleicao_pessoa', NULL::uuid, NULL::uuid, p.campanha_id, cam.nome, false
  FROM public.eleicao_pessoas p
  LEFT JOIN public.telemarketing_campanhas cam ON cam.id = p.campanha_id
  WHERE p.client_id = _client_id AND p.telefone IS NOT NULL AND public.user_can_access_client(_client_id)
  UNION ALL
  SELECT 'eleicao_indicados', ei.id, ei.nome, ei.telefone, ei.cidade, ei.bairro,
         ei.ultimo_status_ligacao, ei.vota_candidato, ei.candidato_alternativo, ei.operador_nome,
         ei.ultima_ligacao_em, 'eleicao_indicado', NULL::uuid, NULL::uuid, ei.campanha_id, cam.nome, false
  FROM public.eleicao_indicados ei
  LEFT JOIN public.telemarketing_campanhas cam ON cam.id = ei.campanha_id
  WHERE ei.client_id = _client_id AND public.user_can_access_client(_client_id)
  UNION ALL
  SELECT 'contatos_avulsos', a.id, a.nome, a.telefone, a.cidade, a.bairro,
         a.ligacao_status, a.vota_candidato, a.candidato_alternativo, a.operador_nome,
         a.ligacao_em, 'avulso', NULL::uuid, NULL::uuid, a.campanha_id, cam.nome, false
  FROM public.telemarketing_contatos_avulsos a
  LEFT JOIN public.telemarketing_campanhas cam ON cam.id = a.campanha_id
  WHERE a.client_id = _client_id AND COALESCE(a.ativo, true) AND public.user_can_access_client(_client_id);
$$;

REVOKE ALL ON FUNCTION public.tele_admin_listar_contatos_full(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tele_admin_listar_contatos_full(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tele_admin_listar_contatos_full(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.tele_capture_snapshot(_client_id uuid, _rotulo text, _campanha_id uuid DEFAULT NULL::uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_id uuid;
  _total int; _ligados int; _atendeu int; _nao_atendeu int; _recusou int;
  _vota_sim int; _vota_nao int; _indeciso int;
  _by_bairro jsonb;
BEGIN
  IF NOT public.user_can_access_client(_client_id) THEN RAISE EXCEPTION 'Acesso negado'; END IF;

  WITH base AS (
    SELECT ligacao_status, vota_candidato, bairro FROM public.contratados
      WHERE client_id=_client_id AND (_campanha_id IS NULL OR campanha_id=_campanha_id)
    UNION ALL
    SELECT ligacao_status, vota_candidato, bairro FROM public.contratado_indicados
      WHERE client_id=_client_id AND (_campanha_id IS NULL OR campanha_id=_campanha_id)
    UNION ALL
    SELECT ligacao_status, vota_candidato, bairro FROM public.telemarketing_contatos_avulsos
      WHERE client_id=_client_id AND COALESCE(ativo,true) AND (_campanha_id IS NULL OR campanha_id=_campanha_id)
    UNION ALL
    SELECT ligacao_status, vota_candidato, bairro FROM public.eleicao_pessoas
      WHERE client_id=_client_id AND telefone IS NOT NULL AND (_campanha_id IS NULL OR campanha_id=_campanha_id)
    UNION ALL
    SELECT ultimo_status_ligacao, vota_candidato, bairro FROM public.eleicao_indicados
      WHERE client_id=_client_id AND (_campanha_id IS NULL OR campanha_id=_campanha_id)
  )
  SELECT count(*)::int,
    count(*) FILTER (WHERE ligacao_status IS NOT NULL AND ligacao_status<>'pendente')::int,
    count(*) FILTER (WHERE ligacao_status='atendeu')::int,
    count(*) FILTER (WHERE ligacao_status='nao_atendeu')::int,
    count(*) FILTER (WHERE ligacao_status='recusou')::int,
    count(*) FILTER (WHERE vota_candidato='sim')::int,
    count(*) FILTER (WHERE vota_candidato='nao')::int,
    count(*) FILTER (WHERE vota_candidato='indeciso')::int
  INTO _total,_ligados,_atendeu,_nao_atendeu,_recusou,_vota_sim,_vota_nao,_indeciso FROM base;

  WITH votos AS (
    SELECT bairro FROM public.contratados WHERE client_id=_client_id AND vota_candidato='sim' AND (_campanha_id IS NULL OR campanha_id=_campanha_id)
    UNION ALL SELECT bairro FROM public.contratado_indicados WHERE client_id=_client_id AND vota_candidato='sim' AND (_campanha_id IS NULL OR campanha_id=_campanha_id)
    UNION ALL SELECT bairro FROM public.telemarketing_contatos_avulsos WHERE client_id=_client_id AND COALESCE(ativo,true) AND vota_candidato='sim' AND (_campanha_id IS NULL OR campanha_id=_campanha_id)
    UNION ALL SELECT bairro FROM public.eleicao_pessoas WHERE client_id=_client_id AND telefone IS NOT NULL AND vota_candidato='sim' AND (_campanha_id IS NULL OR campanha_id=_campanha_id)
    UNION ALL SELECT bairro FROM public.eleicao_indicados WHERE client_id=_client_id AND vota_candidato='sim' AND (_campanha_id IS NULL OR campanha_id=_campanha_id)
  )
  SELECT COALESCE(jsonb_object_agg(bairro, c), '{}'::jsonb) INTO _by_bairro
  FROM (SELECT COALESCE(NULLIF(bairro,''),'(sem bairro)') bairro, count(*) c FROM votos GROUP BY 1) z;

  INSERT INTO public.telemarketing_relatorio_snapshots(client_id,campanha_id,rotulo,total,ligados,atendeu,nao_atendeu,recusou,vota_sim,vota_nao,indeciso,payload,created_by)
  VALUES (_client_id,_campanha_id,_rotulo,_total,_ligados,_atendeu,_nao_atendeu,_recusou,_vota_sim,_vota_nao,_indeciso,jsonb_build_object('by_bairro_sim',_by_bairro),auth.uid())
  RETURNING id INTO _new_id;
  RETURN _new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.tele_capture_snapshot(uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tele_capture_snapshot(uuid,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tele_capture_snapshot(uuid,text,uuid) TO service_role;