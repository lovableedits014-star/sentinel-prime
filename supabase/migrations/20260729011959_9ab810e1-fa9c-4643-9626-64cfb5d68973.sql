CREATE OR REPLACE FUNCTION public.tele_create_fila_wizard(
  _client_id uuid,
  _nome text,
  _descricao text,
  _script_intro text,
  _script_perguntas text[],
  _tags_rapidas text[],
  _origem text,
  _filtros jsonb DEFAULT '{}'::jsonb,
  _csv_rows jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_campanha_id uuid;
  v_total int := 0;
  v_cidade text := NULLIF(trim(COALESCE(_filtros->>'cidade','')),'');
  v_bairro text := NULLIF(trim(COALESCE(_filtros->>'bairro','')),'');
  v_tipo text := NULLIF(trim(COALESCE(_filtros->>'tipo','')),'');
  v_indicador_id uuid := NULLIF(_filtros->>'indicador_id','')::uuid;
  v_apenas_pendentes boolean := COALESCE((_filtros->>'apenas_pendentes')::boolean, true);
  v_substituir boolean := COALESCE((_filtros->>'substituir')::boolean, false);
BEGIN
  PERFORM public._tele_assert_client_admin(_client_id);

  IF _client_id IS NULL OR NULLIF(trim(_nome),'') IS NULL THEN
    RAISE EXCEPTION 'Cliente e nome são obrigatórios';
  END IF;

  INSERT INTO public.telemarketing_campanhas(
    client_id, nome, descricao, script_intro, script_perguntas, tags_rapidas, ativo
  ) VALUES (
    _client_id,
    trim(_nome),
    NULLIF(trim(COALESCE(_descricao,'')),''),
    NULLIF(trim(COALESCE(_script_intro,'')),''),
    to_jsonb(COALESCE(_script_perguntas, ARRAY[]::text[])),
    to_jsonb(COALESCE(_tags_rapidas, ARRAY[]::text[])),
    true
  ) RETURNING id INTO v_campanha_id;

  IF _origem = 'csv' THEN
    INSERT INTO public.telemarketing_contatos_avulsos(
      client_id, campanha_id, nome, telefone, cidade, bairro, ativo
    )
    SELECT
      _client_id,
      v_campanha_id,
      NULLIF(trim(r->>'nome'),''),
      NULLIF(regexp_replace(COALESCE(r->>'telefone',''),'\D','','g'),''),
      NULLIF(trim(r->>'cidade'),''),
      NULLIF(trim(r->>'bairro'),''),
      true
    FROM jsonb_array_elements(COALESCE(_csv_rows, '[]'::jsonb)) r
    WHERE NULLIF(trim(r->>'nome'),'') IS NOT NULL
      AND length(regexp_replace(COALESCE(r->>'telefone',''),'\D','','g')) >= 8;

    GET DIAGNOSTICS v_total = ROW_COUNT;

  ELSIF _origem = 'estrutura' THEN
    UPDATE public.eleicao_pessoas p
       SET campanha_id = v_campanha_id,
           updated_at = now()
     WHERE p.client_id = _client_id
       AND p.telefone IS NOT NULL
       AND length(regexp_replace(COALESCE(p.telefone,''),'\D','','g')) >= 8
       AND (v_cidade IS NULL OR p.cidade ILIKE v_cidade)
       AND (
         v_bairro IS NULL
         OR p.bairro ILIKE v_bairro
         OR p.regiao ILIKE v_bairro
       )
       AND (v_tipo IS NULL OR p.tipo::text = v_tipo)
       AND (v_indicador_id IS NULL OR p.parent_id = v_indicador_id)
       AND (
         NOT v_apenas_pendentes
         OR NOT EXISTS (
           SELECT 1
             FROM public.telemarketing_call_log l
            WHERE l.client_id = _client_id
              AND l.tabela = 'eleicao_pessoas'
              AND l.contato_id = p.id
         )
       )
       AND (
         v_substituir
         OR p.campanha_id IS NULL
         OR p.campanha_id = v_campanha_id
       );

    GET DIAGNOSTICS v_total = ROW_COUNT;
  ELSE
    RAISE EXCEPTION 'Origem de contatos inválida: %', _origem;
  END IF;

  RETURN jsonb_build_object('campanha_id', v_campanha_id, 'total', v_total);
END;
$function$;