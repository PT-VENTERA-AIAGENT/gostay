-- GoStay HMS — Storage bucket for room type photos.
--
-- Photos are public (they show on the marketing portal to anyone), but only an
-- admin may upload or remove them. Column-level table privileges cannot express
-- that, so it rides on storage.objects RLS keyed to get_my_role(), the same
-- helper every other policy uses.

insert into storage.buckets (id, name, public)
  values ('room-photos', 'room-photos', true)
  on conflict (id) do nothing;

-- Anyone can view (the bucket is public and the portal is unauthenticated).
drop policy if exists "Public read room photos" on storage.objects;
create policy "Public read room photos"
  on storage.objects for select
  using (bucket_id = 'room-photos');

-- Only an admin writes. get_my_role() returns NULL for anon/customer/staff, so
-- the check fails closed for everyone else.
drop policy if exists "Admin upload room photos" on storage.objects;
create policy "Admin upload room photos"
  on storage.objects for insert
  with check (bucket_id = 'room-photos' and public.get_my_role() = 'admin');

drop policy if exists "Admin delete room photos" on storage.objects;
create policy "Admin delete room photos"
  on storage.objects for delete
  using (bucket_id = 'room-photos' and public.get_my_role() = 'admin');
