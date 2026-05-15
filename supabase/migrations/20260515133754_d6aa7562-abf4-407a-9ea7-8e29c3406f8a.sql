
-- Fix infinite recursion in team_members RLS by using a SECURITY DEFINER function
CREATE OR REPLACE FUNCTION public.is_client_manager(_user_id uuid, _client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE user_id = _user_id
      AND client_id = _client_id
      AND is_manager = true
      AND status = 'active'
  );
$$;

DROP POLICY IF EXISTS "Manager can manage team of own client" ON public.team_members;

CREATE POLICY "Manager can manage team of own client"
ON public.team_members
FOR ALL
USING (public.is_client_manager(auth.uid(), client_id))
WITH CHECK (public.is_client_manager(auth.uid(), client_id));
