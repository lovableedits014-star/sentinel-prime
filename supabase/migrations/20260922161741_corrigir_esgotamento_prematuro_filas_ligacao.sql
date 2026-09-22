-- A tela e o seletor atomico usavam criterios diferentes. A tela contava como
-- pendentes telefones ja concluidos em outro cadastro, bloqueados por outro
-- operador e numeros invalidos; o seletor corretamente recusava parte deles.

CREATE OR REPLACE FUNCTION public.tele_list_contatos_disponiveis(
  _client_id uuid,
  _nome text,
  _senha text,
  _campanha_id uuid DEFAULT NULL
) RETURNS TABLE(
  id uuid,nome text,telefone text,cidade text,bairro text,
  ligacao_status text,vota_candidato text,candidato_alternativo text,
  operador_nome text,ligacao_em timestamptz,tipo text,tabela text,
  proxima_tentativa_em timestamptz,tentativas_count integer,
  observacao_tele text,locked_by text,locked_until timestamptz,
  campanha_id uuid,indicador_nome text,indicador_tipo text,lista_id uuid
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT c.*
  FROM public.tele_list_contatos(_client_id,_nome,_senha,_campanha_id) c
  WHERE public.tele_phone_key(c.telefone) IS NOT NULL
    AND coalesce(c.ligacao_status,'pendente') IN ('pendente','nao_atendeu','reagendou')
    AND (c.proxima_tentativa_em IS NULL OR c.proxima_tentativa_em<=now())
    AND (c.locked_until IS NULL OR c.locked_until<=now() OR c.locked_by=_nome)
    AND NOT EXISTS (
      SELECT 1
      FROM public.telemarketing_call_assignments a
      WHERE a.client_id=_client_id AND a.expires_at>now()
        AND a.operador_nome IS DISTINCT FROM _nome
        AND a.telefone_key=public.tele_phone_key(c.telefone)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.telemarketing_phone_outcomes o
      WHERE o.client_id=_client_id
        AND o.telefone_key=public.tele_phone_key(c.telefone)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.telemarketing_skip_cooldowns s
      WHERE s.client_id=_client_id
        AND s.operador_id=(SELECT public._tele_assert_operador(_client_id,_nome,_senha))
        AND s.expires_at>now()
        AND s.lock_key=coalesce(
          public.tele_phone_key(c.telefone),c.tabela||':'||c.id::text
        )
    )
  ORDER BY c.tentativas_count,c.ligacao_em NULLS FIRST,c.nome,c.id;
$$;

CREATE OR REPLACE FUNCTION public.tele_diagnostico_fila(
  _client_id uuid,_nome text,_senha text,_campanha_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_op_id uuid;
  v_filas integer;
  v_solicitada_valida boolean;
  v_total bigint;
  v_disponiveis bigint;
  v_retornos bigint;
  v_invalidos bigint;
  v_concluidos bigint;
  v_reservados bigint;
  v_pulados bigint;
BEGIN
  v_op_id:=public._tele_assert_operador(_client_id,_nome,_senha);

  SELECT count(*)::integer INTO v_filas
  FROM public.telemarketing_campanha_operadores co
  JOIN public.telemarketing_campanhas ca ON ca.id=co.campanha_id
  WHERE co.client_id=_client_id AND co.operador_id=v_op_id
    AND co.ativo=true AND ca.ativo=true;

  SELECT _campanha_id IS NULL OR EXISTS(
    SELECT 1
    FROM public.telemarketing_campanha_operadores co
    JOIN public.telemarketing_campanhas ca ON ca.id=co.campanha_id
    WHERE co.client_id=_client_id AND co.operador_id=v_op_id
      AND co.campanha_id=_campanha_id AND co.ativo=true AND ca.ativo=true
  ) INTO v_solicitada_valida;

  WITH base AS MATERIALIZED (
    SELECT c.*,public.tele_phone_key(c.telefone) phone_key
    FROM public.tele_list_contatos(_client_id,_nome,_senha,_campanha_id) c
  ), classificada AS (
    SELECT b.*,
      EXISTS(SELECT 1 FROM public.telemarketing_phone_outcomes o
        WHERE o.client_id=_client_id AND o.telefone_key=b.phone_key) concluido_global,
      EXISTS(SELECT 1 FROM public.telemarketing_call_assignments a
        WHERE a.client_id=_client_id AND a.expires_at>now()
          AND a.operador_nome IS DISTINCT FROM _nome
          AND a.telefone_key=b.phone_key) reservado_outro,
      EXISTS(SELECT 1 FROM public.telemarketing_skip_cooldowns s
        WHERE s.client_id=_client_id AND s.operador_id=v_op_id
          AND s.expires_at>now()
          AND s.lock_key=coalesce(b.phone_key,b.tabela||':'||b.id::text)) pulado_cooldown
    FROM base b
  )
  SELECT
    count(*) FILTER (WHERE coalesce(ligacao_status,'pendente') IN
      ('pendente','nao_atendeu','reagendou')),
    count(*) FILTER (WHERE phone_key IS NOT NULL
      AND coalesce(ligacao_status,'pendente') IN ('pendente','nao_atendeu','reagendou')
      AND (proxima_tentativa_em IS NULL OR proxima_tentativa_em<=now())
      AND NOT concluido_global AND NOT reservado_outro AND NOT pulado_cooldown),
    count(*) FILTER (WHERE coalesce(ligacao_status,'pendente') IN ('nao_atendeu','reagendou')
      AND proxima_tentativa_em>now()),
    count(*) FILTER (WHERE phone_key IS NULL
      AND coalesce(ligacao_status,'pendente') IN ('pendente','nao_atendeu','reagendou')),
    count(*) FILTER (WHERE phone_key IS NOT NULL AND concluido_global
      AND coalesce(ligacao_status,'pendente') IN ('pendente','nao_atendeu','reagendou')),
    count(*) FILTER (WHERE phone_key IS NOT NULL AND NOT concluido_global
      AND reservado_outro
      AND coalesce(ligacao_status,'pendente') IN ('pendente','nao_atendeu','reagendou')),
    count(*) FILTER (WHERE pulado_cooldown
      AND coalesce(ligacao_status,'pendente') IN ('pendente','nao_atendeu','reagendou'))
  INTO v_total,v_disponiveis,v_retornos,v_invalidos,v_concluidos,v_reservados,v_pulados
  FROM classificada;

  RETURN jsonb_build_object(
    'filas_autorizadas',v_filas,
    'fila_solicitada_valida',v_solicitada_valida,
    'total_pendentes_cadastrais',coalesce(v_total,0),
    'disponiveis',coalesce(v_disponiveis,0),
    'aguardando_retorno',coalesce(v_retornos,0),
    'telefones_invalidos',coalesce(v_invalidos,0),
    'ja_concluidos_outro_cadastro',coalesce(v_concluidos,0),
    'reservados_ativos',coalesce(v_reservados,0),
    'pulados_em_espera',coalesce(v_pulados,0)
  );
END;
$$;

-- O seletor tambem passa a ignorar telefone que nao pode ser discado. Mantem
-- reserva por sessao, exclusao global por telefone e transbordo entre carteiras.
CREATE OR REPLACE FUNCTION public.tele_proximo_contato(
  _client_id uuid,_nome text,_senha text,_campanha_id uuid DEFAULT NULL,
  _ttl_seconds integer DEFAULT 1800,_session_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions' AS $$
DECLARE
  v_expires timestamptz; v_cand record; v_inserted boolean; v_op_id uuid;
  v_lista_id uuid; v_session text; v_existing record; v_lock_key text;
  v_shuffle_seed text; v_existing_visible boolean;
BEGIN
  v_op_id:=public._tele_assert_operador(_client_id,_nome,_senha);
  v_session:=nullif(btrim(_session_id),'');
  v_shuffle_seed:=coalesce(v_session,v_op_id::text)||':'||
    floor(extract(epoch FROM now())/900)::bigint::text;
  SELECT lista_atual_id INTO v_lista_id
  FROM public.telemarketing_operadores WHERE id=v_op_id;

  DELETE FROM public.telemarketing_call_assignments WHERE expires_at<=now();
  DELETE FROM public.telemarketing_skip_cooldowns WHERE expires_at<=now();

  SELECT * INTO v_existing
  FROM public.telemarketing_call_assignments
  WHERE client_id=_client_id AND operador_nome=_nome
    AND session_id IS NOT DISTINCT FROM v_session AND expires_at>now()
  ORDER BY expires_at DESC LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1
      FROM public.tele_list_contatos_disponiveis(
        _client_id,_nome,_senha,_campanha_id
      ) c
      WHERE c.id=v_existing.contato_id AND c.tabela=v_existing.tabela
    ) INTO v_existing_visible;

    IF v_existing_visible THEN
      UPDATE public.telemarketing_call_assignments
      SET expires_at=now()+make_interval(secs=>greatest(_ttl_seconds,1800))
      WHERE id=v_existing.id;
      RETURN jsonb_build_object(
        'found',true,'tabela',v_existing.tabela,
        'contato_id',v_existing.contato_id,
        'expires_at',now()+make_interval(secs=>greatest(_ttl_seconds,1800)),
        'resumed',true,'lista_id',v_lista_id
      );
    END IF;
    DELETE FROM public.telemarketing_call_assignments WHERE id=v_existing.id;
  END IF;

  v_expires:=now()+make_interval(secs=>greatest(_ttl_seconds,1800));
  FOR v_cand IN
    SELECT c.tabela,c.id,c.telefone,public.tele_phone_key(c.telefone) phone_key,
      c.tentativas_count tentativas,c.ligacao_em created_at,c.ligacao_status,
      c.proxima_tentativa_em,
      CASE c.tabela WHEN 'contatos_avulsos' THEN 0
        WHEN 'eleicao_indicados' THEN 1 ELSE 2 END priority
    FROM public.tele_list_contatos_disponiveis(
      _client_id,_nome,_senha,_campanha_id
    ) c
    WHERE NOT EXISTS(
      SELECT 1 FROM public.telemarketing_skip_cooldowns s
      WHERE s.client_id=_client_id AND s.operador_id=v_op_id
        AND s.expires_at>now()
        AND s.lock_key=coalesce(public.tele_phone_key(c.telefone),c.tabela||':'||c.id::text)
    )
    ORDER BY
      CASE c.tabela WHEN 'contatos_avulsos' THEN 0
        WHEN 'eleicao_indicados' THEN 1 ELSE 2 END,
      CASE WHEN c.ligacao_status IS NULL OR c.ligacao_status='pendente' THEN 0 ELSE 1 END,
      hashtextextended(c.tabela||':'||c.id::text||':'||v_shuffle_seed,0)
    LIMIT 100
  LOOP
    v_lock_key:=coalesce(v_cand.phone_key,v_cand.tabela||':'||v_cand.id::text);
    PERFORM pg_advisory_xact_lock(
      hashtextextended(_client_id::text||':'||v_lock_key,0)
    );
    BEGIN
      INSERT INTO public.telemarketing_call_assignments(
        client_id,tabela,contato_id,operador_nome,expires_at,session_id,telefone_key
      ) VALUES(
        _client_id,v_cand.tabela,v_cand.id,_nome,v_expires,v_session,v_cand.phone_key
      );
      v_inserted:=true;
    EXCEPTION WHEN unique_violation THEN
      v_inserted:=false;
    END;
    IF v_inserted THEN
      RETURN jsonb_build_object(
        'found',true,'tabela',v_cand.tabela,'contato_id',v_cand.id,
        'expires_at',v_expires,'resumed',false,'lista_id',v_lista_id
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object('found',false,'lista_id',v_lista_id);
END;
$$;

REVOKE ALL ON FUNCTION public.tele_list_contatos_disponiveis(uuid,text,text,uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tele_diagnostico_fila(uuid,text,text,uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tele_proximo_contato(uuid,text,text,uuid,integer,text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tele_list_contatos_disponiveis(uuid,text,text,uuid)
  TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tele_diagnostico_fila(uuid,text,text,uuid)
  TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tele_proximo_contato(uuid,text,text,uuid,integer,text)
  TO anon,authenticated;

NOTIFY pgrst,'reload schema';
