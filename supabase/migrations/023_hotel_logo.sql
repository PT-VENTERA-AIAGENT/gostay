-- Storage for hotel logos, so staff upload an image instead of pasting a URL.
-- Public-read (the logo shows on the guest portal); writes limited to a hotel's
-- own staff, and only into a folder named after their tenant id — so one hotel
-- can never overwrite another's logo.

insert into storage.buckets (id, name, public)
  values ('hotel-logos', 'hotel-logos', true)
  on conflict (id) do nothing;

drop policy if exists "Public read hotel logos" on storage.objects;
create policy "Public read hotel logos"
  on storage.objects for select
  using (bucket_id = 'hotel-logos');

-- The first path segment must equal the caller's tenant id. get_my_tenant()
-- returns a uuid, so cast to text to compare with the folder name.
drop policy if exists "Staff manage own hotel logo" on storage.objects;
create policy "Staff manage own hotel logo"
  on storage.objects for all
  using (
    bucket_id = 'hotel-logos'
    and public.get_my_role() in ('staff'::user_role, 'admin'::user_role)
    and (storage.foldername(name))[1] = public.get_my_tenant()::text
  )
  with check (
    bucket_id = 'hotel-logos'
    and public.get_my_role() in ('staff'::user_role, 'admin'::user_role)
    and (storage.foldername(name))[1] = public.get_my_tenant()::text
  );
