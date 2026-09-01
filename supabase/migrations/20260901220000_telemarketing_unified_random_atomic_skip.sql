-- Lista unificada concorrente:
-- 1) cada sessao recebe uma ordem embaralhada diferente;
-- 2) pular confirma a liberacao da reserva antes de buscar outro contato;
-- 3) a unicidade global por telefone continua impedindo atendimento duplicado.

CREATE OR REPLACE FUNCTION public.tele_skip_contato(
  _client_id uuid,_nome text,_senha text,_tabela text,_id uuid,
  _session_id text DEFAULT NULL,_motivo text DEFAULT NULL,_cooldown_seconds integer DEFAULT 900
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_op_id uuid; v_phone text; v_key text; v_released integer:=0;
BEGIN
  v_op_id:=public._tele_assert_operador(_client_id,_nome,_senha);
  v_phone:=public._tele_contact_phone_key(_client_id,_tabela,_id);
  v_key:=COALESCE(v_phone,_tabela||':'||_id::text);

  -- Serializa pulo e nova reserva do mesmo telefone.
  PERFORM pg_advisory_xact_lock(hashtextextended(_client_id::text||':'||v_key,0));

  INSERT INTO public.telemarketing_skip_cooldowns(
    client_id,operador_id,lock_key,tabela,contato_id,motivo,expires_at
  ) VALUES(
    _client_id,v_op_id,v_key,_tabela,_id,NULLIF(btrim(_motivo),''),
    now()+make_interval(secs=>GREATEST(_cooldown_seconds,300))
  )
  ON CONFLICT(client_id,operador_id,lock_key) DO UPDATE SET
    tabela=EXCLUDED.tabela,contato_id=EXCLUDED.contato_id,motivo=EXCLUDED.motivo,
    expires_at=EXCLUDED.expires_at,created_at=now();

  DELETE FROM public.telemarketing_call_assignments
  WHERE client_id=_client_id AND operador_nome=_nome
    AND session_id IS NOT DISTINCT FROM NULLIF(btrim(_session_id),'')
    AND ((v_phone IS NOT NULL AND telefone_key=v_phone)
      OR (v_phone IS NULL AND tabela=_tabela AND contato_id=_id));
  GET DIAGNOSTICS v_released=ROW_COUNT;

  RETURN jsonb_build_object(
    'skipped',true,'released',v_released>0,
    'cooldown_until',now()+make_interval(secs=>GREATEST(_cooldown_seconds,300))
  );
END;$function$;

CREATE OR REPLACE FUNCTION public.tele_proximo_contato(
  _client_id uuid,_nome text,_senha text,_campanha_id uuid DEFAULT NULL,
  _ttl_seconds integer DEFAULT 1800,_session_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions' AS $function$
DECLARE
  v_expires timestamptz; v_cand record; v_inserted boolean; v_op_id uuid;
  v_lista_id uuid; v_session text; v_existing record; v_lock_key text;
  v_shuffle_seed text;
BEGIN
  v_op_id:=public._tele_assert_operador(_client_id,_nome,_senha);
  v_session:=NULLIF(btrim(_session_id),'');
  -- Sessoes/aparelhos diferentes percorrem a mesma fila em ordens diferentes.
  v_shuffle_seed:=coalesce(v_session,v_op_id::text)||':'||floor(extract(epoch FROM now())/900)::bigint::text;
  SELECT lista_atual_id INTO v_lista_id FROM public.telemarketing_operadores WHERE id=v_op_id;
  DELETE FROM public.telemarketing_call_assignments WHERE expires_at<=now();
  DELETE FROM public.telemarketing_skip_cooldowns WHERE expires_at<=now();

  SELECT * INTO v_existing FROM public.telemarketing_call_assignments
  WHERE client_id=_client_id AND operador_nome=_nome
    AND session_id IS NOT DISTINCT FROM v_session AND expires_at>now()
  ORDER BY expires_at DESC LIMIT 1;
  IF v_existing.id IS NOT NULL THEN
    UPDATE public.telemarketing_call_assignments
    SET expires_at=now()+make_interval(secs=>GREATEST(_ttl_seconds,1800))
    WHERE id=v_existing.id;
    RETURN jsonb_build_object('found',true,'tabela',v_existing.tabela,
      'contato_id',v_existing.contato_id,'expires_at',now()+make_interval(secs=>GREATEST(_ttl_seconds,1800)),
      'resumed',true,'lista_id',v_lista_id);
  END IF;

  v_expires:=now()+make_interval(secs=>GREATEST(_ttl_seconds,1800));
  FOR v_cand IN
    WITH allowed AS(
      SELECT co.campanha_id FROM public.telemarketing_campanha_operadores co
      WHERE co.client_id=_client_id AND co.operador_id=v_op_id AND co.ativo=true
    ), candidates AS(
      SELECT 'contatos_avulsos'::text tabela,av.id,av.telefone,
        public.tele_phone_key(av.telefone) phone_key,COALESCE(av.tentativas_count,0) tentativas,
        av.created_at,av.ligacao_status,av.proxima_tentativa_em,0 priority
      FROM public.telemarketing_contatos_avulsos av
      WHERE av.client_id=_client_id AND av.ativo=true
        AND (_campanha_id IS NULL OR av.campanha_id=_campanha_id)
        AND av.campanha_id IN(SELECT campanha_id FROM allowed)
        AND public.tele_assign_visivel(_client_id,av.campanha_id,av.assigned_operador_id,v_op_id)
        AND (v_lista_id IS NULL OR av.lista_id=v_lista_id)
        AND COALESCE(av.ligacao_status,'pendente') IN('pendente','nao_atendeu','reagendou')
      UNION ALL
      SELECT 'contratados',c.id,c.telefone,public.tele_phone_key(c.telefone),COALESCE(c.tentativas_count,0),c.created_at,c.ligacao_status,c.proxima_tentativa_em,2
      FROM public.contratados c WHERE v_lista_id IS NULL AND c.client_id=_client_id
        AND (_campanha_id IS NULL OR c.campanha_id=_campanha_id) AND c.campanha_id IN(SELECT campanha_id FROM allowed)
        AND COALESCE(c.ligacao_status,'pendente') IN('pendente','nao_atendeu','reagendou')
      UNION ALL
      SELECT 'contratado_indicados',i.id,i.telefone,public.tele_phone_key(i.telefone),COALESCE(i.tentativas_count,0),i.created_at,i.ligacao_status,i.proxima_tentativa_em,2
      FROM public.contratado_indicados i WHERE v_lista_id IS NULL AND i.client_id=_client_id
        AND (_campanha_id IS NULL OR i.campanha_id=_campanha_id) AND i.campanha_id IN(SELECT campanha_id FROM allowed)
        AND COALESCE(i.ligacao_status,'pendente') IN('pendente','nao_atendeu','reagendou')
      UNION ALL
      SELECT 'eleicao_indicados',ei.id,ei.telefone,public.tele_phone_key(ei.telefone),COALESCE(ei.total_tentativas,0),ei.created_at,ei.ultimo_status_ligacao,ei.proxima_tentativa_em,1
      FROM public.eleicao_indicados ei WHERE v_lista_id IS NULL AND ei.client_id=_client_id AND ei.campanha_id IS NOT NULL
        AND (_campanha_id IS NULL OR ei.campanha_id=_campanha_id) AND ei.campanha_id IN(SELECT campanha_id FROM allowed)
        AND public.tele_assign_visivel(_client_id,ei.campanha_id,ei.assigned_operador_id,v_op_id)
        AND COALESCE(ei.ultimo_status_ligacao,'pendente') IN('pendente','nao_atendeu','reagendou')
      UNION ALL
      SELECT 'eleicao_pessoas',p.id,p.telefone,public.tele_phone_key(p.telefone),COALESCE(p.tentativas_count,0),p.created_at,p.ligacao_status,p.proxima_tentativa_em,2
      FROM public.eleicao_pessoas p WHERE v_lista_id IS NULL AND p.client_id=_client_id AND p.campanha_id IS NOT NULL
        AND p.telefone IS NOT NULL AND length(btrim(p.telefone))>=8
        AND (_campanha_id IS NULL OR p.campanha_id=_campanha_id) AND p.campanha_id IN(SELECT campanha_id FROM allowed)
        AND public.tele_assign_visivel(_client_id,p.campanha_id,p.assigned_operador_id,v_op_id)
        AND COALESCE(p.ligacao_status,'pendente') IN('pendente','nao_atendeu','reagendou')
    )
    SELECT c.* FROM candidates c
    WHERE (c.proxima_tentativa_em IS NULL OR c.proxima_tentativa_em<=now())
      AND NOT EXISTS(SELECT 1 FROM public.telemarketing_call_assignments a
        WHERE a.client_id=_client_id AND a.expires_at>now() AND
          ((c.phone_key IS NOT NULL AND a.telefone_key=c.phone_key)
          OR (c.phone_key IS NULL AND a.tabela=c.tabela AND a.contato_id=c.id)))
      AND NOT EXISTS(SELECT 1 FROM public.telemarketing_skip_cooldowns s
        WHERE s.client_id=_client_id AND s.operador_id=v_op_id AND s.expires_at>now()
          AND s.lock_key=COALESCE(c.phone_key,c.tabela||':'||c.id::text))
      AND NOT EXISTS(SELECT 1 FROM public.telemarketing_phone_outcomes o
        WHERE o.client_id=_client_id AND c.phone_key IS NOT NULL AND o.telefone_key=c.phone_key)
    ORDER BY c.priority,
      CASE WHEN c.ligacao_status IS NULL OR c.ligacao_status='pendente' THEN 0 ELSE 1 END,
      hashtextextended(c.tabela||':'||c.id::text||':'||v_shuffle_seed,0)
    LIMIT 100
  LOOP
    v_lock_key:=COALESCE(v_cand.phone_key,v_cand.tabela||':'||v_cand.id::text);
    PERFORM pg_advisory_xact_lock(hashtextextended(_client_id::text||':'||v_lock_key,0));
    BEGIN
      INSERT INTO public.telemarketing_call_assignments(
        client_id,tabela,contato_id,operador_nome,expires_at,session_id,telefone_key
      ) VALUES(_client_id,v_cand.tabela,v_cand.id,_nome,v_expires,v_session,v_cand.phone_key);
      v_inserted:=true;
    EXCEPTION WHEN unique_violation THEN v_inserted:=false;
    END;
    IF v_inserted THEN
      RETURN jsonb_build_object('found',true,'tabela',v_cand.tabela,
        'contato_id',v_cand.id,'expires_at',v_expires,'resumed',false,'lista_id',v_lista_id);
    END IF;
  END LOOP;
  RETURN jsonb_build_object('found',false,'lista_id',v_lista_id);
END;$function$;

REVOKE ALL ON FUNCTION public.tele_skip_contato(uuid,text,text,text,uuid,text,text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tele_proximo_contato(uuid,text,text,uuid,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tele_skip_contato(uuid,text,text,text,uuid,text,text,integer) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tele_proximo_contato(uuid,text,text,uuid,integer,text) TO anon,authenticated;
NOTIFY pgrst, 'reload schema';
