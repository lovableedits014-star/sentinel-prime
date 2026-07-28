
-- 1. Column + index for per-operator assignment
ALTER TABLE public.telemarketing_contatos_avulsos
  ADD COLUMN IF NOT EXISTS assigned_operador_id uuid NULL
  REFERENCES public.telemarketing_operadores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tele_avulsos_assigned
  ON public.telemarketing_contatos_avulsos(client_id, campanha_id, assigned_operador_id, ligacao_status);

-- 2. Assignment audit log
CREATE TABLE IF NOT EXISTS public.telemarketing_assignment_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  campanha_id uuid NULL REFERENCES public.telemarketing_campanhas(id) ON DELETE SET NULL,
  operador_id uuid NULL REFERENCES public.telemarketing_operadores(id) ON DELETE SET NULL,
  acao text NOT NULL,
  contatos_count integer NOT NULL DEFAULT 0,
  criado_por uuid NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.telemarketing_assignment_log TO authenticated;
GRANT ALL ON public.telemarketing_assignment_log TO service_role;

ALTER TABLE public.telemarketing_assignment_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "assign_log_client_read" ON public.telemarketing_assignment_log;
CREATE POLICY "assign_log_client_read" ON public.telemarketing_assignment_log
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_tele_assignment_log_client
  ON public.telemarketing_assignment_log(client_id, campanha_id, criado_em DESC);

