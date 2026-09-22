-- Prioriza globalmente contatos nunca ligados e, depois, os que possuem menos
-- tentativas. Nenhum contato deixa a fila apenas por atingir cinco tentativas.

DROP TRIGGER IF EXISTS trg_tele_auto_inactivate_contact
  ON public.telemarketing_call_log;

-- Reativa somente quem foi retirado automaticamente pelo antigo limite. Os
-- resultados definitivos (atendeu, recusou e invalido) permanecem intocados.
DELETE FROM public.telemarketing_phone_outcomes o
USING public.telemarketing_inactive_contacts i
WHERE i.client_id=o.client_id
  AND i.telefone_key=o.telefone_key
  AND i.reativado_em IS NULL
  AND i.motivo='limite_tentativas_sem_atendimento'
  AND o.ligacao_status='inativo';

UPDATE public.telemarketing_inactive_contacts SET
  reativado_em=now(),
  reativado_por='migracao_prioridade_nunca_ligados'
WHERE reativado_em IS NULL
  AND motivo='limite_tentativas_sem_atendimento';

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
      coalesce(c.tentativas_count,0) tentativas,c.ligacao_em created_at,
      c.ligacao_status,c.proxima_tentativa_em,
      CASE c.tabela WHEN 'contatos_avulsos' THEN 0
        WHEN 'eleicao_indicados' THEN 1 ELSE 2 END priority
    FROM public.tele_list_contatos_disponiveis(
      _client_id,_nome,_senha,_campanha_id
    ) c
    WHERE NOT EXISTS(
      SELECT 1 FROM public.telemarketing_skip_cooldowns s
      WHERE s.client_id=_client_id AND s.operador_id=v_op_id
        AND s.expires_at>now()
        AND s.lock_key=coalesce(
          public.tele_phone_key(c.telefone),c.tabela||':'||c.id::text
        )
    )
    ORDER BY
      coalesce(c.tentativas_count,0),
      coalesce(c.proxima_tentativa_em,c.ligacao_em,'-infinity'::timestamptz),
      CASE c.tabela WHEN 'contatos_avulsos' THEN 0
        WHEN 'eleicao_indicados' THEN 1 ELSE 2 END,
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

REVOKE ALL ON FUNCTION public.tele_proximo_contato(
  uuid,text,text,uuid,integer,text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tele_proximo_contato(
  uuid,text,text,uuid,integer,text
) TO anon,authenticated;

COMMENT ON FUNCTION public.tele_proximo_contato(
  uuid,text,text,uuid,integer,text
) IS 'Entrega primeiro contatos nunca ligados e depois os de menor numero de tentativas, preservando reservas atomicas.';

NOTIFY pgrst,'reload schema';
