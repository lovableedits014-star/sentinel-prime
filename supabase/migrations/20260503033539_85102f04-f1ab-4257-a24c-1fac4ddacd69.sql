
-- ============ ONDA 1: clients ============
DROP POLICY IF EXISTS "Public can read basic client info" ON public.clients;

CREATE OR REPLACE VIEW public.clients_public
WITH (security_invoker = true) AS
SELECT
  id,
  name,
  logo_url,
  whatsapp_oficial,
  whatsapp_window_enabled,
  whatsapp_window_start,
  whatsapp_window_end
FROM public.clients;

-- A view sem RLS herda permissões; precisamos liberar leitura pública dos campos seguros.
-- Como removemos a policy de SELECT em clients para anon, criamos uma policy restrita às colunas seguras
-- via SECURITY DEFINER function que a view usa. Em vez disso, simplificamos:
-- garantimos que anon possa ler a view via uma function SECURITY DEFINER.

DROP VIEW IF EXISTS public.clients_public;

CREATE OR REPLACE FUNCTION public.get_client_public(_client_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  logo_url text,
  whatsapp_oficial text,
  whatsapp_window_enabled boolean,
  whatsapp_window_start time,
  whatsapp_window_end time
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, name, logo_url, whatsapp_oficial,
         whatsapp_window_enabled, whatsapp_window_start, whatsapp_window_end
  FROM public.clients
  WHERE id = _client_id;
$$;

REVOKE ALL ON FUNCTION public.get_client_public(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_client_public(uuid) TO anon, authenticated;

-- ============ ONDA 2: telemarketing_operadores ============
DROP POLICY IF EXISTS "Public can read operadores for login" ON public.telemarketing_operadores;

CREATE OR REPLACE FUNCTION public.verify_telemarketing_operador(
  _client_id uuid,
  _nome text,
  _senha text
)
RETURNS TABLE (id uuid, nome text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, nome
  FROM public.telemarketing_operadores
  WHERE client_id = _client_id
    AND nome = _nome
    AND senha = _senha
    AND ativo = true
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.verify_telemarketing_operador(uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.verify_telemarketing_operador(uuid, text, text) TO anon, authenticated;

-- ============ ONDA 3: lider_invite_tokens ============
DROP POLICY IF EXISTS "Anyone can validate token" ON public.lider_invite_tokens;

CREATE OR REPLACE FUNCTION public.validate_lider_invite_token(_token text)
RETURNS TABLE (
  client_id uuid,
  note text,
  expires_at timestamptz,
  used_at timestamptz,
  valid boolean,
  reason text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
BEGIN
  SELECT t.client_id, t.note, t.expires_at, t.used_at
  INTO rec
  FROM public.lider_invite_tokens t
  WHERE t.token = _token
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::timestamptz, NULL::timestamptz,
                        false, 'invalid'::text;
    RETURN;
  END IF;

  IF rec.used_at IS NOT NULL THEN
    RETURN QUERY SELECT rec.client_id, rec.note, rec.expires_at, rec.used_at,
                        false, 'used'::text;
    RETURN;
  END IF;

  IF rec.expires_at IS NOT NULL AND rec.expires_at < now() THEN
    RETURN QUERY SELECT rec.client_id, rec.note, rec.expires_at, rec.used_at,
                        false, 'expired'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT rec.client_id, rec.note, rec.expires_at, rec.used_at,
                      true, 'ok'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_lider_invite_token(text) FROM public;
GRANT EXECUTE ON FUNCTION public.validate_lider_invite_token(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_lider_invite_token(_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected int;
BEGIN
  UPDATE public.lider_invite_tokens
  SET used_at = now()
  WHERE token = _token
    AND used_at IS NULL
    AND (expires_at IS NULL OR expires_at > now());
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_lider_invite_token(text) FROM public;
GRANT EXECUTE ON FUNCTION public.consume_lider_invite_token(text) TO anon, authenticated;
