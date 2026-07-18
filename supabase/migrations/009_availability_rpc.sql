-- ─── Availability must not depend on reading `bookings` ───────────────────────
--
-- getAvailableRooms() used to compute availability in the browser: fetch every
-- active room, then fetch `bookings` and subtract the conflicting room_ids.
-- That works only for a caller RLS lets read `bookings`. An anonymous visitor
-- reads *zero* booking rows, so the conflict set came back empty and every room
-- was reported available — the portal search silently stopped filtering, and a
-- guest could carry an already-occupied room into the booking flow.
--
-- Loosening the bookings policy would fix the symptom by leaking every guest's
-- stay dates to the public. Instead the join runs here, SECURITY DEFINER, and
-- returns only room facts. Booking rows never cross the boundary; the caller
-- learns "this room is free", not who is in it.

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
  -- An inverted or zero-night range makes the overlap test below vacuous, which
  -- would report every room free. Answer "nothing" rather than "everything".
  where p_check_out > p_check_in
    and r.is_active
    and (p_room_type_id is null or r.room_type_id = p_room_type_id)
    -- A half-open range [check_in, check_out): a stay ending on the day another
    -- begins is not a conflict, which is how the room board already treats it.
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
