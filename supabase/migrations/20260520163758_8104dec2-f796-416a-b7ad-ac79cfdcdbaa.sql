
-- Wellington: 2f48d92f-786a-4a5c-a89d-2ad47aa252c2
-- Junior:     f32cbbdd-4b47-4a06-b25f-bf92d1448304

-- 1. Remove ficha de cliente do Wellington (foi erro meu — ele é gerente, não dono)
DELETE FROM public.clients
WHERE user_id = '2f48d92f-786a-4a5c-a89d-2ad47aa252c2';

-- 2. Ajusta a role dele: deixa de ser 'client' e vira 'funcionario' (padrão dos team_members)
UPDATE public.user_roles
SET role = 'funcionario'
WHERE user_id = '2f48d92f-786a-4a5c-a89d-2ad47aa252c2'
  AND role = 'client';
