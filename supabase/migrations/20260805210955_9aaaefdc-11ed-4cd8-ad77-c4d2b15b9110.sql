-- 1) Metas padrão 40/25/2
ALTER TABLE public.eleicao_indicacao_config
  ALTER COLUMN meta_coordenador SET DEFAULT 40,
  ALTER COLUMN meta_lider SET DEFAULT 25,
  ALTER COLUMN meta_cabo SET DEFAULT 2;

UPDATE public.eleicao_indicacao_config
   SET meta_coordenador = 40, meta_lider = 25, meta_cabo = 2;

-- 2) Remove trava de limite diário no cadastro via token
CREATE OR REPLACE FUNCTION public.eleicao_indicar_via_token(_token text, _nome text, _telefone text, _cidade text DEFAULT NULL::text, _bairro text DEFAULT NULL::text, _observacao text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_tok record; v_norm text; v_existing uuid; v_id uuid; v_ativo boolean;
BEGIN
  IF _nome IS NULL OR length(trim(_nome)) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'motivo','nome_invalido');
  END IF;
  v_norm := regexp_replace(coalesce(_telefone,''), '\D', '', 'g');
  IF length(v_norm) < 10 OR length(v_norm) > 13 THEN
    RETURN jsonb_build_object('ok', false, 'motivo','telefone_invalido');
  END IF;
  SELECT t.id, t.client_id, t.indicador_id, p.tipo, t.revoked_at
    INTO v_tok
    FROM public.eleicao_indicacao_tokens t
    JOIN public.eleicao_pessoas p ON p.id = t.indicador_id
   WHERE t.token = _token;
  IF v_tok IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo','token_invalido'); END IF;
  IF v_tok.revoked_at IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo','token_revogado'); END IF;

  SELECT COALESCE(cadastro_voluntario_ativo, true) INTO v_ativo
    FROM public.eleicao_notif_config WHERE client_id = v_tok.client_id;
  IF v_ativo IS NOT NULL AND v_ativo = false THEN
    RETURN jsonb_build_object('ok', false, 'motivo','cadastros_bloqueados');
  END IF;

  SELECT id INTO v_existing FROM public.eleicao_indicados
   WHERE client_id = v_tok.client_id AND telefone_norm = v_norm;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo','duplicado');
  END IF;

  INSERT INTO public.eleicao_indicados(
    client_id, indicador_id, indicador_tipo, token_id,
    nome, telefone, telefone_norm, cidade, bairro, observacao, origem
  ) VALUES (
    v_tok.client_id, v_tok.indicador_id, v_tok.tipo, v_tok.id,
    trim(_nome), trim(_telefone), v_norm,
    NULLIF(trim(coalesce(_cidade,'')),''),
    NULLIF(trim(coalesce(_bairro,'')),''),
    NULLIF(trim(coalesce(_observacao,'')),''),
    'link_publico'
  ) RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$function$;

-- 3) Importação em lote
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

    SELECT i.nome INTO v_owner FROM public.eleicao_indicados i
     WHERE i.client_id = v_p.client_id AND i.telefone_norm = v_norm LIMIT 1;
    IF v_owner IS NOT NULL THEN
      v_dups := v_dups || jsonb_build_object('nome', v_nome, 'telefone', v_tel, 'motivo', 'ja_cadastrado', 'existente', v_owner);
      v_owner := NULL;
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

REVOKE ALL ON FUNCTION public.eleicao_indicar_lote(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.eleicao_indicar_lote(uuid, jsonb) TO authenticated;

-- 4) View com metas 40/25/2 e sinalizador de fora da meta
CREATE OR REPLACE VIEW public.v_eleicao_indicadores_cobranca AS
 SELECT p.id AS indicador_id,
    p.client_id,
    p.nome,
    p.tipo,
    p.telefone,
    p.regiao,
    p.cidade,
    p.parent_id,
    t.id AS token_id,
    t.token,
    COALESCE(t.total_indicacoes, 0) AS total_indicacoes,
        CASE p.tipo
            WHEN 'coordenador'::eleicao_tipo THEN COALESCE(c.meta_coordenador, 40)
            WHEN 'lider'::eleicao_tipo THEN COALESCE(c.meta_lider, 25)
            WHEN 'cabo'::eleicao_tipo THEN COALESCE(c.meta_cabo, 2)
            ELSE NULL::integer
        END AS meta,
    t.ultimo_acesso_em,
    ( SELECT max(l.enviado_em) AS max
           FROM eleicao_cobranca_log l
          WHERE (l.indicador_id = p.id)) AS ultima_cobranca_em,
    ( SELECT count(*) AS count
           FROM eleicao_cobranca_log l
          WHERE (l.indicador_id = p.id)) AS cobrancas_enviadas,
        (COALESCE(t.total_indicacoes, 0) <
        CASE p.tipo
            WHEN 'coordenador'::eleicao_tipo THEN COALESCE(c.meta_coordenador, 40)
            WHEN 'lider'::eleicao_tipo THEN COALESCE(c.meta_lider, 25)
            WHEN 'cabo'::eleicao_tipo THEN COALESCE(c.meta_cabo, 2)
            ELSE 0
        END) AS fora_da_meta
   FROM ((eleicao_pessoas p
     LEFT JOIN eleicao_indicacao_tokens t ON (((t.indicador_id = p.id) AND (t.revoked_at IS NULL))))
     LEFT JOIN eleicao_indicacao_config c ON ((c.client_id = p.client_id)));