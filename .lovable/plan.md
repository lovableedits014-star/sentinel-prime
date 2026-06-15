# Materiais de Campanha para Download

Adicionar uma nova aba **"Materiais"** dentro da página pública `/g/:clientSlug` (`GaleriaPublica.tsx`), ao lado das seções já existentes (Moldura + Eventos). Apoiadores poderão visualizar e baixar peças de campanha e pré-campanha (PDF, imagens, vídeos) para compartilhar.

## Como vai funcionar

### Visitante público (`/g/:clientSlug`)
- A página passa a ter **abas**: "Eventos" (atual) e **"Materiais"** (nova).
- Aba Materiais mostra **uma lista única** com filtros no topo:
  - Busca por nome
  - Tipo: Todos · Imagem · Vídeo · PDF
  - Chips de tags clicáveis (ex.: "Santinho", "Stories", "Pré-campanha")
- Cada material vira um **card** com:
  - **Preview inline** antes do download:
    - Imagem → miniatura grande
    - Vídeo → `<video controls>` com poster
    - PDF → 1ª página renderizada (capa enviada no upload) + botão "Abrir PDF"
  - Título, tags, tamanho do arquivo
  - **Contador** "X downloads"
  - Botões: **Baixar** · **Compartilhar no WhatsApp**

### Admin (`/fotos-campanha`)
- Nova aba **"Materiais"** no `FotosCampanha.tsx` (hoje tem "Editor" e "Galerias públicas").
- Qualquer `team_member` ativo do cliente pode:
  - Subir arquivo (PDF, PNG, JPEG, WEBP, MP4) — limite 100 MB por arquivo
  - Preencher: título, tags (multi), capa opcional (imagem para PDF/vídeo), publicar sim/não
  - Reordenar, editar, despublicar e remover
- Tabela com nome, tipo, tags, downloads, status, ações.

## Detalhes técnicos

### Banco (migração)

```sql
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
  cover_url text,                 -- capa opcional (para PDF/vídeo)
  size_bytes bigint not null default 0,
  download_count int not null default 0,
  order_index int not null default 0,
  status text not null default 'published' check (status in ('draft','published')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.campaign_materials to anon;          -- leitura pública
grant select, insert, update, delete on public.campaign_materials to authenticated;
grant all on public.campaign_materials to service_role;

alter table public.campaign_materials enable row level security;

-- Público lê apenas materiais publicados
create policy "public read published"
  on public.campaign_materials for select to anon
  using (status = 'published');

-- Equipe do cliente lê tudo
create policy "team read all"
  on public.campaign_materials for select to authenticated
  using (user_can_access_client(client_id));

-- Equipe gerencia
create policy "team insert"  on public.campaign_materials for insert to authenticated with check (user_can_access_client(client_id));
create policy "team update"  on public.campaign_materials for update to authenticated using (user_can_access_client(client_id));
create policy "team delete"  on public.campaign_materials for delete to authenticated using (user_can_access_client(client_id));

-- RPC para incrementar downloads sem precisar de UPDATE público
create or replace function public.increment_material_download(_material_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.campaign_materials
     set download_count = download_count + 1
   where id = _material_id and status = 'published';
$$;
grant execute on function public.increment_material_download(uuid) to anon, authenticated;
```

### Storage
- Novo bucket **público** `campaign-materials` (criado via `storage_create_bucket`, public=true).
- Path: `{client_id}/{material_id}/{filename}`.
- Capas (quando enviadas): `{client_id}/{material_id}/cover.{ext}`.
- RLS de `storage.objects`: insert/update/delete restritos a `user_can_access_client(...)` via prefixo do path; select público (bucket público).

### Frontend
- **Admin** — `src/components/campaign-materials/MaterialsManager.tsx`:
  - Form de upload (drag-and-drop), grid/tabela, edição inline, reorder com drag handle.
  - Reaproveita padrões de `GalleryManager.tsx`.
  - Aba registrada em `src/pages/FotosCampanha.tsx`.
- **Público** — `src/components/campaign-materials/PublicMaterialsTab.tsx`:
  - Lista + filtros + cards com preview.
  - WhatsApp share via `https://wa.me/?text=` com `encodeURIComponent` (título + link público).
  - Download: `<a download>` apontando para `public_url`; em paralelo dispara `supabase.rpc("increment_material_download", { _material_id })`.
- **`GaleriaPublica.tsx`** ganha `<Tabs>` "Eventos" / "Materiais".
- Validação com **zod** no form de upload (título 1–120 chars, tags ≤ 8, tamanho ≤ 100 MB, mime na allowlist).

### Segurança / cuidados
- Nada de `service_role` no cliente; incremento de downloads passa pela RPC `security definer`.
- Mime/extensão validados no client antes do upload (não confia no nome).
- `created_by = auth.uid()` setado no insert para auditoria.
- Sem PII pública — só metadados de campanha.

## Arquivos afetados

- **Novo**: migração SQL (tabela + policies + RPC)
- **Novo**: `src/components/campaign-materials/MaterialsManager.tsx`
- **Novo**: `src/components/campaign-materials/PublicMaterialsTab.tsx`
- **Novo**: `src/components/campaign-materials/types.ts`
- **Editado**: `src/pages/FotosCampanha.tsx` (3ª aba)
- **Editado**: `src/pages/GaleriaPublica.tsx` (abas Eventos/Materiais)
- **Editado**: `src/integrations/supabase/types.ts` (auto-regenerado)

## Fora do escopo (posso adicionar depois se quiser)
- Categorias/pastas explícitas (vamos usar tags por enquanto)
- Baixar tudo em ZIP
- Estatísticas detalhadas por material (quem baixou, quando)
- Watermark automático em imagens

Posso seguir com a implementação?