-- Inclui no detalhe dos indicados a devolutiva eleitoral registrada pelo
-- telemarketing. Nao altera a assinatura da RPC nem perde filtros de periodo.
DO $block$
DECLARE
  v_function regprocedure := to_regprocedure(
    'public.election_contract_compliance_report(uuid,date,date)'
  );
  v_definition text;
  v_old text := '''status_telemarketing'', i.status_telemarketing, ''created_at'', i.created_at';
  v_new text := '''status_telemarketing'', i.status_telemarketing, ''vota_candidato'', i.vota_candidato, ''candidato_alternativo'', i.candidato_alternativo, ''created_at'', i.created_at';
BEGIN
  IF v_function IS NULL THEN
    RAISE EXCEPTION 'Funcao election_contract_compliance_report nao encontrada';
  END IF;

  SELECT pg_get_functiondef(v_function) INTO v_definition;
  IF position(v_old IN v_definition)>0 THEN
    EXECUTE replace(v_definition,v_old,v_new);
  ELSIF position('''vota_candidato'', i.vota_candidato' IN v_definition)=0 THEN
    RAISE EXCEPTION 'Trecho de indicados da funcao nao reconhecido';
  END IF;
END;
$block$;

NOTIFY pgrst,'reload schema';
