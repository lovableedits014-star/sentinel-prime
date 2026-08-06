CREATE OR REPLACE FUNCTION public.eleicao_indicar_lote(_indicador_id uuid, _linhas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_p record;
  v_token_id uuid;
  v_item jsonb;
  v_nome text; v_tel text; v_norm text; v_bairro text; v_cidade text;
  v_inseridos int := 0;
  v_dups jsonb := '[]'::jsonb;
  v_invs jsonb := '[]'::jsonb;
  v_seen text[] := '{}';
  v_owner text;
  v_vinculo text;
BEGIN
  SELECT id, client_id, tipo, cidade INTO v_p
    FROM public.eleicao_pessoas WHERE id = _indicador_id;
  IF v_p IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'indicador_invalido');
  END IF;

  IF NOT public.eleicao_pessoa_in_user_tree(_indicador_id) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_permissao');
  END IF;

  SELECT id INTO v_token_id FROM public.eleicao_indicacao_tokens
   WHERE indicador_id = _indicador_id AND revoked_at IS NULL
   ORDER BY created_at DESC LIMIT 1;
  IF v_token_id IS NULL THEN
    PERFORM public.eleicao_gerar_token_indicador(_indicador_id);
    SELECT id INTO v_token_id FROM public.eleicao_indicacao_tokens
     WHERE indicador_id = _indicador_id AND revoked_at IS NULL
     ORDER BY created_at DESC LIMIT 1;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(_linhas, '[]'::jsonb)) LOOP
    v_nome := trim(coalesce(v_item->>'nome',''));
    v_tel := coalesce(v_item->>'telefone','');
    v_bairro := NULLIF(trim(coalesce(v_item->>'bairro','')),'');
    v_cidade := NULLIF(trim(coalesce(v_item->>'cidade','')),'');
    v_norm := regexp_replace(v_tel, '\D', '', 'g');

    IF length(v_nome) < 2 THEN
      v_invs := v_invs || jsonb_build_object('nome', v_nome, 'telefone', v_tel, 'motivo', 'nome_invalido');
      CONTINUE;
    END IF;
    IF length(v_norm) < 10 OR length(v_norm) > 13 THEN
      v_invs := v_invs || jsonb_build_object('nome', v_nome, 'telefone', v_tel, 'motivo', 'telefone_invalido');
      CONTINUE;
    END IF;
    IF v_norm = ANY(v_seen) THEN
      v_dups := v_dups || jsonb_build_object('nome', v_nome, 'telefone', v_tel, 'motivo', 'repetido_na_planilha');
      CONTINUE;
    END IF;
    v_seen := array_append(v_seen, v_norm);

    -- Busca duplicidade em indicações com info do dono
    SELECT i.nome, p.nome INTO v_owner, v_vinculo
     FROM public.eleicao_indicados i
     JOIN public.eleicao_pessoas p ON p.id = i.indicador_id
     WHERE i.client_id = v_p.client_id AND i.telefone_norm = v_norm LIMIT 1;

    -- Se não achou em indicados, busca em eleicao_pessoas (contatos principais)
    IF v_owner IS NULL THEN
       SELECT nome, 'Cadastro Principal' INTO v_owner, v_vinculo
       FROM public.eleicao_pessoas
       WHERE client_id = v_p.client_id AND regexp_replace(telefone, '\D', '', 'g') = v_norm LIMIT 1;
    END IF;

    IF v_owner IS NOT NULL THEN
      v_dups := v_dups || jsonb_build_object(
        'nome', v_nome, 
        'telefone', v_tel, 
        'motivo', 'ja_cadastrado', 
        'existente', v_owner || ' (Vinculado a: ' || v_vinculo || ')'
      );
      v_owner := NULL; v_vinculo := NULL;
      CONTINUE;
    END IF;

    INSERT INTO public.eleicao_indicados(
      client_id, indicador_id, indicador_tipo, token_id,
      nome, telefone, telefone_norm, cidade, bairro, origem
    ) VALUES (
      v_p.client_id, v_p.id, v_p.tipo, v_token_id,
      v_nome, trim(v_tel), v_norm, coalesce(v_cidade, v_p.cidade), v_bairro,
      'importacao_planilha'
    );
    v_inseridos := v_inseridos + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'inseridos', v_inseridos,
    'duplicados', v_dups,
    'invalidos', v_invs
  );
END;
$function$;