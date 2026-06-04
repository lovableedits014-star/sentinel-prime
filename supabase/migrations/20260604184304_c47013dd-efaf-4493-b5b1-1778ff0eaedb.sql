
CREATE OR REPLACE FUNCTION public.eleicao_indicador_info(_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_rec record; v_meta integer; v_candidato text; v_logo text;
BEGIN
  SELECT t.id AS token_id, t.client_id, t.indicador_id, t.total_indicacoes, t.revoked_at,
         p.nome, p.tipo
    INTO v_rec
    FROM public.eleicao_indicacao_tokens t
    JOIN public.eleicao_pessoas p ON p.id = t.indicador_id
   WHERE t.token = _token;
  IF v_rec IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo','token_invalido'); END IF;
  IF v_rec.revoked_at IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo','token_revogado'); END IF;

  UPDATE public.eleicao_indicacao_tokens SET ultimo_acesso_em = now() WHERE id = v_rec.token_id;

  SELECT CASE v_rec.tipo
    WHEN 'coordenador' THEN COALESCE(meta_coordenador, 30)
    WHEN 'lider' THEN COALESCE(meta_lider, 30)
    WHEN 'cabo' THEN COALESCE(meta_cabo, 5)
  END INTO v_meta
  FROM public.eleicao_indicacao_config WHERE client_id = v_rec.client_id;
  IF v_meta IS NULL THEN v_meta := CASE v_rec.tipo WHEN 'cabo' THEN 5 ELSE 30 END; END IF;

  SELECT name, logo_url INTO v_candidato, v_logo FROM public.clients WHERE id = v_rec.client_id;

  RETURN jsonb_build_object(
    'ok', true,
    'indicador_nome', v_rec.nome,
    'indicador_tipo', v_rec.tipo,
    'candidato_nome', v_candidato,
    'candidato_logo', v_logo,
    'total_indicacoes', v_rec.total_indicacoes,
    'meta', v_meta
  );
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.eleicao_indicador_info(text) TO anon, authenticated;
