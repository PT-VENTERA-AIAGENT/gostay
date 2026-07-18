-- ─── Multi-tenancy, stage 2: enforcement ──────────────────────────────────────
--
-- Every policy from 002/005/008 is re-authored here with a tenant predicate.
-- Ships together with 010: between the two the DB is tenant-aware but not
-- tenant-enforcing.
--
-- Two different tenant sources, on purpose — this is the central decision:
--
--   get_my_tenant()  — the tenant on the caller's profile. Unspoofable: it is
--                      read from the DB using auth.uid(), never from input.
--                      Guards every private table.
--
--   current_tenant() — falls back, for an anonymous visitor only, to a slug in
--                      a request header. Spoofable by definition, and that is
--                      acceptable *only* because the four policies using it
--                      select among rows each hotel already publishes on its
--                      own public website (room types, room list, rack rates,
--                      published reviews). Faking the header shows you a rival
--                      hotel's brochure — the same thing their homepage shows
--                      anyone. It never reaches bookings, customers, chats,
--                      call logs, analytics, or unpublished reviews.
--
-- If public room data ever stops being public, current_tenant() is the one
-- place to revisit.

create or replace function current_tenant()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  t    uuid;
  hdr  text;
begin
  -- Signed in: authoritative, from their profile.
  t := get_my_tenant();
  if t is not null then
    return t;
  end if;

  -- Anonymous: whichever hotel's portal they are browsing.
  begin
    hdr := nullif(current_setting('request.headers', true)::json ->> 'x-tenant-slug', '');
  exception when others then
    hdr := null;
  end;

  if hdr is not null then
    select id into t from tenants where slug = hdr and is_active;
    return t;
  end if;

  -- No header and no session. While this database holds exactly one hotel,
  -- that hotel is unambiguously the one being browsed — this keeps the portal
  -- working without every caller having to announce itself. The moment a
  -- second tenant exists the answer becomes genuinely ambiguous, so it returns
  -- null (deny) rather than guessing.
  select id into t from tenants where is_active
  having count(*) = 1
  limit 1;
  return t;
end;
$$;

revoke all on function current_tenant() from public;
grant execute on function current_tenant() to anon, authenticated, service_role;

-- ─── profiles ─────────────────────────────────────────────────────────────────
drop policy if exists "Users can view own profile" on profiles;
create policy "Users can view own profile" on profiles for select
  using (id = auth.uid());

drop policy if exists "Staff/admin can view all profiles" on profiles;
create policy "Staff/admin can view all profiles" on profiles for select
  using (get_my_role() = any (array['admin'::user_role, 'staff'::user_role])
         and tenant_id = get_my_tenant());

drop policy if exists "Users can update own profile" on profiles;
create policy "Users can update own profile" on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "Admin can update any profile" on profiles;
create policy "Admin can update any profile" on profiles for update
  using (get_my_role() = 'admin'::user_role and tenant_id = get_my_tenant())
  -- Without the CHECK an admin could move a profile into another tenant, which
  -- is both a privilege escalation and a way to smuggle a user out of scope.
  with check (get_my_role() = 'admin'::user_role and tenant_id = get_my_tenant());

-- ─── room_types (public read) ─────────────────────────────────────────────────
drop policy if exists "Anyone can view active room types" on room_types;
create policy "Anyone can view active room types" on room_types for select
  using (is_active = true and tenant_id = current_tenant());

drop policy if exists "Admin can manage room types" on room_types;
create policy "Admin can manage room types" on room_types for all
  using (get_my_role() = 'admin'::user_role and tenant_id = get_my_tenant())
  with check (get_my_role() = 'admin'::user_role and tenant_id = get_my_tenant());

-- ─── rooms (public read) ──────────────────────────────────────────────────────
drop policy if exists "Portal can view active rooms" on rooms;
create policy "Portal can view active rooms" on rooms for select
  using (is_active = true and tenant_id = current_tenant());

