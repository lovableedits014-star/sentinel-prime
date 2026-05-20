ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS created_by_role text;

CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_created_by
  ON public.whatsapp_instances(created_by);

ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Client owner can manage own instance" ON public.whatsapp_instances;
DROP POLICY IF EXISTS "Super admin can manage all instances" ON public.whatsapp_instances;
DROP POLICY IF EXISTS "Authorized users can view whatsapp instances" ON public.whatsapp_instances;
DROP POLICY IF EXISTS "Authorized users can create whatsapp instances" ON public.whatsapp_instances;
DROP POLICY IF EXISTS "Authorized users can update whatsapp instances" ON public.whatsapp_instances;
DROP POLICY IF EXISTS "Authorized users can delete whatsapp instances" ON public.whatsapp_instances;

CREATE POLICY "Authorized users can view whatsapp instances"
ON public.whatsapp_instances
FOR SELECT
TO authenticated
USING (
  public.is_super_admin()
  OR EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE c.id = whatsapp_instances.client_id
      AND c.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.team_members tm
    WHERE tm.client_id = whatsapp_instances.client_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
  )
);

CREATE POLICY "Authorized users can create whatsapp instances"
ON public.whatsapp_instances
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_super_admin()
  OR EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE c.id = whatsapp_instances.client_id
      AND c.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.team_members tm
    WHERE tm.client_id = whatsapp_instances.client_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
  )
);

CREATE POLICY "Authorized users can update whatsapp instances"
ON public.whatsapp_instances
FOR UPDATE
TO authenticated
USING (
  public.is_super_admin()
  OR EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE c.id = whatsapp_instances.client_id
      AND c.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.team_members tm
    WHERE tm.client_id = whatsapp_instances.client_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
  )
)
WITH CHECK (
  public.is_super_admin()
  OR EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE c.id = whatsapp_instances.client_id
      AND c.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.team_members tm
    WHERE tm.client_id = whatsapp_instances.client_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
  )
);

CREATE POLICY "Authorized users can delete whatsapp instances"
ON public.whatsapp_instances
FOR DELETE
TO authenticated
USING (
  public.is_super_admin()
  OR EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE c.id = whatsapp_instances.client_id
      AND c.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.team_members tm
    WHERE tm.client_id = whatsapp_instances.client_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
  )
);