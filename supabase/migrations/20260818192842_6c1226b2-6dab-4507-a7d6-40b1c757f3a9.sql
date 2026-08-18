-- Políticas de RLS para o bucket meta-media
create policy "Acesso Público Leitura Meta Media"
on storage.objects for select
to public
using (bucket_id = 'meta-media');

create policy "Upload Autenticado Meta Media"
on storage.objects for insert
to authenticated
with check (bucket_id = 'meta-media');

create policy "Delete Autenticado Meta Media"
on storage.objects for delete
to authenticated
using (bucket_id = 'meta-media');
