
-- =========== FASE 4: CAMPANHAS + MAILING AVULSO ===========
CREATE TABLE IF NOT EXISTS public.telemarketing_campanhas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  nome text NOT NULL,
  descricao text,
  filtros jsonb NOT NULL DEFAULT '{}'::jsonb,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tele_camp_client ON public.telemarketing_campanhas(client_id, ativo);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telemarketing_campanhas TO authenticated;
GRANT ALL ON public.telemarketing_campanhas TO service_role;
ALTER TABLE public.telemarketing_campanhas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tele camp: client owner all" ON public.telemarketing_campanhas;
CREATE POLICY "Tele camp: client owner all" ON public.telemarketing_campanhas FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id=telemarketing_campanhas.client_id AND c.user_id=auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id=telemarketing_campanhas.client_id AND c.user_id=auth.uid()));

CREATE TABLE IF NOT EXISTS public.telemarketing_contatos_avulsos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  campanha_id uuid REFERENCES public.telemarketing_campanhas(id) ON DELETE SET NULL,
  nome text NOT NULL,
  telefone text NOT NULL,
  cidade text,
  bairro text,
  ligacao_status text,
  vota_candidato text,
  candidato_alternativo text,
  operador_nome text,
  ligacao_em timestamptz,
  proxima_tentativa_em timestamptz,
  tentativas_count integer NOT NULL DEFAULT 0,
  observacao_tele text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tele_avulso_client ON public.telemarketing_contatos_avulsos(client_id, ativo);
CREATE INDEX IF NOT EXISTS idx_tele_avulso_campanha ON public.telemarketing_contatos_avulsos(campanha_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telemarketing_contatos_avulsos TO authenticated;
GRANT ALL ON public.telemarketing_contatos_avulsos TO service_role;
ALTER TABLE public.telemarketing_contatos_avulsos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tele avulso: client owner all" ON public.telemarketing_contatos_avulsos;
CREATE POLICY "Tele avulso: client owner all" ON public.telemarketing_contatos_avulsos FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id=telemarketing_contatos_avulsos.client_id AND c.user_id=auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id=telemarketing_contatos_avulsos.client_id AND c.user_id=auth.uid()));

-- Permitir 'contatos_avulsos' como tabela aceita no log
ALTER TABLE public.telemarketing_call_log DROP CONSTRAINT IF EXISTS telemarketing_call_log_tabela_check;
ALTER TABLE public.telemarketing_call_log
  ADD CONSTRAINT telemarketing_call_log_tabela_check CHECK (tabela IN ('contratados','contratado_indicados','contatos_avulsos'));

ALTER TABLE public.telemarketing_call_assignments DROP CONSTRAINT IF EXISTS telemarketing_call_assignments_tabela_check;
ALTER TABLE public.telemarketing_call_assignments
  ADD CONSTRAINT telemarketing_call_assignments_tabela_check CHECK (tabela IN ('contratados','contratado_indicados','contatos_avulsos'));

-- =========== FASE 7: SEGURANÇA OPERADOR ===========
ALTER TABLE public.telemarketing_operadores
  ADD COLUMN IF NOT EXISTS failed_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz,
  ADD COLUMN IF NOT EXISTS password_updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.telemarketing_operador_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  operador_nome text NOT NULL,
  evento text NOT NULL,
  detalhe jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tele_op_audit ON public.telemarketing_operador_audit(client_id, created_at DESC);
GRANT SELECT ON public.telemarketing_operador_audit TO authenticated;
GRANT ALL ON public.telemarketing_operador_audit TO service_role;
ALTER TABLE public.telemarketing_operador_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tele op audit: client owner read" ON public.telemarketing_operador_audit;
CREATE POLICY "Tele op audit: client owner read" ON public.telemarketing_operador_audit FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id=telemarketing_operador_audit.client_id AND c.user_id=auth.uid()));

