ALTER TABLE public.telemarketing_call_log
  ADD COLUMN IF NOT EXISTS campanha_id uuid REFERENCES public.telemarketing_campanhas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tele_call_log_client_campanha
  ON public.telemarketing_call_log(client_id, campanha_id);

-- 1) Registrar a fila em cada ligação
CREATE OR REPLACE FUNCTION public.tele_registrar_ligacao(_client_id uuid, _nome text, _senha text, _tabela text, _id uuid, _ligacao_status text, _cidade text, _bairro text, _vota_candidato text DEFAULT NULL::text, _candidato_alternativo text DEFAULT NULL::text, _observacao text DEFAULT NULL::text, _proxima_tentativa_em timestamp with time zone DEFAULT NULL::timestamp with time zone, _candidato_federal text DEFAULT NULL::text, _federal_status text DEFAULT NULL::text, _candidato_senador text DEFAULT NULL::text, _senador_status text DEFAULT NULL::text, _candidato_governador text DEFAULT NULL::text, _governador_status text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer := 0;
  v_status text;
  v_tele_status text;
  v_lock_owner text;
  v_lock_expires timestamptz;
  v_prox timestamptz;
  v_lig text;
  v_alt text;
  v_camp uuid;
  v_fed text; v_sen text; v_gov text;
  v_fed_st text; v_sen_st text; v_gov_st text;
BEGIN
  PERFORM public._tele_assert_operador(_client_id, _nome, _senha);

  v_lig := _ligacao_status;
  IF v_lig = 'recusou' THEN v_lig := 'nao_atendeu'; END IF;
  IF v_lig NOT IN ('atendeu','nao_atendeu','pendente','reagendou','invalido') THEN
    RAISE EXCEPTION 'Status inválido'; END IF;

  v_alt := public.tele_norm_candidato(_candidato_alternativo);
  v_fed := public.tele_norm_candidato(_candidato_federal);
  v_sen := public.tele_norm_candidato(_candidato_senador);
  v_gov := public.tele_norm_candidato(_candidato_governador);

  IF v_lig = 'atendeu' THEN
    IF COALESCE(_vota_candidato,'') NOT IN ('sim','nao','indeciso','nao_quis_opinar') THEN
      RAISE EXCEPTION 'Informe o voto para deputado estadual.';
    END IF;

    IF _vota_candidato = 'nao' AND v_alt IS NULL THEN
      RAISE EXCEPTION 'Informe em quem a pessoa vota quando o resultado for "não vota".';
    END IF;

    IF _vota_candidato = 'nao_quis_opinar' THEN
      v_fed := NULL; v_sen := NULL; v_gov := NULL;
      v_fed_st := 'nao_quis_responder';
      v_sen_st := 'nao_quis_responder';
      v_gov_st := 'nao_quis_responder';
    ELSE
      v_fed_st := CASE WHEN v_fed IS NOT NULL THEN 'informado'
                       WHEN _federal_status = 'nao_quis_responder' THEN 'nao_quis_responder' END;
      v_sen_st := CASE WHEN v_sen IS NOT NULL THEN 'informado'
                       WHEN _senador_status = 'nao_quis_responder' THEN 'nao_quis_responder' END;
      v_gov_st := CASE WHEN v_gov IS NOT NULL THEN 'informado'
                       WHEN _governador_status = 'nao_quis_responder' THEN 'nao_quis_responder' END;
      IF v_fed_st IS NULL THEN
        RAISE EXCEPTION 'Informe o deputado federal ou marque "não quis responder".'; END IF;
      IF v_sen_st IS NULL THEN
        RAISE EXCEPTION 'Informe o senador ou marque "não quis responder".'; END IF;
      IF v_gov_st IS NULL THEN
        RAISE EXCEPTION 'Informe o governador ou marque "não quis responder".'; END IF;
    END IF;
  END IF;

  v_prox := _proxima_tentativa_em;
  IF v_lig = 'nao_atendeu' AND v_prox IS NULL THEN
    v_prox := now() + interval '6 hours';
  END IF;

  SELECT operador_nome, expires_at INTO v_lock_owner, v_lock_expires
    FROM public.telemarketing_call_assignments
   WHERE client_id=_client_id AND tabela=_tabela AND contato_id=_id
     AND expires_at > now()
   LIMIT 1;

  IF v_lock_owner IS NOT NULL AND v_lock_owner <> _nome THEN
    RETURN jsonb_build_object('updated', 0, 'conflict', true,
      'lock_owner', v_lock_owner, 'lock_expires', v_lock_expires);
  END IF;

  IF _tabela='contratados' THEN
    SELECT campanha_id INTO v_camp FROM public.contratados WHERE id=_id AND client_id=_client_id;
    UPDATE public.contratados
    SET ligacao_status=v_lig, operador_nome=_nome, ligacao_em=now(),
        tentativas_count=COALESCE(tentativas_count,0)+1,
        proxima_tentativa_em=v_prox,
        observacao_tele=COALESCE(NULLIF(_observacao,''), observacao_tele),
        cidade=COALESCE(NULLIF(_cidade,''), cidade),
        bairro=COALESCE(NULLIF(_bairro,''), bairro),
        vota_candidato=CASE WHEN v_lig='atendeu' THEN _vota_candidato ELSE vota_candidato END,
        candidato_alternativo=CASE WHEN v_lig='atendeu' THEN v_alt ELSE candidato_alternativo END,
        candidato_federal=CASE WHEN v_lig='atendeu' THEN v_fed ELSE candidato_federal END,
        federal_status=CASE WHEN v_lig='atendeu' THEN v_fed_st ELSE federal_status END,
        candidato_senador=CASE WHEN v_lig='atendeu' THEN v_sen ELSE candidato_senador END,
        senador_status=CASE WHEN v_lig='atendeu' THEN v_sen_st ELSE senador_status END,
        candidato_governador=CASE WHEN v_lig='atendeu' THEN v_gov ELSE candidato_governador END,
        governador_status=CASE WHEN v_lig='atendeu' THEN v_gov_st ELSE governador_status END
    WHERE id=_id AND client_id=_client_id;
    GET DIAGNOSTICS v_count=ROW_COUNT;
  ELSIF _tabela='contratado_indicados' THEN
    SELECT campanha_id INTO v_camp FROM public.contratado_indicados WHERE id=_id AND client_id=_client_id;
    v_status := CASE WHEN v_lig='atendeu' AND _vota_candidato='sim' THEN 'confirmado'
                     WHEN v_lig='atendeu' AND _vota_candidato='nao' THEN 'rejeitado'
                     ELSE NULL END;
    UPDATE public.contratado_indicados
    SET ligacao_status=v_lig, operador_nome=_nome, ligacao_em=now(),
        tentativas_count=COALESCE(tentativas_count,0)+1,
        proxima_tentativa_em=v_prox,
        observacao_tele=COALESCE(NULLIF(_observacao,''), observacao_tele),
        cidade=COALESCE(NULLIF(_cidade,''), cidade),
        bairro=COALESCE(NULLIF(_bairro,''), bairro),
        vota_candidato=CASE WHEN v_lig='atendeu' THEN _vota_candidato ELSE vota_candidato END,
        candidato_alternativo=CASE WHEN v_lig='atendeu' THEN v_alt ELSE candidato_alternativo END,
        candidato_federal=CASE WHEN v_lig='atendeu' THEN v_fed ELSE candidato_federal END,
        federal_status=CASE WHEN v_lig='atendeu' THEN v_fed_st ELSE federal_status END,
        candidato_senador=CASE WHEN v_lig='atendeu' THEN v_sen ELSE candidato_senador END,
        senador_status=CASE WHEN v_lig='atendeu' THEN v_sen_st ELSE senador_status END,
        candidato_governador=CASE WHEN v_lig='atendeu' THEN v_gov ELSE candidato_governador END,
        governador_status=CASE WHEN v_lig='atendeu' THEN v_gov_st ELSE governador_status END,
        status=COALESCE(v_status, status)
    WHERE id=_id AND client_id=_client_id;
    GET DIAGNOSTICS v_count=ROW_COUNT;
  ELSIF _tabela='contatos_avulsos' THEN
    SELECT campanha_id INTO v_camp FROM public.telemarketing_contatos_avulsos WHERE id=_id AND client_id=_client_id;
    UPDATE public.telemarketing_contatos_avulsos
    SET ligacao_status=v_lig, operador_nome=_nome, ligacao_em=now(),
        tentativas_count=COALESCE(tentativas_count,0)+1,
        proxima_tentativa_em=v_prox,
        observacao_tele=COALESCE(NULLIF(_observacao,''), observacao_tele),
        cidade=COALESCE(NULLIF(_cidade,''), cidade),
        bairro=COALESCE(NULLIF(_bairro,''), bairro),
        vota_candidato=CASE WHEN v_lig='atendeu' THEN _vota_candidato ELSE vota_candidato END,
        candidato_alternativo=CASE WHEN v_lig='atendeu' THEN v_alt ELSE candidato_alternativo END,
        candidato_federal=CASE WHEN v_lig='atendeu' THEN v_fed ELSE candidato_federal END,
        federal_status=CASE WHEN v_lig='atendeu' THEN v_fed_st ELSE federal_status END,
        candidato_senador=CASE WHEN v_lig='atendeu' THEN v_sen ELSE candidato_senador END,
        senador_status=CASE WHEN v_lig='atendeu' THEN v_sen_st ELSE senador_status END,
        candidato_governador=CASE WHEN v_lig='atendeu' THEN v_gov ELSE candidato_governador END,
        governador_status=CASE WHEN v_lig='atendeu' THEN v_gov_st ELSE governador_status END
    WHERE id=_id AND client_id=_client_id;
    GET DIAGNOSTICS v_count=ROW_COUNT;
  ELSIF _tabela='eleicao_indicados' THEN
    SELECT campanha_id INTO v_camp FROM public.eleicao_indicados WHERE id=_id AND client_id=_client_id;
    v_tele_status := CASE
      WHEN v_lig = 'atendeu' THEN 'concluido'
      WHEN v_lig='invalido' THEN 'descartado'
      WHEN v_prox IS NOT NULL THEN 'agendado'
      ELSE 'pendente' END;
    UPDATE public.eleicao_indicados
    SET ultimo_status_ligacao=v_lig, operador_nome=_nome, ultima_ligacao_em=now(),
        total_tentativas=COALESCE(total_tentativas,0)+1,
        proxima_tentativa_em=v_prox,
        observacao_tele=COALESCE(NULLIF(_observacao,''), observacao_tele),
        cidade=COALESCE(NULLIF(_cidade,''), cidade),
        bairro=COALESCE(NULLIF(_bairro,''), bairro),
        vota_candidato=CASE WHEN v_lig='atendeu' THEN _vota_candidato ELSE vota_candidato END,
        candidato_alternativo=CASE WHEN v_lig='atendeu' THEN v_alt ELSE candidato_alternativo END,
        candidato_federal=CASE WHEN v_lig='atendeu' THEN v_fed ELSE candidato_federal END,
        federal_status=CASE WHEN v_lig='atendeu' THEN v_fed_st ELSE federal_status END,
        candidato_senador=CASE WHEN v_lig='atendeu' THEN v_sen ELSE candidato_senador END,
        senador_status=CASE WHEN v_lig='atendeu' THEN v_sen_st ELSE senador_status END,
        candidato_governador=CASE WHEN v_lig='atendeu' THEN v_gov ELSE candidato_governador END,
        governador_status=CASE WHEN v_lig='atendeu' THEN v_gov_st ELSE governador_status END,
        status_telemarketing=v_tele_status
    WHERE id=_id AND client_id=_client_id;
    GET DIAGNOSTICS v_count=ROW_COUNT;
  ELSIF _tabela='eleicao_pessoas' THEN
    SELECT campanha_id INTO v_camp FROM public.eleicao_pessoas WHERE id=_id AND client_id=_client_id;
    UPDATE public.eleicao_pessoas
    SET ligacao_status=v_lig, operador_nome=_nome, ligacao_em=now(),
        tentativas_count=COALESCE(tentativas_count,0)+1,
        proxima_tentativa_em=v_prox,
        observacao_tele=COALESCE(NULLIF(_observacao,''), observacao_tele),
        cidade=COALESCE(NULLIF(_cidade,''), cidade),
        bairro=COALESCE(NULLIF(_bairro,''), bairro),
        vota_candidato=CASE WHEN v_lig='atendeu' THEN _vota_candidato ELSE vota_candidato END,
        candidato_alternativo=CASE WHEN v_lig='atendeu' THEN v_alt ELSE candidato_alternativo END,
        candidato_federal=CASE WHEN v_lig='atendeu' THEN v_fed ELSE candidato_federal END,
        federal_status=CASE WHEN v_lig='atendeu' THEN v_fed_st ELSE federal_status END,
        candidato_senador=CASE WHEN v_lig='atendeu' THEN v_sen ELSE candidato_senador END,
        senador_status=CASE WHEN v_lig='atendeu' THEN v_sen_st ELSE senador_status END,
        candidato_governador=CASE WHEN v_lig='atendeu' THEN v_gov ELSE candidato_governador END,
        governador_status=CASE WHEN v_lig='atendeu' THEN v_gov_st ELSE governador_status END
    WHERE id=_id AND client_id=_client_id;
    GET DIAGNOSTICS v_count=ROW_COUNT;
  ELSE
    RAISE EXCEPTION 'Tabela inválida';
  END IF;

  DELETE FROM public.telemarketing_call_assignments
   WHERE client_id=_client_id AND tabela=_tabela AND contato_id=_id;

  INSERT INTO public.telemarketing_call_log(
    client_id, tabela, contato_id, operador_nome, ligacao_status,
    cidade, bairro, vota_candidato, candidato_alternativo, observacao, proxima_tentativa_em,
    candidato_federal, federal_status, candidato_senador, senador_status,
    candidato_governador, governador_status, campanha_id)
  VALUES (_client_id, _tabela, _id, _nome, v_lig,
    NULLIF(_cidade,''), NULLIF(_bairro,''), _vota_candidato, v_alt, NULLIF(_observacao,''), v_prox,
    v_fed, v_fed_st, v_sen, v_sen_st, v_gov, v_gov_st, v_camp);

  RETURN jsonb_build_object('updated', v_count);
END;
$function$;

-- 2) Relatório geral por fila (qualquer origem)
CREATE OR REPLACE FUNCTION public.tele_fila_report_rows(_client_id uuid, _campanha_id uuid DEFAULT NULL)
 RETURNS TABLE(
   contato_id uuid, tabela text, origem text, nome text, telefone text,
   cidade text, bairro text, ligacao_status text, status_telemarketing text,
   vota_candidato text, candidato_alternativo text,
   candidato_federal text, federal_status text,
   candidato_senador text, senador_status text,
   candidato_governador text, governador_status text,
   operador_nome text, ligacao_em timestamp with time zone,
   total_tentativas integer, proxima_tentativa_em timestamp with time zone,
   campanha_id uuid, campanha_nome text,
   indicador_id uuid, indicador_nome text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT c.id, 'contratados'::text AS tabela,
           CASE WHEN c.is_lider THEN 'Líder (contratado)' ELSE 'Contratado' END AS origem,
           c.nome, c.telefone, c.cidade, c.bairro, c.ligacao_status, NULL::text AS status_telemarketing,
           c.vota_candidato, c.candidato_alternativo,
           c.candidato_federal, c.federal_status, c.candidato_senador, c.senador_status,
           c.candidato_governador, c.governador_status,
           c.operador_nome, c.ligacao_em, COALESCE(c.tentativas_count,0) AS total_tentativas,
           c.proxima_tentativa_em, c.campanha_id,
           NULL::uuid AS indicador_id, NULL::text AS indicador_nome
      FROM public.contratados c
     WHERE c.client_id = _client_id
    UNION ALL
    SELECT i.id, 'contratado_indicados', 'Indicado de contratado',
           i.nome, i.telefone, i.cidade, i.bairro, i.ligacao_status, i.status,
           i.vota_candidato, i.candidato_alternativo,
           i.candidato_federal, i.federal_status, i.candidato_senador, i.senador_status,
           i.candidato_governador, i.governador_status,
           i.operador_nome, i.ligacao_em, COALESCE(i.tentativas_count,0),
           i.proxima_tentativa_em, i.campanha_id,
           i.contratado_id, ct.nome
      FROM public.contratado_indicados i
      LEFT JOIN public.contratados ct ON ct.id = i.contratado_id
     WHERE i.client_id = _client_id
    UNION ALL
    SELECT p.id, 'eleicao_pessoas', 'Estrutura eleitoral',
           p.nome, p.telefone, p.cidade, p.bairro, p.ligacao_status, NULL,
           p.vota_candidato, p.candidato_alternativo,
           p.candidato_federal, p.federal_status, p.candidato_senador, p.senador_status,
           p.candidato_governador, p.governador_status,
           p.operador_nome, p.ligacao_em, COALESCE(p.tentativas_count,0),
           p.proxima_tentativa_em, p.campanha_id,
           NULL::uuid, NULL::text
      FROM public.eleicao_pessoas p
     WHERE p.client_id = _client_id AND p.telefone IS NOT NULL
    UNION ALL
    SELECT ei.id, 'eleicao_indicados', 'Indicado (eleição)',
           ei.nome, ei.telefone, ei.cidade, ei.bairro, ei.ultimo_status_ligacao, ei.status_telemarketing,
           ei.vota_candidato, ei.candidato_alternativo,
           ei.candidato_federal, ei.federal_status, ei.candidato_senador, ei.senador_status,
           ei.candidato_governador, ei.governador_status,
           ei.operador_nome, ei.ultima_ligacao_em, COALESCE(ei.total_tentativas,0),
           ei.proxima_tentativa_em, ei.campanha_id,
           ei.indicador_id, ep.nome
      FROM public.eleicao_indicados ei
      LEFT JOIN public.eleicao_pessoas ep ON ep.id = ei.indicador_id
     WHERE ei.client_id = _client_id
    UNION ALL
    SELECT a.id, 'contatos_avulsos', 'Lista externa / planilha',
           a.nome, a.telefone, a.cidade, a.bairro, a.ligacao_status, NULL,
           a.vota_candidato, a.candidato_alternativo,
           a.candidato_federal, a.federal_status, a.candidato_senador, a.senador_status,
           a.candidato_governador, a.governador_status,
           a.operador_nome, a.ligacao_em, COALESCE(a.tentativas_count,0),
           a.proxima_tentativa_em, a.campanha_id,
           NULL::uuid, NULL::text
      FROM public.telemarketing_contatos_avulsos a
     WHERE a.client_id = _client_id AND COALESCE(a.ativo, true)
  )
  SELECT b.id, b.tabela, b.origem, b.nome, b.telefone, b.cidade, b.bairro,
         b.ligacao_status, b.status_telemarketing, b.vota_candidato, b.candidato_alternativo,
         b.candidato_federal, b.federal_status, b.candidato_senador, b.senador_status,
         b.candidato_governador, b.governador_status,
         b.operador_nome, b.ligacao_em, b.total_tentativas, b.proxima_tentativa_em,
         b.campanha_id, cam.nome, b.indicador_id, b.indicador_nome
    FROM base b
    LEFT JOIN public.telemarketing_campanhas cam ON cam.id = b.campanha_id
   WHERE public.user_can_access_client(_client_id)
     AND (_campanha_id IS NULL OR b.campanha_id = _campanha_id)
     AND (_campanha_id IS NOT NULL OR b.campanha_id IS NOT NULL)
   ORDER BY cam.nome NULLS LAST, b.nome;
