
-- Helper: returns true if auth.uid() owns or is a team member of given client_id
CREATE OR REPLACE FUNCTION public.is_client_member(_client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clients c WHERE c.id = _client_id AND c.user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.client_id = _client_id AND tm.user_id = auth.uid() AND tm.status = 'active'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_client_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_client_member(uuid) TO authenticated;

-- birthday-images: tighten write policies
DROP POLICY IF EXISTS "Client owners can upload birthday images" ON storage.objects;
DROP POLICY IF EXISTS "Client owners can delete birthday images" ON storage.objects;
DROP POLICY IF EXISTS "Client owners can update birthday images" ON storage.objects;

CREATE POLICY "Client owners can upload birthday images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'birthday-images'
  AND public.is_client_member( ((storage.foldername(name))[1])::uuid )
);

CREATE POLICY "Client owners can update birthday images"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'birthday-images'
  AND public.is_client_member( ((storage.foldername(name))[1])::uuid )
);

CREATE POLICY "Client owners can delete birthday images"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'birthday-images'
  AND public.is_client_member( ((storage.foldername(name))[1])::uuid )
);

-- campaign-frame-assets: require ownership of first-folder client_id
DROP POLICY IF EXISTS "Authenticated upload campaign frame assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update campaign frame assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete campaign frame assets" ON storage.objects;

CREATE POLICY "Client owners can upload campaign frame assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'campaign-frame-assets'
  AND public.is_client_member( ((storage.foldername(name))[1])::uuid )
);

CREATE POLICY "Client owners can update campaign frame assets"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'campaign-frame-assets'
  AND public.is_client_member( ((storage.foldername(name))[1])::uuid )
);

CREATE POLICY "Client owners can delete campaign frame assets"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'campaign-frame-assets'
  AND public.is_client_member( ((storage.foldername(name))[1])::uuid )
);

-- whatsapp-media: remove open public write; require auth + client ownership.
-- Convention: path = 'dispatches/{clientId}/...'. Service role bypasses RLS.
DROP POLICY IF EXISTS "whatsapp-media service write" ON storage.objects;
DROP POLICY IF EXISTS "whatsapp-media client write" ON storage.objects;
DROP POLICY IF EXISTS "whatsapp-media client update" ON storage.objects;
DROP POLICY IF EXISTS "whatsapp-media client delete" ON storage.objects;

CREATE POLICY "whatsapp-media client write"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'whatsapp-media'
  AND (storage.foldername(name))[1] = 'dispatches'
  AND public.is_client_member( ((storage.foldername(name))[2])::uuid )
);

CREATE POLICY "whatsapp-media client update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'whatsapp-media'
  AND (storage.foldername(name))[1] = 'dispatches'
  AND public.is_client_member( ((storage.foldername(name))[2])::uuid )
);

CREATE POLICY "whatsapp-media client delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'whatsapp-media'
  AND (storage.foldername(name))[1] = 'dispatches'
  AND public.is_client_member( ((storage.foldername(name))[2])::uuid )
);
