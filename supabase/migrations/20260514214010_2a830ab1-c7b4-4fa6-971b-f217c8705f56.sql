
-- Tabela de favoritos persistentes por número de telefone (sobrevive à exclusão da instância)
CREATE TABLE IF NOT EXISTS public.whatsapp_group_favorites (
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  group_jid TEXT NOT NULL,
  group_name TEXT,
  favorited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, phone_number, group_jid)
);

CREATE INDEX IF NOT EXISTS idx_wagroup_fav_lookup
  ON public.whatsapp_group_favorites (client_id, phone_number);

ALTER TABLE public.whatsapp_group_favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view group favorites" ON public.whatsapp_group_favorites;
CREATE POLICY "Members can view group favorites" ON public.whatsapp_group_favorites
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.clients c WHERE c.id = whatsapp_group_favorites.client_id AND c.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.team_members t WHERE t.client_id = whatsapp_group_favorites.client_id AND t.user_id = auth.uid() AND t.status = 'active')
  );

DROP POLICY IF EXISTS "Owners can manage group favorites" ON public.whatsapp_group_favorites;
CREATE POLICY "Owners can manage group favorites" ON public.whatsapp_group_favorites
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = whatsapp_group_favorites.client_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = whatsapp_group_favorites.client_id AND c.user_id = auth.uid()));

-- Backfill: importa favoritos existentes usando o telefone da instância dona
INSERT INTO public.whatsapp_group_favorites (client_id, phone_number, group_jid, group_name, favorited_at)
SELECT DISTINCT ON (g.client_id, regexp_replace(COALESCE(i.phone_number, ''), '\D', '', 'g'), g.group_jid)
  g.client_id,
  regexp_replace(COALESCE(i.phone_number, ''), '\D', '', 'g') AS phone_number,
  g.group_jid,
  g.name,
  COALESCE(g.updated_at, now())
FROM public.whatsapp_groups g
JOIN public.whatsapp_instances i ON i.id = g.instance_id
WHERE g.is_favorite = true
  AND COALESCE(i.phone_number, '') <> ''
ON CONFLICT (client_id, phone_number, group_jid) DO NOTHING;
