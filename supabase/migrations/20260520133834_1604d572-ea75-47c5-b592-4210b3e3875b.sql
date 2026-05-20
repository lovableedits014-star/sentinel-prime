CREATE OR REPLACE FUNCTION public.is_client_member(_client_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.clients      WHERE id = _client_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.team_members WHERE client_id = _client_id AND user_id = auth.uid());
$$;