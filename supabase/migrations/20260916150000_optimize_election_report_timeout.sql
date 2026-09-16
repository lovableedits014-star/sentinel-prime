-- Reduz o volume intermediario do relatorio eleitoral. Check-ins e indicados
-- passam a ser agregados apenas para as pessoas que efetivamente fazem parte
-- do relatorio, evitando timeout em campanhas com bases grandes.
CREATE INDEX IF NOT EXISTS idx_portal_missions_client_published_report
  ON public.portal_missions(client_id,(coalesce(publicado_em,created_at)),id);

CREATE INDEX IF NOT EXISTS idx_mission_checkins_client_mission_person_report
  ON public.mission_checkins(client_id,mission_id,pessoa_id,participant_id);

DO $block$
DECLARE
  v_function regprocedure := to_regprocedure(
    'public.election_contract_compliance_report(uuid,date,date)'
  );
  v_definition text;
  v_old_person text := $sql$JOIN public.mission_participants mp ON mp.id=mc.participant_id
    JOIN public.portal_missions m ON m.id=mc.mission_id AND m.client_id=mc.client_id
    WHERE mc.client_id=p_client_id
      AND coalesce(mc.pessoa_id,mp.pessoa_id) IS NOT NULL$sql$;
  v_new_person text := $sql$JOIN public.mission_participants mp ON mp.id=mc.participant_id
    JOIN contratados cp ON cp.id=coalesce(mc.pessoa_id,mp.pessoa_id)
    JOIN public.portal_missions m ON m.id=mc.mission_id AND m.client_id=mc.client_id
    WHERE mc.client_id=p_client_id
      AND coalesce(mc.pessoa_id,mp.pessoa_id) IS NOT NULL$sql$;
  v_old_phone text := $sql$WHERE mc.client_id=p_client_id
      AND public.mission_phone_key(mp.phone_e164) IS NOT NULL$sql$;
  v_new_phone text := $sql$WHERE mc.client_id=p_client_id
      AND public.mission_phone_key(mp.phone_e164) IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM contratados cp
        WHERE public.mission_phone_key(cp.telefone)=public.mission_phone_key(mp.phone_e164)
      )$sql$;
  v_old_indication text := $sql$FROM public.eleicao_indicados i
    WHERE i.client_id=p_client_id
    GROUP BY i.indicador_id$sql$;
  v_new_indication text := $sql$FROM public.eleicao_indicados i
    JOIN contratados cp ON cp.id=i.indicador_id
    WHERE i.client_id=p_client_id
    GROUP BY i.indicador_id$sql$;
BEGIN
  IF v_function IS NULL THEN
    RAISE EXCEPTION 'Funcao election_contract_compliance_report nao encontrada';
  END IF;

  SELECT pg_get_functiondef(v_function) INTO v_definition;
  IF position(v_old_person IN v_definition)>0 THEN
    v_definition := replace(v_definition,v_old_person,v_new_person);
  ELSIF position(v_new_person IN v_definition)=0 THEN
    RAISE EXCEPTION 'Trecho de check-ins por pessoa nao reconhecido';
  END IF;

  IF position(v_old_phone IN v_definition)>0 THEN
    v_definition := replace(v_definition,v_old_phone,v_new_phone);
  ELSIF position(v_new_phone IN v_definition)=0 THEN
    RAISE EXCEPTION 'Trecho de check-ins por telefone nao reconhecido';
  END IF;

  IF position(v_old_indication IN v_definition)>0 THEN
    v_definition := replace(v_definition,v_old_indication,v_new_indication);
  ELSIF position(v_new_indication IN v_definition)=0 THEN
    RAISE EXCEPTION 'Trecho de indicados nao reconhecido';
  END IF;

  EXECUTE v_definition;
END;
$block$;

NOTIFY pgrst,'reload schema';