-- =========== verify_telemarketing_operador com rate limit ===========
CREATE OR REPLACE FUNCTION public.verify_telemarketing_operador(_client_id uuid, _nome text, _senha text)
RETURNS TABLE(id uuid, nome text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions'
AS $$
DECLARE v_op record; v_ok boolean;
BEGIN
  SELECT * INTO v_op FROM public.telemarketing_operadores
   WHERE client_id=_client_id AND nome=_nome AND ativo=true;

  IF v_op.id IS NULL THEN
    INSERT INTO public.telemarketing_operador_audit(client_id, operador_nome, evento, detalhe)
    VALUES (_client_id, _nome, 'login_falha', jsonb_build_object('motivo','operador_inexistente'));
    RETURN;
  END IF;

  IF v_op.locked_until IS NOT NULL AND v_op.locked_until > now() THEN
    INSERT INTO public.telemarketing_operador_audit(client_id, operador_nome, evento, detalhe)
    VALUES (_client_id, _nome, 'login_bloqueado', jsonb_build_object('locked_until', v_op.locked_until));
    RAISE EXCEPTION 'Operador bloqueado até %', v_op.locked_until USING ERRCODE='42501';
  END IF;

  v_ok := v_op.senha = extensions.crypt(_senha, v_op.senha);

  IF v_ok THEN
    UPDATE public.telemarketing_operadores
       SET failed_attempts=0, locked_until=NULL, last_login_at=now()
     WHERE id=v_op.id;
    INSERT INTO public.telemarketing_operador_audit(client_id, operador_nome, evento)
    VALUES (_client_id, _nome, 'login_ok');
    RETURN QUERY SELECT v_op.id, v_op.nome;
  ELSE
    UPDATE public.telemarketing_operadores
       SET failed_attempts = COALESCE(failed_attempts,0)+1,
           locked_until = CASE WHEN COALESCE(failed_attempts,0)+1 >= 5 THEN now() + interval '15 minutes' ELSE locked_until END
     WHERE id=v_op.id;
    INSERT INTO public.telemarketing_operador_audit(client_id, operador_nome, evento, detalhe)
    VALUES (_client_id, _nome, 'login_falha',
            jsonb_build_object('failed_attempts', COALESCE(v_op.failed_attempts,0)+1));
    RETURN;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.verify_telemarketing_operador(uuid,text,text) TO anon, authenticated;

-- Helper interno: valida senha aplicando rate-limit silenciosamente
CREATE OR REPLACE FUNCTION public._tele_assert_operador(_client_id uuid, _nome text, _senha text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions'
AS $$
DECLARE v_op record; v_ok boolean;
BEGIN
  SELECT * INTO v_op FROM public.telemarketing_operadores
   WHERE client_id=_client_id AND nome=_nome AND ativo=true;
  IF v_op.id IS NULL THEN RAISE EXCEPTION 'Operador inválido' USING ERRCODE='42501'; END IF;
  IF v_op.locked_until IS NOT NULL AND v_op.locked_until > now() THEN
    RAISE EXCEPTION 'Operador bloqueado' USING ERRCODE='42501';
  END IF;
  v_ok := v_op.senha = extensions.crypt(_senha, v_op.senha);
  IF NOT v_ok THEN
    UPDATE public.telemarketing_operadores
       SET failed_attempts = COALESCE(failed_attempts,0)+1,
           locked_until = CASE WHEN COALESCE(failed_attempts,0)+1 >= 5 THEN now() + interval '15 minutes' ELSE locked_until END
     WHERE id=v_op.id;
    RAISE EXCEPTION 'Operador inválido' USING ERRCODE='42501';
  END IF;
END;
$$;

-- =========== Atualiza RPCs do operador para usar helper ===========
DROP FUNCTION IF EXISTS public.tele_list_contatos(uuid,text,text);
CREATE OR REPLACE FUNCTION public.tele_list_contatos(_client_id uuid, _nome text, _senha text)
RETURNS TABLE(
  id uuid, nome text, telefone text, cidade text, bairro text,
  ligacao_status text, vota_candidato text, candidato_alternativo text,
  operador_nome text, ligacao_em timestamptz, tipo text, tabela text,
  proxima_tentativa_em timestamptz, tentativas_count integer, observacao_tele text,
  locked_by text, locked_until timestamptz, campanha_id uuid
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','extensions'
AS $$
BEGIN
  PERFORM public._tele_assert_operador(_client_id, _nome, _senha);

  RETURN QUERY
    SELECT c.id, c.nome, c.telefone, c.cidade, c.bairro,
           c.ligacao_status, c.vota_candidato, c.candidato_alternativo,
           c.operador_nome, c.ligacao_em,
           CASE WHEN c.is_lider THEN 'lider' ELSE 'liderado' END, 'contratados'::text,
           c.proxima_tentativa_em, COALESCE(c.tentativas_count,0), c.observacao_tele,
           a.operador_nome, a.expires_at, NULL::uuid
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
           a.operador_nome, a.expires_at, NULL::uuid
    FROM public.contratado_indicados i
    LEFT JOIN public.telemarketing_call_assignments a
      ON a.client_id=i.client_id AND a.tabela='contratado_indicados' AND a.contato_id=i.id AND a.expires_at>now()
    WHERE i.client_id=_client_id
    UNION ALL
    SELECT av.id, av.nome, av.telefone, av.cidade, av.bairro,
           av.ligacao_status, av.vota_candidato, av.candidato_alternativo,
           av.operador_nome, av.ligacao_em,
           'avulso'::text, 'contatos_avulsos'::text,
           av.proxima_tentativa_em, COALESCE(av.tentativas_count,0), av.observacao_tele,
           a.operador_nome, a.expires_at, av.campanha_id
    FROM public.telemarketing_contatos_avulsos av
    LEFT JOIN public.telemarketing_call_assignments a
      ON a.client_id=av.client_id AND a.tabela='contatos_avulsos' AND a.contato_id=av.id AND a.expires_at>now()
    WHERE av.client_id=_client_id AND av.ativo=true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.tele_list_contatos(uuid,text,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.tele_claim_contato(
  _client_id uuid, _nome text, _senha text, _tabela text, _id uuid, _ttl_seconds integer DEFAULT 300
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions'
AS $$
DECLARE v_row record; v_expires timestamptz;
BEGIN
  PERFORM public._tele_assert_operador(_client_id, _nome, _senha);
  IF _tabela NOT IN ('contratados','contratado_indicados','contatos_avulsos') THEN
    RAISE EXCEPTION 'Tabela inválida'; END IF;

  DELETE FROM public.telemarketing_call_assignments WHERE expires_at < now();
  v_expires := now() + make_interval(secs => GREATEST(_ttl_seconds,60));

  INSERT INTO public.telemarketing_call_assignments(client_id, tabela, contato_id, operador_nome, expires_at)
  VALUES (_client_id, _tabela, _id, _nome, v_expires)
  ON CONFLICT (client_id, tabela, contato_id) DO UPDATE
    SET operador_nome=EXCLUDED.operador_nome, expires_at=EXCLUDED.expires_at
    WHERE public.telemarketing_call_assignments.operador_nome=EXCLUDED.operador_nome
       OR public.telemarketing_call_assignments.expires_at<now()
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
  PERFORM public._tele_assert_operador(_client_id, _nome, _senha);
  DELETE FROM public.telemarketing_call_assignments
  WHERE client_id=_client_id AND tabela=_tabela AND contato_id=_id AND operador_nome=_nome;
  RETURN jsonb_build_object('released', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.tele_release_contato(uuid,text,text,text,uuid) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.tele_registrar_ligacao(uuid,text,text,text,uuid,text,text,text,text,text,text,timestamptz);
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
  PERFORM public._tele_assert_operador(_client_id, _nome, _senha);
  IF _ligacao_status NOT IN ('atendeu','nao_atendeu','recusou','pendente','reagendou') THEN
    RAISE EXCEPTION 'Status inválido'; END IF;

  IF _tabela='contratados' THEN
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
    GET DIAGNOSTICS v_count=ROW_COUNT;
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
    GET DIAGNOSTICS v_count=ROW_COUNT;
  ELSIF _tabela='contatos_avulsos' THEN
    UPDATE public.telemarketing_contatos_avulsos
    SET ligacao_status=_ligacao_status, operador_nome=_nome, ligacao_em=now(),
        tentativas_count=COALESCE(tentativas_count,0)+1,
        proxima_tentativa_em=_proxima_tentativa_em,
        observacao_tele=COALESCE(NULLIF(_observacao,''), observacao_tele),
        cidade=COALESCE(NULLIF(_cidade,''), cidade),
        bairro=COALESCE(NULLIF(_bairro,''), bairro),
        vota_candidato=CASE WHEN _ligacao_status='atendeu' THEN _vota_candidato ELSE vota_candidato END,
        candidato_alternativo=CASE WHEN _ligacao_status='atendeu' THEN _candidato_alternativo ELSE candidato_alternativo END
    WHERE id=_id AND client_id=_client_id;
    GET DIAGNOSTICS v_count=ROW_COUNT;
  ELSE RAISE EXCEPTION 'Tabela inválida'; END IF;

  INSERT INTO public.telemarketing_call_log(
    client_id, tabela, contato_id, operador_nome, ligacao_status,
    vota_candidato, candidato_alternativo, cidade, bairro, observacao, proxima_tentativa_em
  ) VALUES (_client_id, _tabela, _id, _nome, _ligacao_status,
            _vota_candidato, _candidato_alternativo, _cidade, _bairro, _observacao, _proxima_tentativa_em);

  DELETE FROM public.telemarketing_call_assignments
  WHERE client_id=_client_id AND tabela=_tabela AND contato_id=_id AND operador_nome=_nome;

  RETURN jsonb_build_object('updated', v_count, 'logged', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.tele_registrar_ligacao(uuid,text,text,text,uuid,text,text,text,text,text,text,timestamptz) TO anon, authenticated;

-- =========== Import em lote de contatos avulsos ===========
CREATE OR REPLACE FUNCTION public.tele_import_contato_avulso_batch(
  _client_id uuid, _campanha_id uuid, _rows jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_count integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id=_client_id AND c.user_id=auth.uid()) THEN
    RAISE EXCEPTION 'Não autorizado' USING ERRCODE='42501';
  END IF;

  INSERT INTO public.telemarketing_contatos_avulsos(client_id, campanha_id, nome, telefone, cidade, bairro)
  SELECT _client_id, _campanha_id,
         NULLIF(trim(r->>'nome'),''),
         NULLIF(trim(r->>'telefone'),''),
         NULLIF(trim(r->>'cidade'),''),
         NULLIF(trim(r->>'bairro'),'')
  FROM jsonb_array_elements(_rows) r
  WHERE NULLIF(trim(r->>'nome'),'') IS NOT NULL
    AND NULLIF(trim(r->>'telefone'),'') IS NOT NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('inserted', v_count);
END;
$$;
GRANT EXECUTE ON FUNCTION public.tele_import_contato_avulso_batch(uuid,uuid,jsonb) TO authenticated;

-- =========== Trocar senha do operador (admin) ===========
CREATE OR REPLACE FUNCTION public.tele_change_operador_password(_operador_id uuid, _new_senha text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions'
AS $$
DECLARE v_client uuid; v_nome text;
BEGIN
  SELECT client_id, nome INTO v_client, v_nome FROM public.telemarketing_operadores WHERE id=_operador_id;
  IF v_client IS NULL THEN RAISE EXCEPTION 'Operador inexistente'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id=v_client AND c.user_id=auth.uid()) THEN
    RAISE EXCEPTION 'Não autorizado' USING ERRCODE='42501';
  END IF;
  IF length(_new_senha) < 6 THEN RAISE EXCEPTION 'Senha muito curta'; END IF;
  UPDATE public.telemarketing_operadores
     SET senha = extensions.crypt(_new_senha, extensions.gen_salt('bf')),
         password_updated_at = now(),
         failed_attempts = 0, locked_until = NULL
   WHERE id=_operador_id;
  INSERT INTO public.telemarketing_operador_audit(client_id, operador_nome, evento)
  VALUES (v_client, v_nome, 'senha_trocada');
  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.tele_change_operador_password(uuid,text) TO authenticated;

-- =========== Desbloquear operador (admin) ===========
CREATE OR REPLACE FUNCTION public.tele_unlock_operador(_operador_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_client uuid; v_nome text;
BEGIN
  SELECT client_id, nome INTO v_client, v_nome FROM public.telemarketing_operadores WHERE id=_operador_id;
  IF v_client IS NULL THEN RAISE EXCEPTION 'Operador inexistente'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id=v_client AND c.user_id=auth.uid()) THEN
    RAISE EXCEPTION 'Não autorizado' USING ERRCODE='42501';
  END IF;
  UPDATE public.telemarketing_operadores
     SET failed_attempts=0, locked_until=NULL
   WHERE id=_operador_id;
  INSERT INTO public.telemarketing_operador_audit(client_id, operador_nome, evento)
  VALUES (v_client, v_nome, 'desbloqueado');
  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.tele_unlock_operador(uuid) TO authenticated;
