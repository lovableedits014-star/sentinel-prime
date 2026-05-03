
-- 1) Remove broad public INSERT on contratados; registration must go via the
--    register-contratado edge function (which validates invite/referral codes).
DROP POLICY IF EXISTS "Public can register contratado" ON public.contratados;

-- 2) Tighten invite_tokens UPDATE: only the SECURITY DEFINER RPC can mark a
--    token as used. Replace the broad UPDATE policy with no direct policy.
DROP POLICY IF EXISTS "Authenticated can mark invite as used" ON public.invite_tokens;

CREATE OR REPLACE FUNCTION public.claim_invite_token(_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  UPDATE public.invite_tokens
     SET used_by = v_uid,
         used_at = now()
   WHERE token = _token
     AND used_by IS NULL
     AND expires_at > now()
   RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'invalid or expired token';
  END IF;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_invite_token(text) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_invite_token(text) TO authenticated;

-- 3) Stop broadcasting sensitive PII / dispatch data to all Realtime subscribers.
ALTER PUBLICATION supabase_realtime DROP TABLE public.supporters;
ALTER PUBLICATION supabase_realtime DROP TABLE public.whatsapp_dispatches;

-- 4) Make WhatsApp media bucket private and require client membership for reads.
UPDATE storage.buckets SET public = false WHERE id = 'whatsapp-media';

DROP POLICY IF EXISTS "whatsapp-media public read" ON storage.objects;
CREATE POLICY "whatsapp-media members read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'whatsapp-media'
  AND (storage.foldername(name))[1] = 'dispatches'
  AND public.is_client_member(((storage.foldername(name))[2])::uuid)
);

-- 5) Revoke SELECT on sensitive credential columns from regular roles.
REVOKE SELECT (whatsapp_bridge_api_key, whatsapp_bridge_url) ON public.clients FROM authenticated, anon;
REVOKE SELECT (bridge_api_key, instance_token, qr_code) ON public.whatsapp_instances FROM authenticated, anon;
REVOKE SELECT (llm_api_key, meta_access_token) ON public.integrations FROM authenticated, anon;
