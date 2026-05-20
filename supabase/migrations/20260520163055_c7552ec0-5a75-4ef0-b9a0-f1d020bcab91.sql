
-- Junior:    f32cbbdd-4b47-4a06-b25f-bf92d1448304
-- Wellington:2f48d92f-786a-4a5c-a89d-2ad47aa252c2

-- 1. Limpa fichas de gerente criadas indevidamente
DELETE FROM public.clients
WHERE user_id NOT IN (
  'f32cbbdd-4b47-4a06-b25f-bf92d1448304',
  '2f48d92f-786a-4a5c-a89d-2ad47aa252c2'
);

-- 2. Reclassifica roles: quem tem 'client' mas NÃO é gerente vira 'portal_pessoa'
UPDATE public.user_roles
SET role = 'portal_pessoa'
WHERE role = 'client'
  AND user_id NOT IN (
    'f32cbbdd-4b47-4a06-b25f-bf92d1448304',
    '2f48d92f-786a-4a5c-a89d-2ad47aa252c2'
  );

-- 3. Trigger refeito: nunca mais auto-promove a gerente. Olha account_type.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_account_type text;
  v_name text;
BEGIN
  v_account_type := NEW.raw_user_meta_data->>'account_type';
  v_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    NEW.email,
    'Usuário'
  );

  -- Profile sempre é criado
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, v_name)
  ON CONFLICT (id) DO NOTHING;

  IF v_account_type = 'gerente' THEN
    -- Gerente do SaaS: role 'client' + ficha em clients
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'client')
    ON CONFLICT (user_id, role) DO NOTHING;

    INSERT INTO public.clients (user_id, name)
    VALUES (NEW.id, v_name)
    ON CONFLICT DO NOTHING;

  ELSIF v_account_type = 'funcionario' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'funcionario')
    ON CONFLICT (user_id, role) DO NOTHING;

  ELSIF v_account_type = 'portal_pessoa' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'portal_pessoa')
    ON CONFLICT (user_id, role) DO NOTHING;

  ELSE
    -- Sem account_type: NÃO cria role. Admin atribui depois.
    -- Isso garante que ninguém vira gerente por engano.
    NULL;
  END IF;

  RETURN NEW;
END;
$function$;
