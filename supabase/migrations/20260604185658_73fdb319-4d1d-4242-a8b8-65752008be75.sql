CREATE OR REPLACE FUNCTION public.user_can_access_client(_client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.is_super_admin()
  OR EXISTS (
    SELECT 1 FROM public.clients c WHERE c.id = _client_id AND c.user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.team_members t
    WHERE t.client_id = _client_id AND t.user_id = auth.uid() AND t.status = 'active'
  );
$function$;