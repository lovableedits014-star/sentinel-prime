-- Exclui por completo uma missao criada por engano e todos os dados que ela
-- gerou. Assim ela nao permanece em nenhum relatorio ou indicador.
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

  -- Algumas relacoes antigas usam ON DELETE SET NULL ou nao possuem FK. A
  -- remocao explicita impede que dados orfaos entrem em relatorios agregados.
  DELETE FROM public.mission_checkins
  WHERE client_id = p_client_id AND mission_id = p_mission_id;

  DELETE FROM public.engagement_obrigacoes
  WHERE client_id = p_client_id AND mission_id = p_mission_id;

  DELETE FROM public.mission_events
  WHERE client_id = p_client_id AND mission_id = p_mission_id;

  DELETE FROM public.mission_distributions
  WHERE client_id = p_client_id AND mission_id = p_mission_id;

  DELETE FROM public.portal_mission_links
  WHERE client_id = p_client_id AND mission_id = p_mission_id;

  DELETE FROM public.contratado_missao_dispatches
  WHERE client_id = p_client_id AND mission_id = p_mission_id;

  DELETE FROM public.portal_missions
  WHERE id = p_mission_id AND client_id = p_client_id;
END;
$$;

REVOKE ALL ON FUNCTION public.mission_exclude_from_reports(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mission_exclude_from_reports(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.mission_exclude_from_reports(uuid, uuid) IS
  'Exclui definitivamente uma missao e todos os dados relacionados para remove-la dos relatorios.';

NOTIFY pgrst, 'reload schema';
