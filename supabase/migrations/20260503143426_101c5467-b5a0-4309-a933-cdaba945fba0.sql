
REVOKE SELECT (senha) ON public.telemarketing_operadores FROM authenticated, anon;

DROP FUNCTION IF EXISTS public.validate_referral_code(text, uuid);

CREATE FUNCTION public.validate_referral_code(_code text, _client_id uuid)
RETURNS TABLE(valid boolean, referrer_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    TRUE AS valid,
    COALESCE(sa.name, '') AS referrer_name
  FROM public.referral_codes rc
  LEFT JOIN public.supporter_accounts sa ON sa.id = rc.supporter_account_id
  WHERE rc.code = _code
    AND rc.client_id = _client_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.validate_referral_code(text, uuid) TO anon, authenticated;