drop policy if exists "Staff/admin can view rooms" on rooms;
create policy "Staff/admin can view rooms" on rooms for select
  using (get_my_role() = any (array['admin'::user_role, 'staff'::user_role])
         and tenant_id = get_my_tenant());

drop policy if exists "Admin can manage rooms" on rooms;
create policy "Admin can manage rooms" on rooms for all
  using (get_my_role() = 'admin'::user_role and tenant_id = get_my_tenant())
  with check (get_my_role() = 'admin'::user_role and tenant_id = get_my_tenant());

-- ─── seasonal_pricing (public read) ───────────────────────────────────────────
drop policy if exists "Anyone can view seasonal pricing" on seasonal_pricing;
create policy "Anyone can view seasonal pricing" on seasonal_pricing for select
  using (tenant_id = current_tenant());

drop policy if exists "Admin can manage seasonal pricing" on seasonal_pricing;
create policy "Admin can manage seasonal pricing" on seasonal_pricing for all
  using (get_my_role() = 'admin'::user_role and tenant_id = get_my_tenant())
  with check (get_my_role() = 'admin'::user_role and tenant_id = get_my_tenant());

-- ─── availability_blocks ──────────────────────────────────────────────────────
drop policy if exists "Staff/admin can view blocks" on availability_blocks;
create policy "Staff/admin can view blocks" on availability_blocks for select
  using (get_my_role() = any (array['admin'::user_role, 'staff'::user_role])
         and tenant_id = get_my_tenant());

drop policy if exists "Admin can manage blocks" on availability_blocks;
create policy "Admin can manage blocks" on availability_blocks for all
  using (get_my_role() = 'admin'::user_role and tenant_id = get_my_tenant())
  with check (get_my_role() = 'admin'::user_role and tenant_id = get_my_tenant());

-- ─── customers ────────────────────────────────────────────────────────────────
drop policy if exists "Customer can view own record" on customers;
create policy "Customer can view own record" on customers for select
  using (profile_id = auth.uid());

drop policy if exists "Staff/admin can view all customers" on customers;
create policy "Staff/admin can view all customers" on customers for select
  using (get_my_role() = any (array['admin'::user_role, 'staff'::user_role])
         and tenant_id = get_my_tenant());

drop policy if exists "Signed-in user can create own customer record" on customers;
create policy "Signed-in user can create own customer record" on customers for insert
  with check (profile_id is not null and profile_id = auth.uid()
              and tenant_id = get_my_tenant());

drop policy if exists "Staff/admin can create customers" on customers;
create policy "Staff/admin can create customers" on customers for insert
  with check (get_my_role() = any (array['admin'::user_role, 'staff'::user_role])
              and tenant_id = get_my_tenant());

drop policy if exists "Customer can update own record" on customers;
create policy "Customer can update own record" on customers for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid() and tenant_id = get_my_tenant());

drop policy if exists "Staff/admin can update customers" on customers;
create policy "Staff/admin can update customers" on customers for update
  using (get_my_role() = any (array['admin'::user_role, 'staff'::user_role])
         and tenant_id = get_my_tenant())
  with check (get_my_role() = any (array['admin'::user_role, 'staff'::user_role])
              and tenant_id = get_my_tenant());

-- ─── bookings ─────────────────────────────────────────────────────────────────
drop policy if exists "Customer can view own bookings" on bookings;
create policy "Customer can view own bookings" on bookings for select
  using (customer_id in (select id from customers where profile_id = auth.uid()));

drop policy if exists "Staff/admin can view all bookings" on bookings;
create policy "Staff/admin can view all bookings" on bookings for select
  using (get_my_role() = any (array['admin'::user_role, 'staff'::user_role])
         and tenant_id = get_my_tenant());

