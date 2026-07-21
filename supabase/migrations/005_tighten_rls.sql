-- GoStay HMS — Close the privilege-escalation and public-write holes in 002
--
-- 002_rls_policies.sql enabled RLS on every table, which made it look locked
-- down. Several policies were written with USING but no WITH CHECK, and two
-- were written `using (true)`. Both mistakes read as harmless and are not:
--
--   * For UPDATE, Postgres falls back to the USING expression as the WITH CHECK
--     when none is given. USING only decides *which rows you may touch* — it
--     says nothing about what you may turn them into. "Users can update own
--     profile" therefore let any customer run
--         update profiles set role = 'admin' where id = auth.uid();
--     because the row still satisfies `id = auth.uid()` afterwards. That is a
--     full self-promotion to admin from the browser console.
--   * A policy with no `to` clause applies to PUBLIC, which includes `anon`.
--     `using (true)` on analytics_cache and booking_audit_log meant anyone on
--     the internet could read the revenue table and forge audit history.
--
-- Rule of thumb this migration applies throughout: every UPDATE and INSERT
-- policy states its WITH CHECK explicitly, and no policy is `using (true)`.
-- Writes that genuinely need to bypass RLS go through the service_role key,
-- which bypasses it by design (api/_lib/provision.ts).

-- ─── 1. Hardening the helpers ────────────────────────────────────────────────
-- get_my_role() is SECURITY DEFINER, so it runs as its owner. Without a pinned
-- search_path a caller can prepend a schema and shadow `profiles` with their
-- own table, which would let them return any role they like. Every staff/admin
-- policy funnels through this function, so it has to be pinned.
create or replace function get_my_role()
returns user_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from profiles where id = auth.uid() and is_active
$$;

-- The triggers below enforce what RLS cannot (RLS has no column granularity).
-- Two callers legitimately write these columns and must not be caught by them:
-- server-side provisioning holding the service_role key (api/_lib/provision.ts),
-- and a human in the SQL editor bootstrapping the first admin (.env.example).
-- RLS is bypassed for both, but triggers still fire, so the guards check here.
--
-- session_user, not current_user: current_user follows SET ROLE *and* is
-- rewritten to the function owner inside a SECURITY DEFINER function — which is
-- exactly what the guards below are. Reading it there would report the owner
-- ('postgres') for every caller and quietly disable every check in this file.
-- session_user is immune to both and still names whoever actually connected:
-- 'authenticator' for any PostgREST request, the superuser for a direct session.
create or replace function is_privileged_context()
returns boolean
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  claims json;
begin
  if session_user in ('postgres', 'supabase_admin') then
    return true;
  end if;
  begin
    claims := nullif(current_setting('request.jwt.claims', true), '')::json;
  exception when others then
    return false;
  end;
  return coalesce(claims ->> 'role', '') = 'service_role';
end;
$$;

-- ─── 2. profiles — stop self-promotion ───────────────────────────────────────
-- The hole: a customer editing their own row could set role = 'admin'.
-- RLS cannot say "every column except role", so the policy keeps letting a user
-- update their own row and a trigger guards the three columns that are not
-- theirs to set: role, is_active, and the identity itself.
drop policy if exists "Users can update own profile" on profiles;
create policy "Users can update own profile"
  on profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "Admin can update any profile" on profiles;
create policy "Admin can update any profile"
  on profiles for update
  using (get_my_role() = 'admin')
  with check (get_my_role() = 'admin');

create or replace function guard_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if is_privileged_context() then
    return new;
  end if;

  -- get_my_role() is STABLE, so it reads the pre-update snapshot: an admin
  -- demoting themselves is still an admin for the duration of the statement.
  if (new.role is distinct from old.role
      or new.is_active is distinct from old.is_active)
     and get_my_role() is distinct from 'admin' then
    raise exception 'only an admin may change role or is_active'
      using errcode = '42501';
  end if;

  -- The identity is derived from the SSO subject by api/_lib/identity.ts.
  -- Re-pointing it would let a user inherit another profile's rows.
  if new.id is distinct from old.id or new.sso_sub is distinct from old.sso_sub then
    raise exception 'profile identity is immutable'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_profile_privileged_columns on profiles;
create trigger guard_profile_privileged_columns
  before update on profiles
  for each row execute function guard_profile_privileged_columns();

