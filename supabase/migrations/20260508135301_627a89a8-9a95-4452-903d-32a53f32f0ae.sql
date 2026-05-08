
-- Tabela de grupos de WhatsApp sincronizados de uma instância
CREATE TABLE IF NOT EXISTS public.whatsapp_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  instance_id UUID NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  group_jid TEXT NOT NULL,
  name TEXT,
  picture_url TEXT,
  participants_count INTEGER DEFAULT 0,
  is_admin BOOLEAN DEFAULT false,
  is_announcement BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (instance_id, group_jid)
);

CREATE INDEX IF NOT EXISTS idx_wagroups_client ON public.whatsapp_groups(client_id);
CREATE INDEX IF NOT EXISTS idx_wagroups_instance ON public.whatsapp_groups(instance_id);

ALTER TABLE public.whatsapp_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view groups" ON public.whatsapp_groups;
CREATE POLICY "Members can view groups" ON public.whatsapp_groups
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.clients c WHERE c.id = whatsapp_groups.client_id AND c.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.team_members t WHERE t.client_id = whatsapp_groups.client_id AND t.user_id = auth.uid() AND t.status = 'active')
  );

DROP POLICY IF EXISTS "Owners can manage groups" ON public.whatsapp_groups;
CREATE POLICY "Owners can manage groups" ON public.whatsapp_groups
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = whatsapp_groups.client_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = whatsapp_groups.client_id AND c.user_id = auth.uid()));

CREATE TRIGGER trg_wagroups_updated_at
  BEFORE UPDATE ON public.whatsapp_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Permite items de disparo apontarem para grupo (quando group_jid preenchido, telefone vira opcional)
ALTER TABLE public.whatsapp_dispatch_items
  ADD COLUMN IF NOT EXISTS group_jid TEXT;

ALTER TABLE public.whatsapp_dispatch_items
  ALTER COLUMN telefone DROP NOT NULL;