drop policy if exists "Customer can create own bookings" on bookings;
create policy "Customer can create own bookings" on bookings for insert
  with check (customer_id in (select id from customers where profile_id = auth.uid())
              and status = 'pending'::booking_status
              and payment_status = 'pending'::payment_status
              and amount_paid = 0::numeric
              and source = 'portal'::booking_source
              and tenant_id = get_my_tenant());

drop policy if exists "Staff/admin can create bookings" on bookings;
create policy "Staff/admin can create bookings" on bookings for insert
  with check (get_my_role() = any (array['admin'::user_role, 'staff'::user_role])
              and tenant_id = get_my_tenant());

drop policy if exists "Customer can cancel own bookings" on bookings;
create policy "Customer can cancel own bookings" on bookings for update
  using (customer_id in (select id from customers where profile_id = auth.uid())
         and status = any (array['pending'::booking_status, 'confirmed'::booking_status]))
  with check (customer_id in (select id from customers where profile_id = auth.uid())
              and status = 'cancelled'::booking_status);

drop policy if exists "Staff/admin can update bookings" on bookings;
create policy "Staff/admin can update bookings" on bookings for update
  using (get_my_role() = any (array['admin'::user_role, 'staff'::user_role])
         and tenant_id = get_my_tenant())
  with check (get_my_role() = any (array['admin'::user_role, 'staff'::user_role])
              and tenant_id = get_my_tenant());

-- ─── booking_audit_log ────────────────────────────────────────────────────────
drop policy if exists "Staff/admin can view audit logs" on booking_audit_log;
create policy "Staff/admin can view audit logs" on booking_audit_log for select
  using (get_my_role() = any (array['admin'::user_role, 'staff'::user_role])
         and tenant_id = get_my_tenant());

drop policy if exists "Actors can insert audit rows in their own name" on booking_audit_log;
create policy "Actors can insert audit rows in their own name" on booking_audit_log for insert
  with check (performed_by = auth.uid() and tenant_id = get_my_tenant());

-- ─── chat_threads ─────────────────────────────────────────────────────────────
drop policy if exists "Customer can view own threads" on chat_threads;
create policy "Customer can view own threads" on chat_threads for select
  using (customer_id in (select id from customers where profile_id = auth.uid()));

drop policy if exists "Staff/admin can view all threads" on chat_threads;
create policy "Staff/admin can view all threads" on chat_threads for select
  using (get_my_role() = any (array['admin'::user_role, 'staff'::user_role])
         and tenant_id = get_my_tenant());

drop policy if exists "Customer can create threads" on chat_threads;
create policy "Customer can create threads" on chat_threads for insert
  with check (customer_id in (select id from customers where profile_id = auth.uid())
              and tenant_id = get_my_tenant());

drop policy if exists "Staff/admin can manage threads" on chat_threads;
create policy "Staff/admin can manage threads" on chat_threads for all
  using (get_my_role() = any (array['admin'::user_role, 'staff'::user_role])
         and tenant_id = get_my_tenant())
  with check (get_my_role() = any (array['admin'::user_role, 'staff'::user_role])
              and tenant_id = get_my_tenant());

-- ─── chat_messages ────────────────────────────────────────────────────────────
drop policy if exists "Users can view messages in own threads" on chat_messages;
create policy "Users can view messages in own threads" on chat_messages for select
  using (thread_id in (
    select t.id from chat_threads t join customers c on c.id = t.customer_id
    where c.profile_id = auth.uid()));

drop policy if exists "Staff/admin can view all messages" on chat_messages;
create policy "Staff/admin can view all messages" on chat_messages for select
  using (get_my_role() = any (array['admin'::user_role, 'staff'::user_role])
         and tenant_id = get_my_tenant());

drop policy if exists "Participants can send messages" on chat_messages;
create policy "Participants can send messages" on chat_messages for insert
  with check (sender_id = auth.uid()
              and tenant_id = get_my_tenant()
              and ((get_my_role() = any (array['admin'::user_role, 'staff'::user_role]))
                   or thread_id in (
                     select t.id from chat_threads t join customers c on c.id = t.customer_id
                     where c.profile_id = auth.uid())));

