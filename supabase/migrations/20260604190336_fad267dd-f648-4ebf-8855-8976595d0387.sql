CREATE OR REPLACE FUNCTION public.eleicao_gerar_token_indicador(_indicador_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_client_id uuid;
  v_token text;
BEGIN
  SELECT client_id INTO v_client_id
  FROM public.eleicao_pessoas
  WHERE id = _indicador_id;

  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'Indicador não encontrado';
  END IF;

  IF NOT public.user_can_access_client(v_client_id) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  UPDATE public.eleicao_indicacao_tokens
  SET revoked_at = now()
  WHERE indicador_id = _indicador_id
    AND revoked_at IS NULL;

  v_token := encode(extensions.gen_random_bytes(24), 'base64');
  v_token := replace(replace(replace(v_token, '+', '-'), '/', '_'), '=', '');

  INSERT INTO public.eleicao_indicacao_tokens(client_id, indicador_id, token)
  VALUES (v_client_id, _indicador_id, v_token);

  RETURN v_token;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.eleicao_gerar_token_indicador(uuid) TO authenticated;