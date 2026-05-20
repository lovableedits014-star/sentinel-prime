
-- 1. Backfill: criar ficha de cliente para todo usuário com role='client' que ainda não tem
INSERT INTO public.clients (user_id, name)
SELECT
  ur.user_id,
  COALESCE(NULLIF(p.full_name, ''), NULLIF(u.email, ''), 'Cliente')
FROM public.user_roles ur
JOIN auth.users u ON u.id = ur.user_id
LEFT JOIN public.profiles p ON p.id = ur.user_id
LEFT JOIN public.clients c ON c.user_id = ur.user_id
WHERE ur.role = 'client'
  AND c.id IS NULL;

-- 2. Atualizar trigger handle_new_user para criar a ficha de cliente automaticamente
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'client');

  -- Cria ficha de cliente padrão (não vai criar pro super admin, que já tem)
  INSERT INTO public.clients (user_id, name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email, 'Cliente'))
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$function$;

-- 3. RLS em public.clients: super admin enxerga e gerencia tudo (sem virar dono)
DROP POLICY IF EXISTS "Admins can view all clients" ON public.clients;
DROP POLICY IF EXISTS "Users can view their own clients" ON public.clients;
DROP POLICY IF EXISTS "Users can create their own clients" ON public.clients;
DROP POLICY IF EXISTS "Users can update their own clients" ON public.clients;
DROP POLICY IF EXISTS "Super admin can view all clients" ON public.clients;
DROP POLICY IF EXISTS "Super admin can insert clients" ON public.clients;
DROP POLICY IF EXISTS "Super admin can update all clients" ON public.clients;

CREATE POLICY "Owner or super admin can view clients"
ON public.clients FOR SELECT
USING (auth.uid() = user_id OR public.is_super_admin());

CREATE POLICY "Owner or super admin can insert clients"
ON public.clients FOR INSERT
WITH CHECK (auth.uid() = user_id OR public.is_super_admin());

CREATE POLICY "Owner or super admin can update clients"
ON public.clients FOR UPDATE
USING (auth.uid() = user_id OR public.is_super_admin())
WITH CHECK (auth.uid() = user_id OR public.is_super_admin());

CREATE POLICY "Super admin can delete clients"
ON public.clients FOR DELETE
USING (public.is_super_admin());
