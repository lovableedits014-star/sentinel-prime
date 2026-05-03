
CREATE OR REPLACE FUNCTION public.hash_telemarketing_senha()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.senha IS NOT NULL AND NEW.senha NOT LIKE '$2%' THEN
    NEW.senha := extensions.crypt(NEW.senha, extensions.gen_salt('bf'));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hash_telemarketing_senha ON public.telemarketing_operadores;
CREATE TRIGGER trg_hash_telemarketing_senha
BEFORE INSERT OR UPDATE OF senha ON public.telemarketing_operadores
FOR EACH ROW EXECUTE FUNCTION public.hash_telemarketing_senha();

UPDATE public.telemarketing_operadores
SET senha = extensions.crypt(senha, extensions.gen_salt('bf'))
WHERE senha IS NOT NULL AND senha NOT LIKE '$2%';

CREATE OR REPLACE FUNCTION public.verify_telemarketing_operador(_client_id uuid, _nome text, _senha text)
RETURNS TABLE(id uuid, nome text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT id, nome
  FROM public.telemarketing_operadores
  WHERE client_id = _client_id
    AND nome = _nome
    AND senha = extensions.crypt(_senha, senha)
    AND ativo = true
  LIMIT 1;
$$;

REVOKE SELECT ON public.telemarketing_operadores FROM authenticated, anon;
GRANT SELECT (id, client_id, nome, ativo, created_at) ON public.telemarketing_operadores TO authenticated;
