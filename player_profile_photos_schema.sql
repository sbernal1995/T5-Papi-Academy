-- Profile photos for T5 Papi Academy players.
-- Run this in the Supabase SQL editor to enable saving player profile photos.

alter table public.jugadores
add column if not exists foto_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'jugadores-fotos',
  'jugadores-fotos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "jugadores fotos public read" on storage.objects;
create policy "jugadores fotos public read"
on storage.objects
for select
using (bucket_id = 'jugadores-fotos');

drop policy if exists "jugadores fotos authenticated insert" on storage.objects;
create policy "jugadores fotos authenticated insert"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'jugadores-fotos');

drop policy if exists "jugadores fotos authenticated update" on storage.objects;
create policy "jugadores fotos authenticated update"
on storage.objects
for update
to authenticated
using (bucket_id = 'jugadores-fotos')
with check (bucket_id = 'jugadores-fotos');

drop policy if exists "jugadores fotos authenticated delete" on storage.objects;
create policy "jugadores fotos authenticated delete"
on storage.objects
for delete
to authenticated
using (bucket_id = 'jugadores-fotos');
