
ALTER TABLE public.campaign_photo_galleries 
ADD COLUMN IF NOT EXISTS logo_url text,
ADD COLUMN IF NOT EXISTS logo_settings jsonb DEFAULT '{"position": "bottom-right", "size": 15, "margin": 3, "opacity": 1}'::jsonb,
ADD COLUMN IF NOT EXISTS enable_auto_logo boolean DEFAULT false;

ALTER TABLE public.campaign_photo_gallery_items
ADD COLUMN IF NOT EXISTS logo_override_settings jsonb;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_photo_galleries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_photo_gallery_items TO authenticated;
GRANT ALL ON public.campaign_photo_galleries TO service_role;
GRANT ALL ON public.campaign_photo_gallery_items TO service_role;
GRANT SELECT ON public.campaign_photo_galleries TO anon;
GRANT SELECT ON public.campaign_photo_gallery_items TO anon;
