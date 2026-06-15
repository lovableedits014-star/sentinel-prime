
create table public.campaign_materials (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null,
  description text,
  tags text[] not null default '{}',
  kind text not null check (kind in ('image','video','pdf')),
  mime_type text not null,
  storage_path text not null,
  public_url text not null,
  cover_url text,
  size_bytes bigint not null default 0,
  download_count int not null default 0,
  order_index int not null default 0,
  status text not null default 'published' check (status in ('draft','published')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.campaign_materials to anon;
grant select, insert, update, delete on public.campaign_materials to authenticated;
grant all on public.campaign_materials to service_role;

alter table public.campaign_materials enable row level security;

create policy "public read published materials"
  on public.campaign_materials for select to anon
  using (status = 'published');

create policy "team read all materials"
  on public.campaign_materials for select to authenticated
  using (public.user_can_access_client(client_id));

create policy "team insert materials"
  on public.campaign_materials for insert to authenticated
  with check (public.user_can_access_client(client_id));

create policy "team update materials"
  on public.campaign_materials for update to authenticated
  using (public.user_can_access_client(client_id));

create policy "team delete materials"
  on public.campaign_materials for delete to authenticated
  using (public.user_can_access_client(client_id));

create index campaign_materials_client_idx on public.campaign_materials (client_id, status, order_index);

create trigger update_campaign_materials_updated_at
  before update on public.campaign_materials
  for each row execute function public.update_updated_at_column();

create or replace function public.increment_material_download(_material_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.campaign_materials
     set download_count = download_count + 1
   where id = _material_id and status = 'published';
$$;

grant execute on function public.increment_material_download(uuid) to anon, authenticated;
