DO $migration$
DECLARE
  v_fn regprocedure;
  v_definition text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.tele_list_contatos(uuid,text,text,uuid)'::regprocedure,
    'public.tele_buscar_contato(uuid,text,text,text,uuid,integer)'::regprocedure,
    'public.tele_proximo_contato(uuid,text,text,uuid,integer)'::regprocedure,
    'public.tele_operador_campanhas(uuid,text,text)'::regprocedure
  ]
  LOOP
    v_definition := pg_get_functiondef(v_fn);
    v_definition := replace(
      v_definition,
      'SELECT campanha_id FROM allowed',
      'SELECT allowed.campanha_id FROM allowed AS allowed'
    );
    EXECUTE v_definition;
  END LOOP;
END
$migration$;