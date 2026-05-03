
-- 1. CLIENTS: remove anon SELECT policy that exposed sensitive columns.
DROP POLICY IF EXISTS "Public can read basic client info" ON public.clients;
REVOKE SELECT ON public.clients FROM anon;

-- 2. CAMPAIGN_FRAMES: drop the broad public-read policy and expose data via RPC.
DROP POLICY IF EXISTS "Anyone can view active campaign frames" ON public.campaign_frames;

-- Authenticated client members keep direct SELECT access (owner + membership).
CREATE POLICY "Client members can view campaign frames"
ON public.campaign_frames
FOR SELECT
TO authenticated
USING (public.is_client_member(client_id));

-- Public portals fetch frames for a single client through this safe RPC.
CREATE OR REPLACE FUNCTION public.get_active_campaign_frames(_client_id uuid)
RETURNS TABLE (
  id uuid,
  nome text,
  image_url text,
  composition jsonb,
  display_order integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, nome, image_url, composition, display_order
  FROM public.campaign_frames
  WHERE client_id = _client_id
    AND is_active = true
  ORDER BY display_order ASC;
$$;

REVOKE ALL ON FUNCTION public.get_active_campaign_frames(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_campaign_frames(uuid) TO anon, authenticated;

-- 3. STORAGE: campaign-frames bucket — enforce per-client folder ownership.
DROP POLICY IF EXISTS "Client owners can upload campaign frame files" ON storage.objects;
DROP POLICY IF EXISTS "Client owners can update campaign frame files" ON storage.objects;
DROP POLICY IF EXISTS "Client owners can delete campaign frame files" ON storage.objects;

CREATE POLICY "Client members can upload campaign frame files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'campaign-frames'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND public.is_client_member( ((storage.foldername(name))[1])::uuid )
);

CREATE POLICY "Client members can update campaign frame files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'campaign-frames'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND public.is_client_member( ((storage.foldername(name))[1])::uuid )
);

CREATE POLICY "Client members can delete campaign frame files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'campaign-frames'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND public.is_client_member( ((storage.foldername(name))[1])::uuid )
);
