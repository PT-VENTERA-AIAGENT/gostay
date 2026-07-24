-- ─── Storage was the hole tenancy never covered ───────────────────────────────
--
-- Every tenant-owned TABLE has been tenant-scoped since 011, and a sweep of all
-- 30 of them (staff, customer and anon) comes back clean. `storage.objects` was
-- not: its policies key on bucket_id alone, and a bucket has no tenant column.
--
-- 1. chat-attachments (007) — bucket public=true and
--        for select using (bucket_id = 'chat-attachments')
--    no `to` clause, so the policy applies to `anon` as well. Verified against
--    the live project: an anonymous client could list('') the bucket (getting
--    every thread id), list each folder (getting every file name) and fetch the
--    object over the public CDN URL — HTTP 200. Every hotel's chat attachments
--    were readable by anyone, no account needed. The "random path segment" the
--    007 comment relied on protects nothing once list() is allowed.
--
-- 2. room-photos — 006 restricted writes to `admin`; 027 widened them to
--    `staff` (correct: a hotel manages its own rooms) but kept the predicate at
--    `bucket_id = 'room-photos'` with no tenant term. So any hotel's staff could
--    upload into, or DELETE from, any other hotel's photo folder.
--
-- Both buckets carry their owner in the first path segment — chat attachments as
-- `{thread_id}/…` (chatService.uploadChatAttachment), room photos as
-- `{room_type_id}/…` (RoomTypeDetail.handleUpload) — so the fix is to resolve
-- that segment back to a tenant and compare it with the caller's, the same shape
-- 023 already uses for hotel-logos.

-- ─── Helpers ──────────────────────────────────────────────────────────────────

-- The first path segment as a uuid, or NULL when it is not one. A junk object
-- name must fail the policy, not raise 22P02 and take the whole request down.
create or replace function public.storage_owner_uuid(objname text)
returns uuid
language sql
immutable
set search_path = public, storage, pg_temp
as $$
  select case
    when (storage.foldername(objname))[1] ~
         '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then ((storage.foldername(objname))[1])::uuid
  end;
$$;

-- May the caller see this chat thread? Mirrors the chat_threads/chat_messages
-- policies from 011 exactly: platform admin, staff of the thread's own tenant,
-- or the guest the thread belongs to.
--
-- SECURITY DEFINER on purpose: a policy's subquery is itself subject to the
-- referenced table's RLS, so reading chat_threads from inside a storage policy
-- would silently return nothing for the guest branch. The function answers a
-- boolean and never returns a row, so it leaks nothing beyond "yes/no".
create or replace function public.can_access_chat_thread(p_thread uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from chat_threads t
    where t.id = p_thread
      and (
        get_my_role() = 'admin'::user_role
        or (get_my_role() = 'staff'::user_role and t.tenant_id = get_my_tenant())
        or t.customer_id in (select c.id from customers c where c.profile_id = auth.uid())
      )
  );
$$;

revoke all on function public.storage_owner_uuid(text) from public;
grant execute on function public.storage_owner_uuid(text) to anon, authenticated, service_role;
revoke all on function public.can_access_chat_thread(uuid) from public;
grant execute on function public.can_access_chat_thread(uuid) to anon, authenticated, service_role;

-- ─── 1. chat-attachments: private bucket, participants only ───────────────────

-- Public read is what made the CDN URL work without a token. Signed URLs replace
-- it (chatService.signedAttachmentUrl); anything still holding an old
-- /object/public/ URL now gets 400 rather than the file.
update storage.buckets set public = false where id = 'chat-attachments';

drop policy if exists "Read chat attachments" on storage.objects;
create policy "Read own chat attachments"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-attachments'
    and public.can_access_chat_thread(public.storage_owner_uuid(name))
  );

-- Upload was `auth.uid() is not null` — any signed-in user could drop a file
-- into any thread's folder. Same predicate as read: it must be your thread.
drop policy if exists "Signed-in upload chat attachments" on storage.objects;
create policy "Participants upload chat attachments"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-attachments'
    and public.can_access_chat_thread(public.storage_owner_uuid(name))
  );

-- No update/delete policy: nothing in the app removes an attachment, and a
-- missing policy denies rather than guesses.

-- ─── 2. room-photos: a hotel writes only its own room types ───────────────────
-- Read stays public — the photos are the brochure the portal shows anonymously.

drop policy if exists "Admin upload room photos" on storage.objects;
drop policy if exists "Hotel upload room photos" on storage.objects;
create policy "Hotel upload own room photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'room-photos'
    and public.get_my_role() = any (array['admin', 'staff']::user_role[])
    and exists (
      select 1 from room_types rt
      where rt.id = public.storage_owner_uuid(name)
        and (public.get_my_role() = 'admin'::user_role or rt.tenant_id = public.get_my_tenant())
    )
  );

drop policy if exists "Admin delete room photos" on storage.objects;
drop policy if exists "Hotel delete room photos" on storage.objects;
create policy "Hotel delete own room photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'room-photos'
    and public.get_my_role() = any (array['admin', 'staff']::user_role[])
    and exists (
      select 1 from room_types rt
      where rt.id = public.storage_owner_uuid(name)
        and (public.get_my_role() = 'admin'::user_role or rt.tenant_id = public.get_my_tenant())
    )
  );

-- ─── 3. hotel_payment_mode(uuid) was executable by anon ───────────────────────
-- It answers "is this hotel's gateway live or test?" for ANY tenant id, to a
-- caller with no session. Nothing in the app calls it from the browser — it is a
-- resolver for server-side payment code — so drop the anon/authenticated grant.
revoke execute on function hotel_payment_mode(uuid) from anon, authenticated;
