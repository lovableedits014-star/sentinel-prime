
REVOKE EXECUTE ON FUNCTION public.get_client_public(uuid) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.get_client_public(uuid) TO anon;