drop policy if exists "Staff/admin can mark messages read" on chat_messages;
create policy "Staff/admin can mark messages read" on chat_messages for update
  using (get_my_role() = any (array['admin'::user_role, 'staff'::user_role])
         and tenant_id = get_my_tenant())
  with check (get_my_role() = any (array['admin'::user_role, 'staff'::user_role])
              and tenant_id = get_my_tenant());

-- ─── call_logs ────────────────────────────────────────────────────────────────
drop policy if exists "Staff/admin can view call logs" on call_logs;
create policy "Staff/admin can view call logs" on call_logs for select
  using (get_my_role() = any (array['admin'::user_role, 'staff'::user_role])
         and tenant_id = get_my_tenant());

drop policy if exists "Staff/admin can manage call logs" on call_logs;
create policy "Staff/admin can manage call logs" on call_logs for all
  using (get_my_role() = any (array['admin'::user_role, 'staff'::user_role])
         and tenant_id = get_my_tenant())
  with check (get_my_role() = any (array['admin'::user_role, 'staff'::user_role])
              and tenant_id = get_my_tenant());

-- ─── analytics_cache ──────────────────────────────────────────────────────────
drop policy if exists "Staff/admin can view analytics" on analytics_cache;
create policy "Staff/admin can view analytics" on analytics_cache for select
  using (get_my_role() = any (array['admin'::user_role, 'staff'::user_role])
         and tenant_id = get_my_tenant());

-- ─── reviews ──────────────────────────────────────────────────────────────────
drop policy if exists "Anyone can read published reviews" on reviews;
create policy "Anyone can read published reviews" on reviews for select
  using (is_published = true and tenant_id = current_tenant());

drop policy if exists "Staff/admin can read all reviews" on reviews;
create policy "Staff/admin can read all reviews" on reviews for select
  using (get_my_role() = any (array['admin'::user_role, 'staff'::user_role])
         and tenant_id = get_my_tenant());

drop policy if exists "Customer can write own review" on reviews;
create policy "Customer can write own review" on reviews for insert
  with check (customer_id in (select id from customers where profile_id = auth.uid())
              and tenant_id = get_my_tenant());

drop policy if exists "Staff/admin can moderate reviews" on reviews;
create policy "Staff/admin can moderate reviews" on reviews for all
  using (get_my_role() = any (array['admin'::user_role, 'staff'::user_role])
         and tenant_id = get_my_tenant())
  with check (get_my_role() = any (array['admin'::user_role, 'staff'::user_role])
              and tenant_id = get_my_tenant());

-- ─── The availability RPC must not see across tenants either ──────────────────
-- 009 runs SECURITY DEFINER, which means RLS does not apply inside it: as
-- written it would happily report another hotel's rooms as bookable. The tenant
-- filter has to be explicit here precisely because the policies cannot help.
create or replace function public.available_rooms(
  p_check_in     date,
  p_check_out    date,
  p_room_type_id uuid default null
)
returns table (
  id           uuid,
  room_type_id uuid,
  number       text,
  floor        int,
  is_active    boolean,
  created_at   timestamptz,
  updated_at   timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.id, r.room_type_id, r.number, r.floor, r.is_active, r.created_at, r.updated_at
  from rooms r
  where p_check_out > p_check_in
    and r.is_active
    and r.tenant_id = current_tenant()
    and (p_room_type_id is null or r.room_type_id = p_room_type_id)
    and not exists (
      select 1 from bookings b
      where b.room_id = r.id
        and b.status in ('confirmed', 'checked_in')
        and b.check_in < p_check_out
        and b.check_out > p_check_in
    )
  order by r.number;
$$;

revoke all on function public.available_rooms(date, date, uuid) from public;
grant execute on function public.available_rooms(date, date, uuid) to anon, authenticated, service_role;
