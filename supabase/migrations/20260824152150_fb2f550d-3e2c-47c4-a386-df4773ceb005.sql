CREATE OR REPLACE FUNCTION public.eleicao_pessoa_in_user_tree(_pessoa_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.eleicao_pessoa_in_user_tree(_pessoa_id, auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.eleicao_pessoa_in_user_tree(uuid) TO authenticated, service_role;