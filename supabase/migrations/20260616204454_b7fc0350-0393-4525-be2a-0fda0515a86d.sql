DROP FUNCTION IF EXISTS public.get_eleicao_portal_config(uuid);

ALTER TABLE public.eleicao_notif_config
  ADD COLUMN IF NOT EXISTS cadastro_voluntario_ativo boolean NOT NULL DEFAULT true;

CREATE FUNCTION public.get_eleicao_portal_config(_client_id uuid)
RETURNS TABLE(
  cadastro_lider_ativo boolean,
  cadastro_cabo_ativo boolean,
  cadastro_voluntario_ativo boolean,
  grupos_links jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    COALESCE(c.cadastro_lider_ativo, true) AS cadastro_lider_ativo,
    COALESCE(c.cadastro_cabo_ativo, true) AS cadastro_cabo_ativo,
    COALESCE(c.cadastro_voluntario_ativo, true) AS cadastro_voluntario_ativo,
    COALESCE(c.grupos_links, '{}'::jsonb) AS grupos_links
  FROM public.eleicao_notif_config c
  WHERE c.client_id = _client_id
    AND (
      public.is_super_admin()
      OR public.user_can_access_client(_client_id)
      OR EXISTS (
        SELECT 1
        FROM public.eleicao_pessoas p
        WHERE p.client_id = _client_id
          AND p.user_id = auth.uid()
          AND p.tipo = 'coordenador'
      )
    )
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_eleicao_portal_config(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.eleicao_indicar_via_token(
  _token text, _nome text, _telefone text,
  _cidade text DEFAULT NULL, _bairro text DEFAULT NULL, _observacao text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_tok record; v_norm text; v_existing uuid; v_count_today integer; v_limite integer; v_id uuid; v_ativo boolean;
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

  SELECT COALESCE(limite_diario_token, 200) INTO v_limite
    FROM public.eleicao_indicacao_config WHERE client_id = v_tok.client_id;
  v_limite := COALESCE(v_limite, 200);

  SELECT count(*) INTO v_count_today
    FROM public.eleicao_indicados
   WHERE token_id = v_tok.id AND created_at > now() - interval '24 hours';
  IF v_count_today >= v_limite THEN
    RETURN jsonb_build_object('ok', false, 'motivo','limite_diario');
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
$fn$;

GRANT EXECUTE ON FUNCTION public.eleicao_indicar_via_token(text,text,text,text,text,text) TO anon, authenticated;