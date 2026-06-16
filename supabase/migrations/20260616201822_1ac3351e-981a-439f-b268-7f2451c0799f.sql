CREATE OR REPLACE FUNCTION public.eleicao_listar_indicados_token(_token text)
RETURNS TABLE(id uuid, nome text, telefone text, bairro text, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.id, i.nome, i.telefone, i.bairro, i.created_at
  FROM public.eleicao_indicados i
  JOIN public.eleicao_indicacao_tokens t ON t.id = i.token_id
  WHERE t.token = _token
  ORDER BY i.created_at DESC
  LIMIT 50;
$$;

GRANT EXECUTE ON FUNCTION public.eleicao_listar_indicados_token(text) TO anon, authenticated;