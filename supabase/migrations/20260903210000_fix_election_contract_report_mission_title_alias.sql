-- Segundo hotfix para bancos que ja executaram 20260903200000.
-- Preserva o nome "titulo" esperado pelas CTEs seguintes da funcao.
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
  v_definition := replace(v_definition, 'm.titulo,', 'm.title AS titulo,');
  v_definition := replace(v_definition, 'm.title,', 'm.title AS titulo,');
  EXECUTE v_definition;
END;
$block$;

NOTIFY pgrst,'reload schema';