-- ─── 3. analytics_cache — was world readable and world writable ──────────────
-- "System can write analytics" was `for all using (true)`. FOR ALL covers
-- SELECT too, and policies are OR'd, so it silently overrode the two admin/staff
-- read policies below it: anon could read every revenue figure and overwrite it.
-- Nothing in src/ writes this table; the only writer would be a server job
-- holding the service_role key, which does not need a policy at all.
drop policy if exists "System can write analytics" on analytics_cache;

drop policy if exists "Admin can view analytics" on analytics_cache;
drop policy if exists "Staff can view analytics" on analytics_cache;
create policy "Staff/admin can view analytics"
  on analytics_cache for select
  using (get_my_role() in ('admin', 'staff'));

-- ─── 4. booking_audit_log — was forgeable by anyone ──────────────────────────
-- `with check (true)` let anon insert audit rows attributed to any profile.
-- The audit trail is the one record of who did what, so it must at minimum be
-- honest about the actor: you may only write rows in your own name.
drop policy if exists "System can insert audit logs" on booking_audit_log;
create policy "Actors can insert audit rows in their own name"
  on booking_audit_log for insert
  with check (performed_by = auth.uid());

-- An audit trail that can be edited after the fact is not an audit trail.
-- No UPDATE or DELETE policy exists, so both are denied to everyone; a service
-- job can still correct rows with the service_role key if it ever must.

-- ─── 5. bookings — a customer could rewrite their own price ──────────────────
-- "Customer can cancel own pending bookings" was named for cancelling but was
-- an unrestricted UPDATE: with no WITH CHECK, a customer could set
-- total_amount = 0, flip payment_status to 'paid', or move the dates.
-- The policy now pins the outcome to a cancellation, and the trigger freezes
-- the columns a guest must never move.
drop policy if exists "Customer can cancel own pending bookings" on bookings;
create policy "Customer can cancel own bookings"
  on bookings for update
  using (
    customer_id in (select id from customers where profile_id = auth.uid())
    and status in ('pending', 'confirmed')
  )
  with check (
    customer_id in (select id from customers where profile_id = auth.uid())
    and status = 'cancelled'
  );

drop policy if exists "Staff/admin can update bookings" on bookings;
create policy "Staff/admin can update bookings"
  on bookings for update
  using (get_my_role() in ('admin', 'staff'))
  with check (get_my_role() in ('admin', 'staff'));

-- Per PRD §"Booking creation": the portal INSERTs with status='pending' and
-- confirmation is a separate, staff-side (or server-side) step. A booking that
-- arrives already 'confirmed' and 'paid' from the browser is a free stay.
drop policy if exists "Customer can create own bookings" on bookings;
create policy "Customer can create own bookings"
  on bookings for insert
  with check (
    customer_id in (select id from customers where profile_id = auth.uid())
    and status = 'pending'
    and payment_status = 'pending'
    and amount_paid = 0
    and source = 'portal'
  );

drop policy if exists "Staff/admin can create bookings" on bookings;
create policy "Staff/admin can create bookings"
  on bookings for insert
  with check (get_my_role() in ('admin', 'staff'));

create or replace function guard_booking_customer_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if is_privileged_context() or get_my_role() in ('admin', 'staff') then
    return new;
  end if;

  -- Reached only by a customer cancelling their own booking. Everything that
  -- decides money or occupancy is staff-owned and frozen here; the RLS policy
  -- above has already pinned the new status to 'cancelled'.
  if new.total_amount   is distinct from old.total_amount
     or new.amount_paid    is distinct from old.amount_paid
     or new.payment_status is distinct from old.payment_status
     or new.room_id        is distinct from old.room_id
     or new.customer_id    is distinct from old.customer_id
     or new.check_in       is distinct from old.check_in
     or new.check_out      is distinct from old.check_out
     or new.reference      is distinct from old.reference
     or new.internal_notes is distinct from old.internal_notes then
    raise exception 'a customer may only cancel a booking, not modify it'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_booking_customer_columns on bookings;
create trigger guard_booking_customer_columns
  before update on bookings
  for each row execute function guard_booking_customer_columns();

-- total_amount arrives from the browser, where it was computed in React and
-- carried through router state — so a guest can name their own price. WITH CHECK
-- cannot express "and the arithmetic is right", so the price is recomputed here
-- from the room's own rate for anything a customer inserts.
--
-- base_rate * nights is exactly what the portal charges today
-- (PortalRoomDetail.tsx: `room.base_rate * nights`). seasonal_pricing exists in
-- the schema but no portal path applies it; when one does, this function is the
-- place that has to learn about it, or correct prices will start being rejected.
create or replace function enforce_portal_booking_price()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  rate numeric(12,2);
  expected numeric(14,2);