-- 3. Helper: check the caller owns the client
CREATE OR REPLACE FUNCTION public._tele_assert_client_admin(_client_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = _client_id AND c.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Não autorizado' USING ERRCODE='42501';
  END IF;
END;
$$;

-- 4. Assign N contacts to a single operator
CREATE OR REPLACE FUNCTION public.tele_assign_contatos(
  _client_id uuid,
  _campanha_id uuid,
  _contato_ids uuid[],
  _operador_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count integer := 0;
BEGIN
  PERFORM public._tele_assert_client_admin(_client_id);

  IF _operador_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.telemarketing_operadores WHERE id = _operador_id AND client_id = _client_id
  ) THEN
    RAISE EXCEPTION 'Operador inválido' USING ERRCODE='22023';
  END IF;

  UPDATE public.telemarketing_contatos_avulsos
     SET assigned_operador_id = _operador_id
   WHERE client_id = _client_id
     AND campanha_id = _campanha_id
     AND id = ANY(_contato_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.telemarketing_assignment_log(client_id, campanha_id, operador_id, acao, contatos_count, criado_por)
    VALUES (_client_id, _campanha_id, _operador_id, CASE WHEN _operador_id IS NULL THEN 'liberar' ELSE 'atribuir' END, v_count, auth.uid());

  RETURN jsonb_build_object('updated', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.tele_assign_contatos(uuid,uuid,uuid[],uuid) TO authenticated;

-- 5. Distribute round-robin between multiple operators
CREATE OR REPLACE FUNCTION public.tele_distribute_contatos(
  _client_id uuid,
  _campanha_id uuid,
  _contato_ids uuid[],
  _operador_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_n integer;
BEGIN
  PERFORM public._tele_assert_client_admin(_client_id);

  IF _operador_ids IS NULL OR array_length(_operador_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Selecione ao menos um operador' USING ERRCODE='22023';
  END IF;

  IF EXISTS (
    SELECT unnest(_operador_ids) AS op
    EXCEPT
    SELECT id FROM public.telemarketing_operadores WHERE client_id = _client_id
  ) THEN
    RAISE EXCEPTION 'Operador inválido' USING ERRCODE='22023';
  END IF;

  v_n := array_length(_operador_ids, 1);

  WITH numbered AS (
    SELECT id, row_number() OVER (ORDER BY id) - 1 AS rn
    FROM public.telemarketing_contatos_avulsos
    WHERE client_id = _client_id
      AND campanha_id = _campanha_id
      AND id = ANY(_contato_ids)
  ),
  upd AS (
    UPDATE public.telemarketing_contatos_avulsos t
       SET assigned_operador_id = _operador_ids[(n.rn % v_n) + 1]
      FROM numbered n
     WHERE t.id = n.id
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM upd;

  INSERT INTO public.telemarketing_assignment_log(client_id, campanha_id, operador_id, acao, contatos_count, criado_por)
    VALUES (_client_id, _campanha_id, NULL, 'distribuir', v_count, auth.uid());

  RETURN jsonb_build_object('updated', v_count, 'operadores', v_n);
END;
$$;

GRANT EXECUTE ON FUNCTION public.tele_distribute_contatos(uuid,uuid,uuid[],uuid[]) TO authenticated;

-- 6. Release contacts back to the free pool
CREATE OR REPLACE FUNCTION public.tele_release_contatos(
  _client_id uuid,
  _campanha_id uuid,
  _contato_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count integer := 0;
BEGIN
  PERFORM public._tele_assert_client_admin(_client_id);

  UPDATE public.telemarketing_contatos_avulsos
     SET assigned_operador_id = NULL
   WHERE client_id = _client_id
     AND campanha_id = _campanha_id
     AND id = ANY(_contato_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.telemarketing_assignment_log(client_id, campanha_id, operador_id, acao, contatos_count, criado_por)
    VALUES (_client_id, _campanha_id, NULL, 'liberar', v_count, auth.uid());

  RETURN jsonb_build_object('updated', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.tele_release_contatos(uuid,uuid,uuid[]) TO authenticated;

-- 7. List assigned contacts of a campaign (admin panel view)
CREATE OR REPLACE FUNCTION public.tele_admin_listar_avulsos(
  _client_id uuid,
  _campanha_id uuid
)
RETURNS TABLE(
  id uuid,
  nome text,
  telefone text,
  cidade text,
  bairro text,
  ligacao_status text,
  assigned_operador_id uuid,
  assigned_operador_nome text,
  operador_nome text,
  ligacao_em timestamptz,
  tentativas_count integer
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._tele_assert_client_admin(_client_id);
  RETURN QUERY
    SELECT a.id, a.nome, a.telefone, a.cidade, a.bairro, a.ligacao_status,
           a.assigned_operador_id, op.nome, a.operador_nome, a.ligacao_em,
           COALESCE(a.tentativas_count, 0)
      FROM public.telemarketing_contatos_avulsos a
      LEFT JOIN public.telemarketing_operadores op ON op.id = a.assigned_operador_id
     WHERE a.client_id = _client_id
       AND a.campanha_id = _campanha_id
       AND a.ativo = true
     ORDER BY a.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.tele_admin_listar_avulsos(uuid,uuid) TO authenticated;

-- 8. List active campaigns available for an operator (login by name+senha)
CREATE OR REPLACE FUNCTION public.tele_operador_campanhas(
  _client_id uuid,
  _nome text,
  _senha text
)
RETURNS TABLE(
  campanha_id uuid,
  nome text,
  descricao text,
  pendentes_meus bigint,
  pendentes_livres bigint,
  total_meus bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v_operador_id uuid;
BEGIN
  v_operador_id := public._tele_assert_operador(_client_id, _nome, _senha);

  RETURN QUERY
  WITH mine AS (
    SELECT campanha_id,
           count(*) FILTER (WHERE COALESCE(ligacao_status,'pendente') IN ('pendente','nao_atendeu','reagendou')) AS pend,
           count(*) AS tot
      FROM public.telemarketing_contatos_avulsos
     WHERE client_id = _client_id AND ativo = true
       AND assigned_operador_id = v_operador_id
     GROUP BY campanha_id
  ),
  free AS (
    SELECT campanha_id,
           count(*) FILTER (WHERE COALESCE(ligacao_status,'pendente') IN ('pendente','nao_atendeu','reagendou')) AS pend
      FROM public.telemarketing_contatos_avulsos
     WHERE client_id = _client_id AND ativo = true
       AND assigned_operador_id IS NULL
     GROUP BY campanha_id
  )
  SELECT c.id, c.nome, c.descricao,
         COALESCE(m.pend, 0), COALESCE(f.pend, 0), COALESCE(m.tot, 0)
    FROM public.telemarketing_campanhas c
    LEFT JOIN mine m ON m.campanha_id = c.id
    LEFT JOIN free f ON f.campanha_id = c.id
   WHERE c.client_id = _client_id
     AND c.ativo = true
     AND (COALESCE(m.pend, 0) > 0 OR COALESCE(f.pend, 0) > 0 OR COALESCE(m.tot, 0) > 0)
   ORDER BY (COALESCE(m.pend, 0) + COALESCE(f.pend, 0)) DESC, c.nome ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.tele_operador_campanhas(uuid,text,text) TO anon, authenticated;

-- 9. Import batch with optional operator assignment
CREATE OR REPLACE FUNCTION public.tele_import_contato_avulso_batch(
  _client_id uuid,
  _campanha_id uuid,
  _rows jsonb,
  _assigned_operador_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count integer := 0;
BEGIN
  PERFORM public._tele_assert_client_admin(_client_id);

  IF _assigned_operador_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.telemarketing_operadores WHERE id = _assigned_operador_id AND client_id = _client_id
  ) THEN
    RAISE EXCEPTION 'Operador inválido' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.telemarketing_contatos_avulsos(client_id, campanha_id, nome, telefone, cidade, bairro, assigned_operador_id)
  SELECT _client_id, _campanha_id,
         NULLIF(trim(r->>'nome'),''),
         NULLIF(trim(r->>'telefone'),''),
         NULLIF(trim(r->>'cidade'),''),
         NULLIF(trim(r->>'bairro'),''),
         _assigned_operador_id
    FROM jsonb_array_elements(_rows) r
   WHERE NULLIF(trim(r->>'nome'),'') IS NOT NULL
     AND NULLIF(trim(r->>'telefone'),'') IS NOT NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF _assigned_operador_id IS NOT NULL AND v_count > 0 THEN
    INSERT INTO public.telemarketing_assignment_log(client_id, campanha_id, operador_id, acao, contatos_count, criado_por)
      VALUES (_client_id, _campanha_id, _assigned_operador_id, 'importar_atribuir', v_count, auth.uid());
  END IF;

  RETURN jsonb_build_object('inserted', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.tele_import_contato_avulso_batch(uuid,uuid,jsonb,uuid) TO authenticated;

-- 10. Update _tele_assert_operador to also return the operador id (used by tele_operador_campanhas + tele_proximo_contato).
--     We check the current return type; if it's void we change to uuid. Otherwise leave it.
DO $$
DECLARE v_ret text;
BEGIN
  SELECT pg_get_function_result(p.oid) INTO v_ret
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='_tele_assert_operador';

  IF v_ret = 'void' OR v_ret IS NULL THEN
    -- Drop and recreate so we can change return type
    EXECUTE 'DROP FUNCTION IF EXISTS public._tele_assert_operador(uuid, text, text) CASCADE';

    EXECUTE $f$
      CREATE OR REPLACE FUNCTION public._tele_assert_operador(_client_id uuid, _nome text, _senha text)
      RETURNS uuid
      LANGUAGE plpgsql
      STABLE SECURITY DEFINER
      SET search_path = public, extensions
      AS $body$
      DECLARE v_id uuid;
      BEGIN
        SELECT o.id INTO v_id
          FROM public.telemarketing_operadores o
         WHERE o.client_id = _client_id
           AND o.nome = _nome
           AND o.senha = public.hash_telemarketing_senha(_senha)
           AND o.ativo = true
           AND (o.locked_until IS NULL OR o.locked_until < now())
         LIMIT 1;
        IF v_id IS NULL THEN
          RAISE EXCEPTION 'Credenciais inválidas' USING ERRCODE='28000';
        END IF;
        RETURN v_id;
      END;
      $body$;
    $f$;

    GRANT EXECUTE ON FUNCTION public._tele_assert_operador(uuid, text, text) TO anon, authenticated;
  END IF;
END $$;

-- 11. tele_proximo_contato: filter avulsos by assigned operator
CREATE OR REPLACE FUNCTION public.tele_proximo_contato(
  _client_id uuid,
  _nome text,
  _senha text,
  _campanha_id uuid DEFAULT NULL::uuid,
  _ttl_seconds integer DEFAULT 300
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_expires timestamptz;
  v_cand record;
  v_inserted boolean;
  v_op_id uuid;
BEGIN
  BEGIN
    v_op_id := public._tele_assert_operador(_client_id, _nome, _senha);
  EXCEPTION WHEN OTHERS THEN
    -- Legacy version returns void; retry as void then look up id.
    PERFORM public._tele_assert_operador(_client_id, _nome, _senha);
    SELECT id INTO v_op_id FROM public.telemarketing_operadores
      WHERE client_id = _client_id AND nome = _nome AND ativo = true LIMIT 1;
  END;

  DELETE FROM public.telemarketing_call_assignments WHERE expires_at < now();

  v_expires := now() + make_interval(secs => GREATEST(_ttl_seconds, 60));

  FOR v_cand IN
    WITH locked_phones AS (
      SELECT DISTINCT lower(btrim(COALESCE(
        (SELECT telefone FROM public.contratados WHERE id=a.contato_id AND a.tabela='contratados'),
        (SELECT telefone FROM public.contratado_indicados WHERE id=a.contato_id AND a.tabela='contratado_indicados'),
        (SELECT telefone FROM public.telemarketing_contatos_avulsos WHERE id=a.contato_id AND a.tabela='contatos_avulsos'),
        (SELECT telefone FROM public.eleicao_indicados WHERE id=a.contato_id AND a.tabela='eleicao_indicados'),
        (SELECT telefone FROM public.eleicao_pessoas WHERE id=a.contato_id AND a.tabela='eleicao_pessoas')
      ))) AS tel
      FROM public.telemarketing_call_assignments a
      WHERE a.client_id = _client_id
        AND a.expires_at > now()
        AND a.operador_nome <> _nome
    ),
    candidates AS (
      SELECT 'contratados'::text AS tabela, c.id, c.telefone,
             COALESCE(c.tentativas_count, 0) AS tentativas,
             c.created_at, c.ligacao_status, c.proxima_tentativa_em
      FROM public.contratados c
      WHERE c.client_id = _client_id
        AND (_campanha_id IS NULL OR c.campanha_id = _campanha_id)
        AND COALESCE(c.ligacao_status,'pendente') IN ('pendente','nao_atendeu','reagendou')
      UNION ALL
      SELECT 'contratado_indicados', i.id, i.telefone,
             COALESCE(i.tentativas_count,0), i.created_at, i.ligacao_status, i.proxima_tentativa_em
      FROM public.contratado_indicados i
      WHERE i.client_id = _client_id
        AND (_campanha_id IS NULL OR i.campanha_id = _campanha_id)
        AND COALESCE(i.ligacao_status,'pendente') IN ('pendente','nao_atendeu','reagendou')
      UNION ALL
      SELECT 'contatos_avulsos', av.id, av.telefone,
             COALESCE(av.tentativas_count,0), av.created_at, av.ligacao_status, av.proxima_tentativa_em
      FROM public.telemarketing_contatos_avulsos av
      WHERE av.client_id = _client_id
        AND av.ativo = true
        AND (_campanha_id IS NULL OR av.campanha_id = _campanha_id)
        AND (av.assigned_operador_id IS NULL OR av.assigned_operador_id = v_op_id)
        AND COALESCE(av.ligacao_status,'pendente') IN ('pendente','nao_atendeu','reagendou')
      UNION ALL
      SELECT 'eleicao_indicados', ei.id, ei.telefone,
             COALESCE(ei.total_tentativas,0), ei.created_at, ei.ultimo_status_ligacao, ei.proxima_tentativa_em
      FROM public.eleicao_indicados ei
      WHERE ei.client_id = _client_id
        AND ei.campanha_id IS NOT NULL
        AND (_campanha_id IS NULL OR ei.campanha_id = _campanha_id)
        AND COALESCE(ei.ultimo_status_ligacao,'pendente') IN ('pendente','nao_atendeu','reagendou')
      UNION ALL
      SELECT 'eleicao_pessoas', p.id, p.telefone,
             COALESCE(p.tentativas_count,0), p.created_at, p.ligacao_status, p.proxima_tentativa_em
      FROM public.eleicao_pessoas p
      WHERE p.client_id = _client_id
        AND p.telefone IS NOT NULL
        AND length(btrim(p.telefone)) >= 8
        AND (_campanha_id IS NULL OR p.campanha_id = _campanha_id)
        AND COALESCE(p.ligacao_status,'pendente') IN ('pendente','nao_atendeu','reagendou')
    )
    SELECT c.tabela, c.id, c.telefone, c.tentativas, c.created_at
    FROM candidates c
    LEFT JOIN public.telemarketing_call_assignments a
      ON a.client_id = _client_id
     AND a.tabela = c.tabela
     AND a.contato_id = c.id
     AND a.expires_at > now()
    WHERE a.id IS NULL
      AND (c.proxima_tentativa_em IS NULL OR c.proxima_tentativa_em <= now())
      AND lower(btrim(COALESCE(c.telefone,''))) NOT IN (SELECT tel FROM locked_phones WHERE tel IS NOT NULL AND tel <> '')
    ORDER BY
      CASE WHEN c.ligacao_status IS NULL OR c.ligacao_status = 'pendente' THEN 0 ELSE 1 END,
      c.tentativas ASC,
      c.created_at ASC
    LIMIT 50
  LOOP
    BEGIN
      INSERT INTO public.telemarketing_call_assignments(
        client_id, tabela, contato_id, operador_nome, expires_at)
      VALUES (_client_id, v_cand.tabela, v_cand.id, _nome, v_expires);
      v_inserted := true;
    EXCEPTION WHEN unique_violation THEN
      v_inserted := false;
    END;

    IF v_inserted THEN
      RETURN jsonb_build_object(
        'found', true,
        'tabela', v_cand.tabela,
        'contato_id', v_cand.id,
        'expires_at', v_expires
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object('found', false);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.tele_proximo_contato(uuid,text,text,uuid,integer) TO anon, authenticated;

-- 12. tele_list_contatos: hide assigned avulsos from other operators
CREATE OR REPLACE FUNCTION public.tele_list_contatos(
  _client_id uuid, _nome text, _senha text, _campanha_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  id uuid, nome text, telefone text, cidade text, bairro text,
  ligacao_status text, vota_candidato text, candidato_alternativo text,
  operador_nome text, ligacao_em timestamptz,
  tipo text, tabela text,
  proxima_tentativa_em timestamptz, tentativas_count integer, observacao_tele text,
  locked_by text, locked_until timestamptz, campanha_id uuid,
  indicador_nome text, indicador_tipo text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE v_op_id uuid;
BEGIN
  BEGIN
    v_op_id := public._tele_assert_operador(_client_id, _nome, _senha);
  EXCEPTION WHEN OTHERS THEN
    PERFORM public._tele_assert_operador(_client_id, _nome, _senha);
    SELECT id INTO v_op_id FROM public.telemarketing_operadores
      WHERE client_id = _client_id AND nome = _nome AND ativo = true LIMIT 1;
  END;

  RETURN QUERY
    SELECT c.id, c.nome, c.telefone, c.cidade, c.bairro,
           c.ligacao_status, c.vota_candidato, c.candidato_alternativo,
           c.operador_nome, c.ligacao_em,
           CASE WHEN c.is_lider THEN 'lider' ELSE 'liderado' END, 'contratados'::text,
           c.proxima_tentativa_em, COALESCE(c.tentativas_count,0), c.observacao_tele,
           a.operador_nome, a.expires_at, c.campanha_id,
           NULL::text, NULL::text
    FROM public.contratados c
    LEFT JOIN public.telemarketing_call_assignments a
      ON a.client_id=c.client_id AND a.tabela='contratados' AND a.contato_id=c.id AND a.expires_at>now()
    WHERE c.client_id=_client_id
      AND (_campanha_id IS NULL OR c.campanha_id = _campanha_id)
    UNION ALL
    SELECT i.id, i.nome, i.telefone, i.cidade, i.bairro,
           i.ligacao_status, i.vota_candidato, i.candidato_alternativo,
           i.operador_nome, i.ligacao_em,
           'indicado'::text, 'contratado_indicados'::text,
           i.proxima_tentativa_em, COALESCE(i.tentativas_count,0), i.observacao_tele,
           a.operador_nome, a.expires_at, i.campanha_id,
           NULL::text, NULL::text
    FROM public.contratado_indicados i
    LEFT JOIN public.telemarketing_call_assignments a
      ON a.client_id=i.client_id AND a.tabela='contratado_indicados' AND a.contato_id=i.id AND a.expires_at>now()
    WHERE i.client_id=_client_id
      AND (_campanha_id IS NULL OR i.campanha_id = _campanha_id)
    UNION ALL
    SELECT av.id, av.nome, av.telefone, av.cidade, av.bairro,
           av.ligacao_status, av.vota_candidato, av.candidato_alternativo,
           av.operador_nome, av.ligacao_em,
           'avulso'::text, 'contatos_avulsos'::text,
           av.proxima_tentativa_em, COALESCE(av.tentativas_count,0), av.observacao_tele,
           a.operador_nome, a.expires_at, av.campanha_id,
           NULL::text, NULL::text
    FROM public.telemarketing_contatos_avulsos av
    LEFT JOIN public.telemarketing_call_assignments a
      ON a.client_id=av.client_id AND a.tabela='contatos_avulsos' AND a.contato_id=av.id AND a.expires_at>now()
    WHERE av.client_id=_client_id AND av.ativo=true
      AND (_campanha_id IS NULL OR av.campanha_id = _campanha_id)
      AND (av.assigned_operador_id IS NULL OR av.assigned_operador_id = v_op_id)
    UNION ALL
    SELECT ei.id, ei.nome, ei.telefone, ei.cidade, ei.bairro,
           ei.ultimo_status_ligacao, ei.vota_candidato, ei.candidato_alternativo,
           ei.operador_nome, ei.ultima_ligacao_em,
           'eleicao_indicado'::text, 'eleicao_indicados'::text,
           ei.proxima_tentativa_em, COALESCE(ei.total_tentativas,0), ei.observacao_tele,
           a.operador_nome, a.expires_at, ei.campanha_id,
           ep.nome, ei.indicador_tipo::text
    FROM public.eleicao_indicados ei
    LEFT JOIN public.eleicao_pessoas ep ON ep.id = ei.indicador_id
    LEFT JOIN public.telemarketing_call_assignments a
      ON a.client_id=ei.client_id AND a.tabela='eleicao_indicados' AND a.contato_id=ei.id AND a.expires_at>now()
    WHERE ei.client_id=_client_id
      AND ei.campanha_id IS NOT NULL
      AND (_campanha_id IS NULL OR ei.campanha_id = _campanha_id)
    UNION ALL
    SELECT p.id, p.nome, p.telefone, p.cidade, p.bairro,
           p.ligacao_status, p.vota_candidato, p.candidato_alternativo,
           p.operador_nome, p.ligacao_em,
           'estrutura'::text, 'eleicao_pessoas'::text,
           p.proxima_tentativa_em, COALESCE(p.tentativas_count,0), p.observacao_tele,
           a.operador_nome, a.expires_at, p.campanha_id,
           NULL::text, p.tipo::text
    FROM public.eleicao_pessoas p
    LEFT JOIN public.telemarketing_call_assignments a
      ON a.client_id=p.client_id AND a.tabela='eleicao_pessoas' AND a.contato_id=p.id AND a.expires_at>now()
    WHERE p.client_id=_client_id
      AND p.telefone IS NOT NULL
      AND length(btrim(p.telefone)) >= 8
      AND (_campanha_id IS NULL OR p.campanha_id = _campanha_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.tele_list_contatos(uuid,text,text,uuid) TO anon, authenticated;
