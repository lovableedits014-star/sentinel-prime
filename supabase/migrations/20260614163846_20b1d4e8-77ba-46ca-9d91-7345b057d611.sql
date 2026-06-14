CREATE OR REPLACE FUNCTION public.get_eleicao_pessoas_for_client(_client_id uuid)
RETURNS SETOF public.eleicao_pessoas
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT ep.*
  FROM public.eleicao_pessoas ep
  WHERE ep.client_id = _client_id
    AND public.user_can_access_client(_client_id)
  ORDER BY ep.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_eleicao_pessoas_for_client(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_eleicao_pessoas_for_client(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_eleicao_pessoas_for_client(uuid) TO service_role;