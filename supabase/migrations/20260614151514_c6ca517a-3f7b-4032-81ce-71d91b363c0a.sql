
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS public_slug text UNIQUE;

CREATE TABLE public.campaign_photo_galleries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  slug text NOT NULL,
  nome text NOT NULL,
  event_date date,
  frame_id uuid REFERENCES public.campaign_frames(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  cover_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (client_id, slug)
);
GRANT SELECT ON public.campaign_photo_galleries TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_photo_galleries TO authenticated;
GRANT ALL ON public.campaign_photo_galleries TO service_role;
ALTER TABLE public.campaign_photo_galleries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view published galleries" ON public.campaign_photo_galleries
  FOR SELECT TO anon, authenticated USING (status = 'published');
CREATE POLICY "Client members can view all galleries" ON public.campaign_photo_galleries
  FOR SELECT TO authenticated USING (is_client_member(client_id));
CREATE POLICY "Client members can insert galleries" ON public.campaign_photo_galleries
  FOR INSERT TO authenticated WITH CHECK (is_client_member(client_id));
CREATE POLICY "Client members can update galleries" ON public.campaign_photo_galleries
  FOR UPDATE TO authenticated USING (is_client_member(client_id));
CREATE POLICY "Client members can delete galleries" ON public.campaign_photo_galleries
  FOR DELETE TO authenticated USING (is_client_member(client_id));

CREATE TABLE public.campaign_photo_gallery_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  gallery_id uuid NOT NULL REFERENCES public.campaign_photo_galleries(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  original_file_name text,
  storage_path text NOT NULL,
  public_url text NOT NULL,
  width int,
  height int,
  order_index int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_gallery_items_gallery ON public.campaign_photo_gallery_items(gallery_id, order_index);
GRANT SELECT ON public.campaign_photo_gallery_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_photo_gallery_items TO authenticated;
GRANT ALL ON public.campaign_photo_gallery_items TO service_role;
ALTER TABLE public.campaign_photo_gallery_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view items of published galleries" ON public.campaign_photo_gallery_items
  FOR SELECT TO anon, authenticated USING (
    EXISTS (SELECT 1 FROM public.campaign_photo_galleries g
            WHERE g.id = gallery_id AND g.status = 'published')
  );
CREATE POLICY "Client members manage gallery items" ON public.campaign_photo_gallery_items
  FOR ALL TO authenticated
  USING (is_client_member(client_id))
  WITH CHECK (is_client_member(client_id));

CREATE TRIGGER trg_galleries_updated_at
  BEFORE UPDATE ON public.campaign_photo_galleries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.get_public_client_by_slug(_slug text)
RETURNS TABLE(id uuid, name text, logo_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT c.id, c.name, ci.logo_url
  FROM public.clients c
  LEFT JOIN public.candidate_identity ci ON ci.client_id = c.id
  WHERE c.public_slug = _slug OR c.id::text = _slug
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_public_client_by_slug(text) TO anon, authenticated;
