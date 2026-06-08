
ALTER TABLE public.contratados
  ADD COLUMN IF NOT EXISTS proxima_tentativa_em timestamptz,
  ADD COLUMN IF NOT EXISTS tentativas_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS observacao_tele text;

ALTER TABLE public.contratado_indicados
  ADD COLUMN IF NOT EXISTS proxima_tentativa_em timestamptz,
  ADD COLUMN IF NOT EXISTS tentativas_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS observacao_tele text;

CREATE TABLE IF NOT EXISTS public.telemarketing_call_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  tabela text NOT NULL CHECK (tabela IN ('contratados','contratado_indicados')),
  contato_id uuid NOT NULL,
  operador_nome text NOT NULL,
  ligacao_status text NOT NULL,
  vota_candidato text,
  candidato_alternativo text,
  cidade text,
  bairro text,
  observacao text,
  proxima_tentativa_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tele_call_log_contato ON public.telemarketing_call_log (client_id, tabela, contato_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tele_call_log_operador ON public.telemarketing_call_log (client_id, operador_nome, created_at DESC);
GRANT SELECT ON public.telemarketing_call_log TO authenticated;
GRANT ALL ON public.telemarketing_call_log TO service_role;
ALTER TABLE public.telemarketing_call_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tele log: client owner read" ON public.telemarketing_call_log;
CREATE POLICY "Tele log: client owner read"
  ON public.telemarketing_call_log FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = telemarketing_call_log.client_id AND c.user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.telemarketing_call_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  tabela text NOT NULL CHECK (tabela IN ('contratados','contratado_indicados')),
  contato_id uuid NOT NULL,
  operador_nome text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, tabela, contato_id)
);
CREATE INDEX IF NOT EXISTS idx_tele_assign_expires ON public.telemarketing_call_assignments (expires_at);
GRANT SELECT ON public.telemarketing_call_assignments TO authenticated;
GRANT ALL ON public.telemarketing_call_assignments TO service_role;
ALTER TABLE public.telemarketing_call_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tele assign: client owner read" ON public.telemarketing_call_assignments;
CREATE POLICY "Tele assign: client owner read"
  ON public.telemarketing_call_assignments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = telemarketing_call_assignments.client_id AND c.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.tele_claim_contato(
  _client_id uuid, _nome text, _senha text,
  _tabela text, _id uuid, _ttl_seconds integer DEFAULT 300
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions'
AS $$
DECLARE v_row record; v_expires timestamptz;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.telemarketing_operadores o
    WHERE o.client_id = _client_id AND o.nome = _nome
      AND o.senha = extensions.crypt(_senha, o.senha) AND o.ativo = true
  ) THEN RAISE EXCEPTION 'Operador inválido' USING ERRCODE = '42501'; END IF;
  IF _tabela NOT IN ('contratados','contratado_indicados') THEN RAISE EXCEPTION 'Tabela inválida'; END IF;

  DELETE FROM public.telemarketing_call_assignments WHERE expires_at < now();
  v_expires := now() + make_interval(secs => GREATEST(_ttl_seconds, 60));

  INSERT INTO public.telemarketing_call_assignments(client_id, tabela, contato_id, operador_nome, expires_at)
  VALUES (_client_id, _tabela, _id, _nome, v_expires)
  ON CONFLICT (client_id, tabela, contato_id) DO UPDATE
    SET operador_nome = EXCLUDED.operador_nome, expires_at = EXCLUDED.expires_at
    WHERE public.telemarketing_call_assignments.operador_nome = EXCLUDED.operador_nome
       OR public.telemarketing_call_assignments.expires_at < now()
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    SELECT * INTO v_row FROM public.telemarketing_call_assignments
    WHERE client_id=_client_id AND tabela=_tabela AND contato_id=_id;
    RETURN jsonb_build_object('claimed', false, 'operador_nome', v_row.operador_nome, 'expires_at', v_row.expires_at);
  END IF;
  RETURN jsonb_build_object('claimed', true, 'expires_at', v_row.expires_at);
