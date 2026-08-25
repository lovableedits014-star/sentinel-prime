-- 1) Novas colunas por cargo
ALTER TABLE public.contratados
  ADD COLUMN IF NOT EXISTS candidato_federal text,
  ADD COLUMN IF NOT EXISTS federal_status text,
  ADD COLUMN IF NOT EXISTS candidato_senador text,
  ADD COLUMN IF NOT EXISTS senador_status text,
  ADD COLUMN IF NOT EXISTS candidato_governador text,
  ADD COLUMN IF NOT EXISTS governador_status text;

ALTER TABLE public.contratado_indicados
  ADD COLUMN IF NOT EXISTS candidato_federal text,
  ADD COLUMN IF NOT EXISTS federal_status text,
  ADD COLUMN IF NOT EXISTS candidato_senador text,
  ADD COLUMN IF NOT EXISTS senador_status text,
  ADD COLUMN IF NOT EXISTS candidato_governador text,
  ADD COLUMN IF NOT EXISTS governador_status text;

ALTER TABLE public.telemarketing_contatos_avulsos
  ADD COLUMN IF NOT EXISTS candidato_federal text,
  ADD COLUMN IF NOT EXISTS federal_status text,
  ADD COLUMN IF NOT EXISTS candidato_senador text,
  ADD COLUMN IF NOT EXISTS senador_status text,
  ADD COLUMN IF NOT EXISTS candidato_governador text,
  ADD COLUMN IF NOT EXISTS governador_status text;

ALTER TABLE public.eleicao_indicados
  ADD COLUMN IF NOT EXISTS candidato_federal text,
  ADD COLUMN IF NOT EXISTS federal_status text,
  ADD COLUMN IF NOT EXISTS candidato_senador text,
  ADD COLUMN IF NOT EXISTS senador_status text,
  ADD COLUMN IF NOT EXISTS candidato_governador text,
  ADD COLUMN IF NOT EXISTS governador_status text;

ALTER TABLE public.eleicao_pessoas
  ADD COLUMN IF NOT EXISTS candidato_federal text,
  ADD COLUMN IF NOT EXISTS federal_status text,
  ADD COLUMN IF NOT EXISTS candidato_senador text,
  ADD COLUMN IF NOT EXISTS senador_status text,
  ADD COLUMN IF NOT EXISTS candidato_governador text,
  ADD COLUMN IF NOT EXISTS governador_status text;

ALTER TABLE public.telemarketing_call_log
  ADD COLUMN IF NOT EXISTS candidato_federal text,
  ADD COLUMN IF NOT EXISTS federal_status text,
  ADD COLUMN IF NOT EXISTS candidato_senador text,
  ADD COLUMN IF NOT EXISTS senador_status text,
  ADD COLUMN IF NOT EXISTS candidato_governador text,
  ADD COLUMN IF NOT EXISTS governador_status text;

-- 2) Normalizador de nomes de candidato
CREATE OR REPLACE FUNCTION public.tele_norm_candidato(_txt text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT NULLIF(initcap(regexp_replace(btrim(coalesce(_txt,'')), '\s+', ' ', 'g')), '')
$$;

-- 3) Registro de ligação com os 4 cargos
CREATE OR REPLACE FUNCTION public.tele_registrar_ligacao(
  _client_id uuid, _nome text, _senha text, _tabela text, _id uuid,
  _ligacao_status text, _cidade text, _bairro text,
  _vota_candidato text DEFAULT NULL::text,
  _candidato_alternativo text DEFAULT NULL::text,
  _observacao text DEFAULT NULL::text,
  _proxima_tentativa_em timestamp with time zone DEFAULT NULL::timestamp with time zone,
  _candidato_federal text DEFAULT NULL::text,
  _federal_status text DEFAULT NULL::text,
  _candidato_senador text DEFAULT NULL::text,
  _senador_status text DEFAULT NULL::text,
  _candidato_governador text DEFAULT NULL::text,
  _governador_status text DEFAULT NULL::text
)
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
    candidato_governador, governador_status)
  VALUES (_client_id, _tabela, _id, _nome, v_lig,
    NULLIF(_cidade,''), NULLIF(_bairro,''), _vota_candidato, v_alt, NULLIF(_observacao,''), v_prox,
    v_fed, v_fed_st, v_sen, v_sen_st, v_gov, v_gov_st);

  RETURN jsonb_build_object('updated', v_count);
END;
$function$;