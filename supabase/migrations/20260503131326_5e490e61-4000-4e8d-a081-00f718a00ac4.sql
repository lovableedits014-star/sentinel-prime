
-- 1) Remove dangerous public SELECT/UPDATE policies
DROP POLICY IF EXISTS "Public can read funcionarios for registration" ON public.funcionarios;
DROP POLICY IF EXISTS "Public can read contratados for telemarketing" ON public.contratados;
DROP POLICY IF EXISTS "Public can update contratados for telemarketing" ON public.contratados;
DROP POLICY IF EXISTS "Public can read indicados for telemarketing" ON public.contratado_indicados;
DROP POLICY IF EXISTS "Public can update indicados for telemarketing" ON public.contratado_indicados;

-- 2) Restrict funcionario_referrals INSERT
DROP POLICY IF EXISTS "Public can insert funcionario_referrals" ON public.funcionario_referrals;
CREATE POLICY "Funcionario can insert own referrals"
ON public.funcionario_referrals
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.funcionarios f
    WHERE f.id = funcionario_referrals.funcionario_id
      AND f.client_id = funcionario_referrals.client_id
      AND f.user_id = auth.uid()
  )
);

-- 3) Telemarketing portal RPCs (operator-authenticated)
CREATE OR REPLACE FUNCTION public.tele_list_contatos(
  _client_id uuid, _nome text, _senha text
)
RETURNS TABLE(
  id uuid, nome text, telefone text, cidade text, bairro text,
  ligacao_status text, vota_candidato text, candidato_alternativo text,
  operador_nome text, ligacao_em timestamptz, tipo text, tabela text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.telemarketing_operadores o
    WHERE o.client_id = _client_id AND o.nome = _nome
      AND o.senha = extensions.crypt(_senha, o.senha) AND o.ativo = true
  ) THEN
    RAISE EXCEPTION 'Operador inválido' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT c.id, c.nome, c.telefone, c.cidade, c.bairro,
           c.ligacao_status, c.vota_candidato, c.candidato_alternativo,
           c.operador_nome, c.ligacao_em,
           CASE WHEN c.is_lider THEN 'lider' ELSE 'liderado' END,
           'contratados'::text
    FROM public.contratados c
    WHERE c.client_id = _client_id
    UNION ALL
    SELECT i.id, i.nome, i.telefone, i.cidade, i.bairro,
           i.ligacao_status, i.vota_candidato, i.candidato_alternativo,
           i.operador_nome, i.ligacao_em,
           'indicado'::text, 'contratado_indicados'::text
    FROM public.contratado_indicados i
    WHERE i.client_id = _client_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tele_registrar_ligacao(
  _client_id uuid, _nome text, _senha text,
  _tabela text, _id uuid,
  _ligacao_status text, _cidade text, _bairro text,
  _vota_candidato text DEFAULT NULL, _candidato_alternativo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v_count integer := 0; v_status text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.telemarketing_operadores o
    WHERE o.client_id = _client_id AND o.nome = _nome
      AND o.senha = extensions.crypt(_senha, o.senha) AND o.ativo = true
  ) THEN
    RAISE EXCEPTION 'Operador inválido' USING ERRCODE = '42501';
  END IF;

  IF _ligacao_status NOT IN ('atendeu','nao_atendeu','recusou','pendente') THEN
    RAISE EXCEPTION 'Status inválido';
  END IF;

  IF _tabela = 'contratados' THEN
    UPDATE public.contratados
    SET ligacao_status = _ligacao_status,
        operador_nome = _nome,
        ligacao_em = now(),
        cidade = COALESCE(NULLIF(_cidade,''), cidade),
        bairro = COALESCE(NULLIF(_bairro,''), bairro),
        vota_candidato = CASE WHEN _ligacao_status='atendeu' THEN _vota_candidato ELSE vota_candidato END,
        candidato_alternativo = CASE WHEN _ligacao_status='atendeu' THEN _candidato_alternativo ELSE candidato_alternativo END
    WHERE id = _id AND client_id = _client_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSIF _tabela = 'contratado_indicados' THEN
    v_status := CASE WHEN _ligacao_status='atendeu' AND _vota_candidato='sim' THEN 'confirmado'
                     WHEN _ligacao_status='atendeu' AND _vota_candidato='nao' THEN 'rejeitado'
                     ELSE NULL END;
    UPDATE public.contratado_indicados
    SET ligacao_status = _ligacao_status,
        operador_nome = _nome,
        ligacao_em = now(),
        cidade = COALESCE(NULLIF(_cidade,''), cidade),
        bairro = COALESCE(NULLIF(_bairro,''), bairro),
        vota_candidato = CASE WHEN _ligacao_status='atendeu' THEN _vota_candidato ELSE vota_candidato END,
        candidato_alternativo = CASE WHEN _ligacao_status='atendeu' THEN _candidato_alternativo ELSE candidato_alternativo END,
        status = COALESCE(v_status, status)
    WHERE id = _id AND client_id = _client_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSE
    RAISE EXCEPTION 'Tabela inválida';
  END IF;

  RETURN jsonb_build_object('updated', v_count);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.tele_list_contatos(uuid,text,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tele_registrar_ligacao(uuid,text,text,text,uuid,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tele_list_contatos(uuid,text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tele_registrar_ligacao(uuid,text,text,text,uuid,text,text,text,text,text) TO anon, authenticated;
