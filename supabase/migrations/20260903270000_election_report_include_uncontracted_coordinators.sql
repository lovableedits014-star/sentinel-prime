-- O relatorio gerencial acompanha todo coordenador ativo, mesmo quando ele nao
-- possui contrato remunerado. Lideres e cabos continuam sujeitos aos filtros
-- de contratacao; assim o coordenador passa a constar nas missoes, indicados e
-- conversoes de votos sem ampliar indevidamente o restante da base.
DO $block$
DECLARE
  v_function regprocedure := to_regprocedure(
    'public.election_contract_compliance_report(uuid,date,date)'
  );
  v_definition text;
  v_old text := $sql$AND NOT coalesce(p.is_voluntario,false)
      AND coalesce(p.valor_contratacao,0)>0$sql$;
  v_new text := $sql$AND (
        p.tipo::text='coordenador'
        OR (
          NOT coalesce(p.is_voluntario,false)
          AND coalesce(p.valor_contratacao,0)>0
        )
      )$sql$;
BEGIN
  IF v_function IS NULL THEN
    RAISE EXCEPTION 'Funcao election_contract_compliance_report nao encontrada';
  END IF;

  SELECT pg_get_functiondef(v_function) INTO v_definition;
  IF position(v_old IN v_definition)>0 THEN
    EXECUTE replace(v_definition,v_old,v_new);
  ELSIF position(v_new IN v_definition)=0 THEN
    RAISE EXCEPTION 'Filtro de contratados da funcao nao reconhecido';
  END IF;
END;
$block$;

NOTIFY pgrst,'reload schema';
