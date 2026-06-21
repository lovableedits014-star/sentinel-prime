DROP POLICY IF EXISTS "public read published materials" ON public.campaign_materials;

CREATE POLICY "anyone reads published materials"
ON public.campaign_materials
FOR SELECT
TO anon, authenticated
USING (status = 'published');