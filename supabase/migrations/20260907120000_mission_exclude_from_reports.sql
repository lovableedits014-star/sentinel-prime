-- Remove uma missao criada por engano das apuracoes sem apagar os registros
-- brutos de auditoria (acessos e cliques).
CREATE OR REPLACE FUNCTION public.mission_exclude_from_reports(
  p_client_id uuid,
  p_mission_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN
    RAISE EXCEPTION 'Sem permissao';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.portal_missions
    WHERE id = p_mission_id AND client_id = p_client_id
  ) THEN
    RAISE EXCEPTION 'Missao nao encontrada';
  END IF;

  -- As obrigacoes formam o denominador dos relatorios de cumprimento. Apaga-las
  -- retira a missao incorreta dos resultados negativos.
  DELETE FROM public.engagement_obrigacoes
  WHERE client_id = p_client_id AND mission_id = p_mission_id;

  UPDATE public.portal_missions
  SET archived_at = coalesce(archived_at, now()),
      is_active = false,
      tracking_enabled = false,
      updated_at = now()
  WHERE id = p_mission_id AND client_id = p_client_id;
END;
$$;

REVOKE ALL ON FUNCTION public.mission_exclude_from_reports(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mission_exclude_from_reports(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.mission_exclude_from_reports(uuid, uuid) IS
  'Arquiva uma missao criada por engano e remove suas obrigacoes das apuracoes, preservando eventos para auditoria.';