$function$;

-- 3) Comparativo entre filas
CREATE OR REPLACE FUNCTION public.tele_fila_compare(_client_id uuid)
 RETURNS TABLE(
   campanha_id uuid, campanha_nome text, ativo boolean, criada_em timestamp with time zone,
   total bigint, trabalhados bigint, pendentes bigint, atendidos bigint,
   sim bigint, nao bigint, indeciso bigint, nao_quis_opinar bigint,
   nao_atendeu bigint, invalidos bigint, tentativas bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT c.id, c.nome, c.ativo, c.created_at,
         COUNT(r.contato_id)::bigint,
         COUNT(*) FILTER (WHERE r.ligacao_em IS NOT NULL OR r.total_tentativas > 0)::bigint,
         COUNT(*) FILTER (WHERE r.ligacao_em IS NULL AND COALESCE(r.total_tentativas,0) = 0)::bigint,
         COUNT(*) FILTER (WHERE r.ligacao_status = 'atendeu')::bigint,
         COUNT(*) FILTER (WHERE r.vota_candidato = 'sim')::bigint,
         COUNT(*) FILTER (WHERE r.vota_candidato = 'nao')::bigint,
         COUNT(*) FILTER (WHERE r.vota_candidato = 'indeciso')::bigint,
         COUNT(*) FILTER (WHERE r.vota_candidato = 'nao_quis_opinar')::bigint,
         COUNT(*) FILTER (WHERE r.ligacao_status = 'nao_atendeu')::bigint,
         COUNT(*) FILTER (WHERE r.ligacao_status = 'invalido' OR r.status_telemarketing = 'descartado')::bigint,
         COALESCE(SUM(r.total_tentativas),0)::bigint
    FROM public.telemarketing_campanhas c
    LEFT JOIN public.tele_fila_report_rows(_client_id, NULL) r ON r.campanha_id = c.id
   WHERE c.client_id = _client_id AND public.user_can_access_client(_client_id)
   GROUP BY c.id, c.nome, c.ativo, c.created_at
   ORDER BY c.created_at DESC;
$function$;

-- 4) Renomear fila
CREATE OR REPLACE FUNCTION public.tele_fila_renomear(_client_id uuid, _campanha_id uuid, _nome text, _descricao text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_count integer := 0;
BEGIN
  PERFORM public._tele_assert_client_admin(_client_id);
  IF COALESCE(btrim(_nome),'') = '' THEN
    RAISE EXCEPTION 'Informe o nome da fila';
  END IF;
  UPDATE public.telemarketing_campanhas
     SET nome = btrim(_nome),
         descricao = NULLIF(btrim(COALESCE(_descricao,'')), ''),
         updated_at = now()
   WHERE id = _campanha_id AND client_id = _client_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('updated', v_count);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.tele_fila_report_rows(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tele_fila_compare(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tele_fila_renomear(uuid, uuid, text, text) TO authenticated;