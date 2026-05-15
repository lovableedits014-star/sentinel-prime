
-- 1) Novos campos em team_members
ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS allowed_paths text[] NOT NULL DEFAULT ARRAY['*']::text[],
  ADD COLUMN IF NOT EXISTS is_manager boolean NOT NULL DEFAULT false;

-- 2) 1 usuário = 1 cliente (regra escolhida)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'team_members_user_id_unique'
  ) THEN
    ALTER TABLE public.team_members
      ADD CONSTRAINT team_members_user_id_unique UNIQUE (user_id);
  END IF;
END$$;

-- 3) Função utilitária para o frontend ler as abas liberadas
CREATE OR REPLACE FUNCTION public.user_allowed_paths(_client_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    -- super admin: tudo
    WHEN public.is_super_admin() THEN ARRAY['*']::text[]
    -- dono do client: tudo
    WHEN EXISTS (SELECT 1 FROM public.clients c WHERE c.id = _client_id AND c.user_id = auth.uid()) THEN ARRAY['*']::text[]
    -- team member: o que estiver salvo
    ELSE COALESCE((
      SELECT allowed_paths FROM public.team_members
      WHERE client_id = _client_id AND user_id = auth.uid() AND status = 'active'
      LIMIT 1
    ), ARRAY[]::text[])
  END;
$$;

-- 4) Política: gerente do cliente pode gerenciar team_members do mesmo cliente
DROP POLICY IF EXISTS "Manager can manage team of own client" ON public.team_members;
CREATE POLICY "Manager can manage team of own client"
ON public.team_members
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.user_id = auth.uid()
      AND tm.client_id = team_members.client_id
      AND tm.is_manager = true
      AND tm.status = 'active'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.user_id = auth.uid()
      AND tm.client_id = team_members.client_id
      AND tm.is_manager = true
      AND tm.status = 'active'
  )
);

-- 5) Migrar mayer (platform_users -> team_members vinculado ao Junior Coringa)
INSERT INTO public.team_members (client_id, user_id, name, email, role, status, allowed_paths, is_manager)
SELECT
  '6879803f-fd2e-4a43-8d0d-4417e1b1fe15'::uuid,
  pu.user_id,
  pu.name,
  pu.email,
  'operacional',
  pu.status,
  pu.allowed_paths,
  false
FROM public.platform_users pu
WHERE pu.email = 'mayer014@gmail.com'
  AND NOT EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.user_id = pu.user_id);
