-- 1. Novo tipo de evento
ALTER TYPE public.mission_event_type ADD VALUE IF NOT EXISTS 'click_link';

-- 2. Tabela de links manuais
CREATE TABLE IF NOT EXISTS public.portal_mission_links (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mission_id uuid NOT NULL REFERENCES public.portal_missions(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  label text NOT NULL,
  url text NOT NULL,
  kind text NOT NULL DEFAULT 'generico',
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portal_mission_links_mission ON public.portal_mission_links(mission_id, display_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_mission_links TO authenticated;
GRANT ALL ON public.portal_mission_links TO service_role;

ALTER TABLE public.portal_mission_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Client members manage mission links" ON public.portal_mission_links;
CREATE POLICY "Client members manage mission links"
ON public.portal_mission_links FOR ALL TO authenticated
USING (public.is_client_member(client_id))
WITH CHECK (public.is_client_member(client_id));

DROP TRIGGER IF EXISTS trg_portal_mission_links_updated ON public.portal_mission_links;
CREATE TRIGGER trg_portal_mission_links_updated
BEFORE UPDATE ON public.portal_mission_links
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Clique atribuído ao link
ALTER TABLE public.mission_events
  ADD COLUMN IF NOT EXISTS mission_link_id uuid REFERENCES public.portal_mission_links(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_mission_events_link ON public.mission_events(mission_link_id);
