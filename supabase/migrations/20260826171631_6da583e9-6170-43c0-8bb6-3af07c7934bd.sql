CREATE OR REPLACE FUNCTION public._tele_assert_operador(_client_id uuid, _nome text, _senha text)
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_id uuid;
BEGIN
  SELECT o.id INTO v_id
  FROM public.telemarketing_operadores o
  WHERE o.client_id = _client_id
    AND lower(btrim(o.nome)) = lower(btrim(_nome))
    AND o.senha = extensions.crypt(btrim(_senha), o.senha)
    AND o.ativo = true
    AND (o.locked_until IS NULL OR o.locked_until < now())
  LIMIT 1;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Credenciais inválidas' USING ERRCODE='28000';
  END IF;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.verify_telemarketing_operador(_client_id uuid, _nome text, _senha text)
RETURNS TABLE(id uuid, nome text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN QUERY
  SELECT o.id, o.nome
  FROM public.telemarketing_operadores o
  WHERE o.client_id = _client_id
    AND lower(btrim(o.nome)) = lower(btrim(_nome))
    AND o.senha = extensions.crypt(btrim(_senha), o.senha)
    AND o.ativo = true
    AND (o.locked_until IS NULL OR o.locked_until < now())
  LIMIT 1;
END;
$function$;