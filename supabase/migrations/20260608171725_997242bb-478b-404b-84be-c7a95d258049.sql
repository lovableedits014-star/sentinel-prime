
-- Operator-visible script per active campaign
CREATE OR REPLACE FUNCTION public.tele_list_campanhas_scripts(_client_id uuid, _nome text, _senha text)
RETURNS TABLE(id uuid, nome text, script_intro text, script_perguntas jsonb, tags_rapidas jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public','extensions'
AS $$
BEGIN
  PERFORM public._tele_assert_operador(_client_id, _nome, _senha);
  RETURN QUERY
    SELECT c.id, c.nome, c.script_intro, c.script_perguntas, c.tags_rapidas
    FROM public.telemarketing_campanhas c
    WHERE c.client_id = _client_id AND c.ativo = true;
END;
$$;

REVOKE ALL ON FUNCTION public.tele_list_campanhas_scripts(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tele_list_campanhas_scripts(uuid, text, text) TO anon, authenticated, service_role;

-- Snapshot capture (admin) — caller must own client (RLS via clients check)
CREATE OR REPLACE FUNCTION public.tele_capture_snapshot(_client_id uuid, _rotulo text, _campanha_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','extensions'
AS $$
DECLARE
  _ok boolean;
  _new_id uuid;
  _total int; _ligados int; _atendeu int; _nao_atendeu int; _recusou int;
  _vota_sim int; _vota_nao int; _indeciso int;
  _by_bairro jsonb;
BEGIN
  -- caller must own client
  SELECT EXISTS(SELECT 1 FROM public.clients c WHERE c.id=_client_id AND c.user_id=auth.uid()) INTO _ok;
  IF NOT _ok THEN RAISE EXCEPTION 'forbidden'; END IF;

  WITH base AS (
    SELECT ligacao_status, vota_candidato, bairro FROM public.contratados WHERE client_id=_client_id
    UNION ALL
    SELECT ligacao_status, vota_candidato, bairro FROM public.contratado_indicados WHERE client_id=_client_id
    UNION ALL
    SELECT ligacao_status, vota_candidato, bairro FROM public.telemarketing_contatos_avulsos
      WHERE client_id=_client_id AND ativo=true
        AND (_campanha_id IS NULL OR campanha_id=_campanha_id)
  )
  SELECT
    count(*)::int,
    count(*) FILTER (WHERE ligacao_status IS NOT NULL AND ligacao_status<>'pendente')::int,
    count(*) FILTER (WHERE ligacao_status='atendeu')::int,
    count(*) FILTER (WHERE ligacao_status='nao_atendeu')::int,
    count(*) FILTER (WHERE ligacao_status='recusou')::int,
    count(*) FILTER (WHERE vota_candidato='sim')::int,
    count(*) FILTER (WHERE vota_candidato='nao')::int,
    count(*) FILTER (WHERE vota_candidato='indeciso')::int
  INTO _total,_ligados,_atendeu,_nao_atendeu,_recusou,_vota_sim,_vota_nao,_indeciso
  FROM base;

  SELECT COALESCE(jsonb_object_agg(bairro, c), '{}'::jsonb) INTO _by_bairro
  FROM (
    SELECT COALESCE(NULLIF(bairro,''),'(sem bairro)') AS bairro, count(*) AS c
    FROM (
      SELECT bairro, vota_candidato FROM public.contratados WHERE client_id=_client_id AND vota_candidato='sim'
      UNION ALL
      SELECT bairro, vota_candidato FROM public.contratado_indicados WHERE client_id=_client_id AND vota_candidato='sim'
      UNION ALL
      SELECT bairro, vota_candidato FROM public.telemarketing_contatos_avulsos
        WHERE client_id=_client_id AND ativo=true AND vota_candidato='sim'
          AND (_campanha_id IS NULL OR campanha_id=_campanha_id)
    ) s
    GROUP BY 1
  ) z;

  INSERT INTO public.telemarketing_relatorio_snapshots(
    client_id, campanha_id, rotulo, total, ligados, atendeu, nao_atendeu, recusou,
    vota_sim, vota_nao, indeciso, payload, created_by
  ) VALUES (
    _client_id, _campanha_id, _rotulo, _total, _ligados, _atendeu, _nao_atendeu, _recusou,
    _vota_sim, _vota_nao, _indeciso,
    jsonb_build_object('by_bairro_sim', _by_bairro),
    auth.uid()
  ) RETURNING id INTO _new_id;

  RETURN _new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.tele_capture_snapshot(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tele_capture_snapshot(uuid, text, uuid) TO authenticated, service_role;
