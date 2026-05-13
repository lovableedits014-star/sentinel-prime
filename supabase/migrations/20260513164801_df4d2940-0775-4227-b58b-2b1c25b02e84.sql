
CREATE TABLE public.platform_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  name text NOT NULL,
  email text NOT NULL,
  allowed_paths text[] NOT NULL DEFAULT ARRAY[]::text[],
  status text NOT NULL DEFAULT 'active',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin manages platform_users"
ON public.platform_users
FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

CREATE POLICY "User reads own platform_users row"
ON public.platform_users
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE TRIGGER platform_users_set_updated_at
BEFORE UPDATE ON public.platform_users
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
