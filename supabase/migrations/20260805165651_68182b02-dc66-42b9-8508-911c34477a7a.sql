
-- 1. Criar a função utilitária de hash para uso manual (não apenas como trigger)
CREATE OR REPLACE FUNCTION public.hash_telemarketing_senha(p_senha text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN extensions.crypt(p_senha, extensions.gen_salt('bf'));
END;
$$;

-- 2. Atualizar verify_telemarketing_operador para usar crypt corretamente
CREATE OR REPLACE FUNCTION public.verify_telemarketing_operador(_client_id uuid, _nome text, _senha text)
RETURNS TABLE(id uuid, nome text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT o.id, o.nome
  FROM public.telemarketing_operadores o
  WHERE o.client_id = _client_id
    AND o.nome = _nome
    AND o.senha = extensions.crypt(_senha, o.senha)
    AND o.ativo = true
    AND (o.locked_until IS NULL OR o.locked_until < now())
  LIMIT 1;
END;
$$;

-- 3. Atualizar _tele_assert_operador para usar a verificação correta
CREATE OR REPLACE FUNCTION public._tele_assert_operador(_client_id uuid, _nome text, _senha text)
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v_id uuid;
BEGIN
  SELECT o.id INTO v_id
  FROM public.telemarketing_operadores o
  WHERE o.client_id = _client_id
    AND o.nome = _nome
    AND o.senha = extensions.crypt(_senha, o.senha)
    AND o.ativo = true
    AND (o.locked_until IS NULL OR o.locked_until < now())
  LIMIT 1;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Credenciais inválidas' USING ERRCODE='28000';
  END IF;
  RETURN v_id;
END;
$$;

-- 4. Garantir que as senhas existentes estão em formato bcrypt
DO $$
BEGIN
  UPDATE public.telemarketing_operadores
  SET senha = extensions.crypt(senha, extensions.gen_salt('bf'))
  WHERE senha IS NOT NULL 
    AND senha NOT LIKE '$2a$%' 
    AND senha NOT LIKE '$2b$%';
END $$;

-- 5. Conceder permissões
GRANT EXECUTE ON FUNCTION public.hash_telemarketing_senha(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_telemarketing_operador(uuid, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._tele_assert_operador(uuid, text, text) TO anon, authenticated, service_role;
