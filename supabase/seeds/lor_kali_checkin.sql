-- Put YOUR OWN WhatsApp number in-house at Lor Kali, so the room-service flow
-- can be tested from a real phone.
--
-- Why this is separate from lor_kali.sql: the seeded guests are fictional, and
-- the WhatsApp side does not find a guest by phone — resolveOrProvisionGuest
-- looks a customer up by `profile_id`, which only exists once that number has
-- actually messaged the hotel. Pre-creating a customer with your phone would
-- therefore be ignored, and WhatsApp would quietly make a SECOND one.
--
-- So the order matters:
--   1. Send any message to Lor Kali's WhatsApp (e.g. "halo"). That provisions
--      your profile + customer row.
--   2. Run this, passing the same number in the 62… form, digits only:
--
--      psql "$SETUP_DB_CONNECTION_STRING" -v ON_ERROR_STOP=1 \
--           -v phone=6281234567890 -f supabase/seeds/lor_kali_checkin.sql
--
--   3. Message "menu". You should now get the room-service list instead of the
--      greeting — which is the whole point of the guest-state gate.
--
-- Re-running is safe: if that number already has a checked_in stay, nothing
-- changes.

\set ON_ERROR_STOP on

-- psql does NOT substitute :'phone' inside a dollar-quoted body, so the value is
-- handed to the block through a session setting instead of being inlined.
select set_config('seed.phone', :'phone', false);

do $$
declare
  t          uuid := '0cfdd376-f6c9-4d8d-ac39-fa77e24cc64e';
  want_phone text := current_setting('seed.phone');
  cust       uuid;
  rm         uuid;
  rate       numeric(12,2);
  nights     int  := 3;
  bk         uuid;
begin
  if want_phone !~ '^[0-9]{8,20}$' then
    raise exception
      'phone % is not digits-only. Pass it as 62… with no +, spaces or @suffix.', want_phone;
  end if;

  select id into cust
  from customers
  where tenant_id = t and phone = want_phone
  order by created_at desc
  limit 1;

  if cust is null then
    raise exception
      'no customer at Lor Kali with phone %. Send a WhatsApp message to the hotel first — that is what creates your profile and customer row.',
      want_phone;
  end if;

  -- Already staying? Leave it alone; this script is meant to be re-runnable.
  select id into bk from bookings
  where tenant_id = t and customer_id = cust and status = 'checked_in'
  limit 1;
  if bk is not null then
    raise notice 'customer % is already checked in (booking %) — nothing to do', cust, bk;
    return;
  end if;

  -- A room nobody else is occupying right now. Ordering by number keeps the
  -- choice predictable across runs rather than whatever the planner returns.
  select r.id, rt.base_rate into rm, rate
  from rooms r
  join room_types rt on rt.id = r.room_type_id
  where r.tenant_id = t
    and r.is_active
    and not exists (
      select 1 from bookings b
      where b.room_id = r.id
        and b.status in ('checked_in', 'confirmed')
        and b.check_in < current_date + nights
        and b.check_out > current_date - 1
    )
  order by r.number
  limit 1;

  if rm is null then
    raise exception 'every room at Lor Kali is occupied for the next % nights — free one first', nights;
  end if;

  -- total_amount is rate × nights exactly, matching enforce_portal_booking_price
  -- so this stays valid however it is run. `reference` is left to the
  -- set_booking_reference trigger, as a real booking would be.
  insert into bookings (
    tenant_id, customer_id, room_id, check_in, check_out,
    num_adults, num_children, status, total_amount, amount_paid,
    payment_status, source, special_requests
  )
  values (
    t, cust, rm, current_date - 1, current_date + (nights - 1),
    1, 0, 'checked_in', rate * nights, rate * nights,
    'paid', 'walk_in', 'Booking uji coba untuk menguji alur WhatsApp.'
  )
  returning id into bk;

  raise notice 'checked in: customer % -> booking % (% nights, Rp %)', cust, bk, nights, rate * nights;
end $$;

-- What the WhatsApp engine will now see for this number.
select c.phone, c.full_name, r.number as kamar, b.reference, b.status, b.check_in, b.check_out
from bookings b
join customers c on c.id = b.customer_id
join rooms r     on r.id = b.room_id
where b.tenant_id = '0cfdd376-f6c9-4d8d-ac39-fa77e24cc64e'
  and c.phone = :'phone';
