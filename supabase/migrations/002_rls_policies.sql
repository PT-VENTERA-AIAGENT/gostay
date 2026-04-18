-- BookMe HMS — Row Level Security Policies
-- Apply after 001_initial_schema.sql

-- ─── Enable RLS on all tables ─────────────────────────────────────────────────
alter table profiles           enable row level security;
alter table room_types         enable row level security;
alter table rooms              enable row level security;
alter table seasonal_pricing   enable row level security;
alter table availability_blocks enable row level security;
alter table customers          enable row level security;
alter table bookings           enable row level security;
alter table booking_audit_log  enable row level security;
alter table chat_threads       enable row level security;
alter table chat_messages      enable row level security;
alter table call_logs          enable row level security;
alter table analytics_cache    enable row level security;

-- ─── Helper: current user's role ─────────────────────────────────────────────
create or replace function get_my_role()
returns user_role language sql stable security definer as $$
  select role from profiles where id = auth.uid()
$$;

-- ─── Profiles ────────────────────────────────────────────────────────────────
create policy "Users can view own profile"
  on profiles for select using (id = auth.uid());

create policy "Staff/admin can view all profiles"
  on profiles for select using (get_my_role() in ('admin', 'staff'));

create policy "Users can update own profile"
  on profiles for update using (id = auth.uid());

create policy "Admin can update any profile"
  on profiles for update using (get_my_role() = 'admin');

-- ─── Room Types (public read, admin write) ────────────────────────────────────
create policy "Anyone can view active room types"
  on room_types for select using (is_active = true);

create policy "Admin can manage room types"
  on room_types for all using (get_my_role() = 'admin');

-- ─── Rooms (staff read, admin write) ─────────────────────────────────────────
create policy "Staff/admin can view rooms"
  on rooms for select using (get_my_role() in ('admin', 'staff'));

create policy "Portal can view active rooms"
  on rooms for select using (is_active = true);

create policy "Admin can manage rooms"
  on rooms for all using (get_my_role() = 'admin');

-- ─── Seasonal Pricing ─────────────────────────────────────────────────────────
create policy "Anyone can view seasonal pricing"
  on seasonal_pricing for select using (true);

create policy "Admin can manage seasonal pricing"
  on seasonal_pricing for all using (get_my_role() = 'admin');

-- ─── Availability Blocks ──────────────────────────────────────────────────────
create policy "Staff/admin can view blocks"
  on availability_blocks for select using (get_my_role() in ('admin', 'staff'));

create policy "Admin can manage blocks"
  on availability_blocks for all using (get_my_role() = 'admin');

-- ─── Customers ────────────────────────────────────────────────────────────────
create policy "Staff/admin can view all customers"
  on customers for select using (get_my_role() in ('admin', 'staff'));

create policy "Customer can view own record"
  on customers for select using (profile_id = auth.uid());

create policy "Staff/admin can create customers"
  on customers for insert with check (get_my_role() in ('admin', 'staff'));

create policy "Anyone can create own customer record"
  on customers for insert with check (profile_id = auth.uid());

create policy "Staff/admin can update customers"
  on customers for update using (get_my_role() in ('admin', 'staff'));

create policy "Customer can update own record"
  on customers for update using (profile_id = auth.uid());

-- ─── Bookings ─────────────────────────────────────────────────────────────────
create policy "Staff/admin can view all bookings"
  on bookings for select using (get_my_role() in ('admin', 'staff'));

create policy "Customer can view own bookings"
  on bookings for select using (
    customer_id in (
      select id from customers where profile_id = auth.uid()
    )
  );

create policy "Staff/admin can create bookings"
  on bookings for insert with check (get_my_role() in ('admin', 'staff'));

create policy "Customer can create own bookings"
  on bookings for insert with check (
    customer_id in (
      select id from customers where profile_id = auth.uid()
    )
  );

create policy "Staff/admin can update bookings"
  on bookings for update using (get_my_role() in ('admin', 'staff'));

create policy "Customer can cancel own pending bookings"
  on bookings for update using (
    customer_id in (
      select id from customers where profile_id = auth.uid()
    )
    and status in ('pending', 'confirmed')
  );

-- ─── Booking Audit Log ────────────────────────────────────────────────────────
create policy "Staff/admin can view audit logs"
  on booking_audit_log for select using (get_my_role() in ('admin', 'staff'));

create policy "System can insert audit logs"
  on booking_audit_log for insert with check (true);

-- ─── Chat Threads ─────────────────────────────────────────────────────────────
create policy "Staff/admin can view all threads"
  on chat_threads for select using (get_my_role() in ('admin', 'staff'));

create policy "Customer can view own threads"
  on chat_threads for select using (
    customer_id in (
      select id from customers where profile_id = auth.uid()
    )
  );

create policy "Staff/admin can manage threads"
  on chat_threads for all using (get_my_role() in ('admin', 'staff'));

create policy "Customer can create threads"
  on chat_threads for insert with check (
    customer_id in (
      select id from customers where profile_id = auth.uid()
    )
  );

-- ─── Chat Messages ────────────────────────────────────────────────────────────
create policy "Staff/admin can view all messages"
  on chat_messages for select using (get_my_role() in ('admin', 'staff'));

create policy "Users can view messages in own threads"
  on chat_messages for select using (
    thread_id in (
      select t.id from chat_threads t
      join customers c on c.id = t.customer_id
      where c.profile_id = auth.uid()
    )
  );

create policy "Authenticated users can send messages"
  on chat_messages for insert with check (sender_id = auth.uid());

create policy "Staff/admin can mark messages read"
  on chat_messages for update using (get_my_role() in ('admin', 'staff'));

-- ─── Call Logs ────────────────────────────────────────────────────────────────
create policy "Staff/admin can view call logs"
  on call_logs for select using (get_my_role() in ('admin', 'staff'));

create policy "Staff/admin can manage call logs"
  on call_logs for all using (get_my_role() in ('admin', 'staff'));

-- ─── Analytics Cache ──────────────────────────────────────────────────────────
create policy "Admin can view analytics"
  on analytics_cache for select using (get_my_role() = 'admin');

create policy "Staff can view analytics"
  on analytics_cache for select using (get_my_role() = 'staff');

create policy "System can write analytics"
  on analytics_cache for all using (true);
