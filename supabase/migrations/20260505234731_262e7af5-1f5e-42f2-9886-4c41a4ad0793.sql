update public.eleicao_pessoas ep
set user_id = au.id
from auth.users au
where ep.tipo = 'coordenador'
  and ep.email is not null
  and lower(ep.email) = lower(au.email)
  and ep.user_id is distinct from au.id;