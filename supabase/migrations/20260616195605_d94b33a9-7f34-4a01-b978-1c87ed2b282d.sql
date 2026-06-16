CREATE OR REPLACE FUNCTION public.get_eleicao_portal_config(_client_id uuid)
RETURNS TABLE(
  cadastro_lider_ativo boolean,
  cadastro_cabo_ativo boolean,
  grupos_links jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    COALESCE(c.cadastro_lider_ativo, true) AS cadastro_lider_ativo,
    COALESCE(c.cadastro_cabo_ativo, true) AS cadastro_cabo_ativo,
    COALESCE(c.grupos_links, '{}'::jsonb) AS grupos_links
  FROM public.eleicao_notif_config c
  WHERE c.client_id = _client_id
    AND (
      public.is_super_admin()
      OR public.user_can_access_client(_client_id)
      OR EXISTS (
        SELECT 1
        FROM public.eleicao_pessoas p
        WHERE p.client_id = _client_id
          AND p.user_id = auth.uid()
          AND p.tipo = 'coordenador'
      )
    )
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_eleicao_portal_config(uuid) TO authenticated;