END;
$$;
GRANT EXECUTE ON FUNCTION public.tele_claim_contato(uuid,text,text,text,uuid,integer) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.tele_release_contato(
  _client_id uuid, _nome text, _senha text, _tabela text, _id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.telemarketing_operadores o
    WHERE o.client_id = _client_id AND o.nome = _nome
      AND o.senha = extensions.crypt(_senha, o.senha) AND o.ativo = true
  ) THEN RAISE EXCEPTION 'Operador inválido' USING ERRCODE = '42501'; END IF;
  DELETE FROM public.telemarketing_call_assignments
  WHERE client_id=_client_id AND tabela=_tabela AND contato_id=_id AND operador_nome=_nome;
  RETURN jsonb_build_object('released', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.tele_release_contato(uuid,text,text,text,uuid) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.tele_registrar_ligacao(uuid,text,text,text,uuid,text,text,text,text,text);
CREATE OR REPLACE FUNCTION public.tele_registrar_ligacao(
  _client_id uuid, _nome text, _senha text, _tabela text, _id uuid,
  _ligacao_status text, _cidade text, _bairro text,
  _vota_candidato text DEFAULT NULL, _candidato_alternativo text DEFAULT NULL,
  _observacao text DEFAULT NULL, _proxima_tentativa_em timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions'
AS $$
DECLARE v_count integer := 0; v_status text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.telemarketing_operadores o
    WHERE o.client_id = _client_id AND o.nome = _nome
      AND o.senha = extensions.crypt(_senha, o.senha) AND o.ativo = true
  ) THEN RAISE EXCEPTION 'Operador inválido' USING ERRCODE = '42501'; END IF;
  IF _ligacao_status NOT IN ('atendeu','nao_atendeu','recusou','pendente','reagendou') THEN
    RAISE EXCEPTION 'Status inválido';
  END IF;

  IF _tabela = 'contratados' THEN
    UPDATE public.contratados
    SET ligacao_status=_ligacao_status, operador_nome=_nome, ligacao_em=now(),
        tentativas_count=COALESCE(tentativas_count,0)+1,
        proxima_tentativa_em=_proxima_tentativa_em,
        observacao_tele=COALESCE(NULLIF(_observacao,''), observacao_tele),
        cidade=COALESCE(NULLIF(_cidade,''), cidade),
        bairro=COALESCE(NULLIF(_bairro,''), bairro),
        vota_candidato=CASE WHEN _ligacao_status='atendeu' THEN _vota_candidato ELSE vota_candidato END,
        candidato_alternativo=CASE WHEN _ligacao_status='atendeu' THEN _candidato_alternativo ELSE candidato_alternativo END
    WHERE id=_id AND client_id=_client_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSIF _tabela='contratado_indicados' THEN
    v_status := CASE WHEN _ligacao_status='atendeu' AND _vota_candidato='sim' THEN 'confirmado'
                     WHEN _ligacao_status='atendeu' AND _vota_candidato='nao' THEN 'rejeitado'
                     ELSE NULL END;
    UPDATE public.contratado_indicados
    SET ligacao_status=_ligacao_status, operador_nome=_nome, ligacao_em=now(),
        tentativas_count=COALESCE(tentativas_count,0)+1,
        proxima_tentativa_em=_proxima_tentativa_em,
        observacao_tele=COALESCE(NULLIF(_observacao,''), observacao_tele),
        cidade=COALESCE(NULLIF(_cidade,''), cidade),
        bairro=COALESCE(NULLIF(_bairro,''), bairro),
        vota_candidato=CASE WHEN _ligacao_status='atendeu' THEN _vota_candidato ELSE vota_candidato END,
        candidato_alternativo=CASE WHEN _ligacao_status='atendeu' THEN _candidato_alternativo ELSE candidato_alternativo END,
        status=COALESCE(v_status, status)
    WHERE id=_id AND client_id=_client_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSE RAISE EXCEPTION 'Tabela inválida'; END IF;

  INSERT INTO public.telemarketing_call_log(
    client_id, tabela, contato_id, operador_nome, ligacao_status,
    vota_candidato, candidato_alternativo, cidade, bairro, observacao, proxima_tentativa_em
  ) VALUES (
    _client_id, _tabela, _id, _nome, _ligacao_status,
    _vota_candidato, _candidato_alternativo, _cidade, _bairro, _observacao, _proxima_tentativa_em
  );

  DELETE FROM public.telemarketing_call_assignments
  WHERE client_id=_client_id AND tabela=_tabela AND contato_id=_id AND operador_nome=_nome;

  RETURN jsonb_build_object('updated', v_count, 'logged', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.tele_registrar_ligacao(uuid,text,text,text,uuid,text,text,text,text,text,text,timestamptz) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.tele_list_contatos(uuid,text,text);
CREATE OR REPLACE FUNCTION public.tele_list_contatos(
  _client_id uuid, _nome text, _senha text
) RETURNS TABLE(
  id uuid, nome text, telefone text, cidade text, bairro text,
  ligacao_status text, vota_candidato text, candidato_alternativo text,
  operador_nome text, ligacao_em timestamptz, tipo text, tabela text,
  proxima_tentativa_em timestamptz, tentativas_count integer, observacao_tele text,
  locked_by text, locked_until timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','extensions'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.telemarketing_operadores o
    WHERE o.client_id = _client_id AND o.nome = _nome
      AND o.senha = extensions.crypt(_senha, o.senha) AND o.ativo = true
  ) THEN RAISE EXCEPTION 'Operador inválido' USING ERRCODE = '42501'; END IF;

  RETURN QUERY
    SELECT c.id, c.nome, c.telefone, c.cidade, c.bairro,
           c.ligacao_status, c.vota_candidato, c.candidato_alternativo,
           c.operador_nome, c.ligacao_em,
           CASE WHEN c.is_lider THEN 'lider' ELSE 'liderado' END,
           'contratados'::text,
           c.proxima_tentativa_em, COALESCE(c.tentativas_count,0), c.observacao_tele,
           a.operador_nome, a.expires_at
    FROM public.contratados c
    LEFT JOIN public.telemarketing_call_assignments a
      ON a.client_id=c.client_id AND a.tabela='contratados' AND a.contato_id=c.id AND a.expires_at>now()
    WHERE c.client_id=_client_id
    UNION ALL
    SELECT i.id, i.nome, i.telefone, i.cidade, i.bairro,
           i.ligacao_status, i.vota_candidato, i.candidato_alternativo,
           i.operador_nome, i.ligacao_em,
           'indicado'::text, 'contratado_indicados'::text,
           i.proxima_tentativa_em, COALESCE(i.tentativas_count,0), i.observacao_tele,
           a.operador_nome, a.expires_at
    FROM public.contratado_indicados i
    LEFT JOIN public.telemarketing_call_assignments a
      ON a.client_id=i.client_id AND a.tabela='contratado_indicados' AND a.contato_id=i.id AND a.expires_at>now()
    WHERE i.client_id=_client_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.tele_list_contatos(uuid,text,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.tele_get_contato_log(_client_id uuid, _tabela text, _contato_id uuid)
RETURNS SETOF public.telemarketing_call_log
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT l.* FROM public.telemarketing_call_log l
  WHERE l.client_id=_client_id AND l.tabela=_tabela AND l.contato_id=_contato_id
    AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id=_client_id AND c.user_id=auth.uid())
  ORDER BY l.created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.tele_get_contato_log(uuid,text,uuid) TO authenticated;
