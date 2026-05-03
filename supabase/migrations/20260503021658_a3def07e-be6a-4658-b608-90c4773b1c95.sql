-- Criar profiles para todos os usuários auth (a tabela estava vazia no dump)
INSERT INTO public.profiles (id, email, full_name)
SELECT u.id, u.email, COALESCE(u.raw_user_meta_data->>'full_name', u.email)
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

-- Garantir user_roles para todos
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'client'::app_role
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id);

-- Remover helper temporário
DROP FUNCTION IF EXISTS public.__lovable_migrate_exec(text);