-- Hotfix para ambientes onde a migration 20260903190000 ja foi aplicada.
-- portal_missions usa a coluna "title"; o primeiro corpo da RPC referenciava
-- incorretamente "titulo" e a validacao ocorreu apenas na primeira chamada.
DO $block$
DECLARE
  v_function regprocedure := to_regprocedure(
    'public.election_contract_compliance_report(uuid,date,date)'
  );
  v_definition text;
BEGIN
  IF v_function IS NULL THEN
    RAISE EXCEPTION 'Funcao election_contract_compliance_report nao encontrada';
  END IF;

  SELECT pg_get_functiondef(v_function) INTO v_definition;
  v_definition := replace(v_definition, 'm.titulo', 'm.title');
  EXECUTE v_definition;
END;
$block$;

NOTIFY pgrst,'reload schema';
