ALTER TABLE public.telemarketing_call_assignments
  ADD COLUMN IF NOT EXISTS session_id text;

CREATE INDEX IF NOT EXISTS idx_tele_assign_session
  ON public.telemarketing_call_assignments (client_id, operador_nome, session_id, expires_at);

CREATE OR REPLACE FUNCTION public.tele_claim_contato(
  _client_id uuid, _nome text, _senha text, _tabela text, _id uuid,
  _ttl_seconds integer DEFAULT 300, _session_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_row record; v_expires timestamptz; v_session text;
BEGIN
  PERFORM public._tele_assert_operador(_client_id, _nome, _senha);
  IF _tabela NOT IN ('contratados','contratado_indicados','contatos_avulsos','eleicao_indicados','eleicao_pessoas') THEN
    RAISE EXCEPTION 'Tabela inválida';
  END IF;
  v_session := NULLIF(btrim(_session_id), '');
  DELETE FROM public.telemarketing_call_assignments WHERE expires_at < now();
  v_expires := now() + make_interval(secs => GREATEST(_ttl_seconds,60));

  INSERT INTO public.telemarketing_call_assignments(client_id, tabela, contato_id, operador_nome, expires_at, session_id)
  VALUES (_client_id, _tabela, _id, _nome, v_expires, v_session)
  ON CONFLICT (client_id, tabela, contato_id) DO UPDATE
    SET operador_nome=EXCLUDED.operador_nome, expires_at=EXCLUDED.expires_at, session_id=EXCLUDED.session_id
    WHERE (public.telemarketing_call_assignments.operador_nome=EXCLUDED.operador_nome
           AND public.telemarketing_call_assignments.session_id IS NOT DISTINCT FROM EXCLUDED.session_id)
       OR public.telemarketing_call_assignments.expires_at<now()
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    SELECT * INTO v_row FROM public.telemarketing_call_assignments
    WHERE client_id=_client_id AND tabela=_tabela AND contato_id=_id;
    RETURN jsonb_build_object('claimed', false, 'operador_nome', v_row.operador_nome, 'expires_at', v_row.expires_at);
  END IF;
  RETURN jsonb_build_object('claimed', true, 'expires_at', v_row.expires_at);
END;
$function$;

CREATE OR REPLACE FUNCTION public.tele_heartbeat_contato(
  _client_id uuid, _nome text, _senha text, _tabela text, _id uuid,
  _ttl_seconds integer DEFAULT 300, _session_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_count integer;
BEGIN
  PERFORM public._tele_assert_operador(_client_id, _nome, _senha);
  UPDATE public.telemarketing_call_assignments
     SET expires_at = now() + make_interval(secs => GREATEST(_ttl_seconds, 60))
   WHERE client_id = _client_id AND tabela = _tabela AND contato_id = _id
     AND operador_nome = _nome
     AND session_id IS NOT DISTINCT FROM NULLIF(btrim(_session_id), '');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('renewed', v_count > 0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.tele_release_contato(
  _client_id uuid, _nome text, _senha text, _tabela text, _id uuid,
  _session_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  PERFORM public._tele_assert_operador(_client_id, _nome, _senha);
  DELETE FROM public.telemarketing_call_assignments
   WHERE client_id=_client_id AND tabela=_tabela AND contato_id=_id
     AND operador_nome=_nome
     AND session_id IS NOT DISTINCT FROM NULLIF(btrim(_session_id), '');
  RETURN jsonb_build_object('released', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.tele_proximo_contato(
  _client_id uuid, _nome text, _senha text, _campanha_id uuid DEFAULT NULL,
  _ttl_seconds integer DEFAULT 300, _session_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_expires timestamptz; v_cand record; v_inserted boolean; v_op_id uuid; v_lista_id uuid; v_session text;
BEGIN
  v_op_id := public._tele_assert_operador(_client_id, _nome, _senha);
  v_session := NULLIF(btrim(_session_id), '');
  SELECT lista_atual_id INTO v_lista_id FROM public.telemarketing_operadores WHERE id=v_op_id;
  DELETE FROM public.telemarketing_call_assignments WHERE expires_at < now();
  v_expires := now() + make_interval(secs => GREATEST(_ttl_seconds,60));

  FOR v_cand IN
    WITH allowed AS (
      SELECT co.campanha_id FROM public.telemarketing_campanha_operadores co
       WHERE co.client_id=_client_id AND co.operador_id=v_op_id AND co.ativo=true
    ), candidates AS (
      SELECT 'contatos_avulsos'::text tabela,av.id,av.telefone,coalesce(av.tentativas_count,0) tentativas,av.created_at,av.ligacao_status,av.proxima_tentativa_em,0 priority
      FROM public.telemarketing_contatos_avulsos av
      WHERE av.client_id=_client_id AND av.ativo=true AND (_campanha_id IS NULL OR av.campanha_id=_campanha_id)
        AND av.campanha_id IN (SELECT allowed.campanha_id FROM allowed)
        AND (av.assigned_operador_id IS NULL OR av.assigned_operador_id=v_op_id)
        AND (v_lista_id IS NULL OR av.lista_id=v_lista_id)
        AND coalesce(av.ligacao_status,'pendente') IN ('pendente','nao_atendeu','reagendou')
      UNION ALL
      SELECT 'contratados',c.id,c.telefone,coalesce(c.tentativas_count,0),c.created_at,c.ligacao_status,c.proxima_tentativa_em,2
      FROM public.contratados c WHERE v_lista_id IS NULL AND c.client_id=_client_id
        AND (_campanha_id IS NULL OR c.campanha_id=_campanha_id) AND c.campanha_id IN (SELECT allowed.campanha_id FROM allowed)
        AND coalesce(c.ligacao_status,'pendente') IN ('pendente','nao_atendeu','reagendou')
      UNION ALL
      SELECT 'contratado_indicados',i.id,i.telefone,coalesce(i.tentativas_count,0),i.created_at,i.ligacao_status,i.proxima_tentativa_em,2
      FROM public.contratado_indicados i WHERE v_lista_id IS NULL AND i.client_id=_client_id
        AND (_campanha_id IS NULL OR i.campanha_id=_campanha_id) AND i.campanha_id IN (SELECT allowed.campanha_id FROM allowed)
        AND coalesce(i.ligacao_status,'pendente') IN ('pendente','nao_atendeu','reagendou')
      UNION ALL
      SELECT 'eleicao_indicados',ei.id,ei.telefone,coalesce(ei.total_tentativas,0),ei.created_at,ei.ultimo_status_ligacao,ei.proxima_tentativa_em,1
      FROM public.eleicao_indicados ei WHERE v_lista_id IS NULL AND ei.client_id=_client_id AND ei.campanha_id IS NOT NULL
        AND (_campanha_id IS NULL OR ei.campanha_id=_campanha_id) AND ei.campanha_id IN (SELECT allowed.campanha_id FROM allowed)
        AND (ei.assigned_operador_id IS NULL OR ei.assigned_operador_id=v_op_id)
        AND coalesce(ei.ultimo_status_ligacao,'pendente') IN ('pendente','nao_atendeu','reagendou')
      UNION ALL
      SELECT 'eleicao_pessoas',p.id,p.telefone,coalesce(p.tentativas_count,0),p.created_at,p.ligacao_status,p.proxima_tentativa_em,2
      FROM public.eleicao_pessoas p WHERE v_lista_id IS NULL AND p.client_id=_client_id AND p.campanha_id IS NOT NULL
        AND p.telefone IS NOT NULL AND length(btrim(p.telefone))>=8
        AND (_campanha_id IS NULL OR p.campanha_id=_campanha_id) AND p.campanha_id IN (SELECT allowed.campanha_id FROM allowed)
        AND (p.assigned_operador_id IS NULL OR p.assigned_operador_id=v_op_id)
        AND coalesce(p.ligacao_status,'pendente') IN ('pendente','nao_atendeu','reagendou')
    )
    SELECT c.tabela,c.id,c.telefone,c.tentativas,c.created_at
      FROM candidates c
      LEFT JOIN public.telemarketing_call_assignments a
        ON a.client_id=_client_id AND a.tabela=c.tabela AND a.contato_id=c.id AND a.expires_at>now()
     WHERE a.id IS NULL
       AND (c.proxima_tentativa_em IS NULL OR c.proxima_tentativa_em<=now())
     ORDER BY c.priority ASC,
       CASE WHEN c.ligacao_status IS NULL OR c.ligacao_status='pendente' THEN 0 ELSE 1 END,
       c.tentativas ASC,c.created_at ASC
     LIMIT 50
  LOOP
    BEGIN
      INSERT INTO public.telemarketing_call_assignments(client_id,tabela,contato_id,operador_nome,expires_at,session_id)
      VALUES (_client_id,v_cand.tabela,v_cand.id,_nome,v_expires,v_session);
      v_inserted := true;
    EXCEPTION WHEN unique_violation THEN v_inserted := false;
    END;
    IF v_inserted THEN
      RETURN jsonb_build_object('found',true,'tabela',v_cand.tabela,'contato_id',v_cand.id,'expires_at',v_expires,'lista_id',v_lista_id);
    END IF;
  END LOOP;
  RETURN jsonb_build_object('found',false,'lista_id',v_lista_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.tele_diagnostico_fila(
  _client_id uuid, _nome text, _senha text, _campanha_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_op_id uuid; v_lista_id uuid; v_filas int; v_solicitada_valida boolean; v_disponiveis bigint; v_retornos bigint; v_reservados bigint;
BEGIN
  v_op_id := public._tele_assert_operador(_client_id,_nome,_senha);
  SELECT lista_atual_id INTO v_lista_id FROM public.telemarketing_operadores WHERE id=v_op_id;
  SELECT count(*) INTO v_filas FROM public.telemarketing_campanha_operadores co JOIN public.telemarketing_campanhas c ON c.id=co.campanha_id
   WHERE co.client_id=_client_id AND co.operador_id=v_op_id AND co.ativo=true AND c.ativo=true;
  SELECT _campanha_id IS NULL OR EXISTS(SELECT 1 FROM public.telemarketing_campanha_operadores co JOIN public.telemarketing_campanhas c ON c.id=co.campanha_id
   WHERE co.client_id=_client_id AND co.operador_id=v_op_id AND co.campanha_id=_campanha_id AND co.ativo=true AND c.ativo=true) INTO v_solicitada_valida;
  SELECT count(*) FILTER (WHERE coalesce(av.ligacao_status,'pendente')='pendente' OR (coalesce(av.ligacao_status,'pendente') IN ('nao_atendeu','reagendou') AND (av.proxima_tentativa_em IS NULL OR av.proxima_tentativa_em<=now()))),
         count(*) FILTER (WHERE coalesce(av.ligacao_status,'pendente') IN ('nao_atendeu','reagendou') AND av.proxima_tentativa_em>now())
    INTO v_disponiveis,v_retornos
    FROM public.telemarketing_contatos_avulsos av
   WHERE av.client_id=_client_id AND av.ativo=true
     AND (_campanha_id IS NULL OR av.campanha_id=_campanha_id)
     AND av.campanha_id IN (SELECT co.campanha_id FROM public.telemarketing_campanha_operadores co WHERE co.client_id=_client_id AND co.operador_id=v_op_id AND co.ativo=true)
     AND (av.assigned_operador_id IS NULL OR av.assigned_operador_id=v_op_id)
     AND (v_lista_id IS NULL OR av.lista_id=v_lista_id);
  SELECT count(*) INTO v_reservados FROM public.telemarketing_call_assignments a WHERE a.client_id=_client_id AND a.expires_at>now();
  RETURN jsonb_build_object('filas_autorizadas',v_filas,'fila_solicitada_valida',v_solicitada_valida,'disponiveis',coalesce(v_disponiveis,0),'aguardando_retorno',coalesce(v_retornos,0),'reservados_ativos',v_reservados);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.tele_claim_contato(uuid,text,text,text,uuid,integer,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tele_heartbeat_contato(uuid,text,text,text,uuid,integer,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tele_release_contato(uuid,text,text,text,uuid,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tele_proximo_contato(uuid,text,text,uuid,integer,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tele_diagnostico_fila(uuid,text,text,uuid) TO anon, authenticated;