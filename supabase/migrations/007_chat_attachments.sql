-- GoStay HMS — Storage bucket for chat attachments.
--
-- The message row that references an attachment is already gated by the
-- "Participants can send messages" policy, so upload only needs to require a
-- signed-in user. Files carry a random path segment and the bucket is public
-- for simple rendering; for stricter privacy, switch public=false and serve via
-- createSignedUrl.

insert into storage.buckets (id, name, public)
  values ('chat-attachments', 'chat-attachments', true)
  on conflict (id) do nothing;

drop policy if exists "Read chat attachments" on storage.objects;
create policy "Read chat attachments"
  on storage.objects for select
  using (bucket_id = 'chat-attachments');

drop policy if exists "Signed-in upload chat attachments" on storage.objects;
create policy "Signed-in upload chat attachments"
  on storage.objects for insert
  with check (bucket_id = 'chat-attachments' and auth.uid() is not null);