begin
  if is_privileged_context() or get_my_role() in ('admin', 'staff') then
    return new;  -- staff quote prices at the desk; only the portal is fixed-rate.
  end if;

  select rt.base_rate into rate
  from rooms r
  join room_types rt on rt.id = r.room_type_id
  where r.id = new.room_id;

  if rate is null then
    raise exception 'unknown room' using errcode = '42501';
  end if;

  expected := rate * (new.check_out - new.check_in);

  if new.total_amount is distinct from expected then
    raise exception 'total_amount % does not match the room rate (expected %)',
      new.total_amount, expected
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_portal_booking_price on bookings;
create trigger enforce_portal_booking_price
  before insert on bookings
  for each row execute function enforce_portal_booking_price();

-- internal_notes is staff-only commentary about a guest, and the portal selects
-- bookings with `*`. Customers can read their own booking row by design, so the
-- column has to be blanked at the source rather than hidden by a policy.
revoke select (internal_notes) on bookings from anon, authenticated;
grant select (internal_notes) on bookings to service_role;

-- ─── 6. chat_messages — anyone could post into anyone's thread ───────────────
-- `with check (sender_id = auth.uid())` proved only that you were not forging
-- the sender. It never checked the *thread*, so any signed-in customer could
-- inject messages into a stranger's conversation by guessing a thread id.
drop policy if exists "Authenticated users can send messages" on chat_messages;
create policy "Participants can send messages"
  on chat_messages for insert
  with check (
    sender_id = auth.uid()
    and (
      get_my_role() in ('admin', 'staff')
      or thread_id in (
        select t.id from chat_threads t
        join customers c on c.id = t.customer_id
        where c.profile_id = auth.uid()
      )
    )
  );

drop policy if exists "Staff/admin can mark messages read" on chat_messages;
create policy "Staff/admin can mark messages read"
  on chat_messages for update
  using (get_my_role() in ('admin', 'staff'))
  with check (get_my_role() in ('admin', 'staff'));

-- ─── 7. customers — pin the owner on write ───────────────────────────────────
-- Both of these lacked a WITH CHECK. The insert policy's check also has to
-- survive `profile_id = null`: `null = auth.uid()` is NULL, not false, and a
-- WITH CHECK treats NULL as a failure — but only by accident. State it.
drop policy if exists "Anyone can create own customer record" on customers;
create policy "Signed-in user can create own customer record"
  on customers for insert
  with check (profile_id is not null and profile_id = auth.uid());

drop policy if exists "Customer can update own record" on customers;
create policy "Customer can update own record"
  on customers for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists "Staff/admin can update customers" on customers;
create policy "Staff/admin can update customers"
  on customers for update
  using (get_my_role() in ('admin', 'staff'))
  with check (get_my_role() in ('admin', 'staff'));

-- ─── 8. chat_threads / rooms / room_types — pin the write side ───────────────
drop policy if exists "Customer can create threads" on chat_threads;
create policy "Customer can create threads"
  on chat_threads for insert
  with check (
    customer_id in (select id from customers where profile_id = auth.uid())
  );

drop policy if exists "Staff/admin can manage threads" on chat_threads;
create policy "Staff/admin can manage threads"
  on chat_threads for all
  using (get_my_role() in ('admin', 'staff'))
  with check (get_my_role() in ('admin', 'staff'));

-- `for all using (...)` without a check lets an admin write a row they could
-- not then read. Harmless today, wrong the moment the using clause narrows.
drop policy if exists "Admin can manage room types" on room_types;
create policy "Admin can manage room types"
  on room_types for all
  using (get_my_role() = 'admin')
  with check (get_my_role() = 'admin');

drop policy if exists "Admin can manage rooms" on rooms;
create policy "Admin can manage rooms"
  on rooms for all
  using (get_my_role() = 'admin')
  with check (get_my_role() = 'admin');

drop policy if exists "Admin can manage seasonal pricing" on seasonal_pricing;
create policy "Admin can manage seasonal pricing"
  on seasonal_pricing for all
  using (get_my_role() = 'admin')
  with check (get_my_role() = 'admin');

drop policy if exists "Admin can manage blocks" on availability_blocks;
create policy "Admin can manage blocks"
  on availability_blocks for all
  using (get_my_role() = 'admin')
  with check (get_my_role() = 'admin');

drop policy if exists "Staff/admin can manage call logs" on call_logs;
create policy "Staff/admin can manage call logs"
  on call_logs for all
  using (get_my_role() in ('admin', 'staff'))
  with check (get_my_role() in ('admin', 'staff'));
