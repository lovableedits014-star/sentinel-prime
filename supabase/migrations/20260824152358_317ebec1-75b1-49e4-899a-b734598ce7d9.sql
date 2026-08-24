CREATE OR REPLACE FUNCTION public.eleicao_pessoa_in_user_tree(_pessoa_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    public.eleicao_pessoa_in_user_tree(_pessoa_id, auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.eleicao_pessoas ep
      JOIN public.clients c ON c.id = ep.client_id
      WHERE ep.id = _pessoa_id
        AND (c.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    );
$$;

REVOKE EXECUTE ON FUNCTION public.eleicao_pessoa_in_user_tree(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eleicao_pessoa_in_user_tree(uuid) TO authenticated, service_role;