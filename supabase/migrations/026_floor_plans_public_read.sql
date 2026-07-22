-- Let the guest portal read the hotel's site plan (denah).
--
-- 025 sealed floor_plans to the owning hotel's staff/admin. But the portal now
-- shows guests the whole-property denah so they can see the layout and pick a
-- spot, and the portal is public (anonymous browsers included). This adds a
-- read-only policy scoped to current_tenant() — the SAME visibility model as
-- room_types, rooms and rack rates (011): a guest sees only the layout of the
-- hotel whose portal they're on.
--
-- Safe to expose: the plan JSON is just shapes, labels and room links — the
-- hotel's own map. It carries NO booking, guest or occupant data (those live in
-- bookings/customers and stay RLS-sealed); availability is computed separately
-- through the tenant-scoped available_rooms() RPC, never from this table.

drop policy if exists "Anyone can view the floor plan" on floor_plans;
create policy "Anyone can view the floor plan" on floor_plans for select
  using (tenant_id = current_tenant());
