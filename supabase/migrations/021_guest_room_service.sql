-- Guest-facing room service: let an in-house guest order from the hotel's POS
-- menu straight from the portal. The order lands as a guest_request (the staff
-- "Permintaan Tamu" queue), which staff confirm and post to the room folio via
-- the existing POS "ke folio" flow — no money moves from the browser.
--
-- Everything here is additive and tightly scoped. RLS policies are OR-ed, so
-- these new customer policies sit alongside the staff/admin ones from 019/020
-- without loosening them.

-- ─── 1. Guests can browse their own hotel's active menu ───────────────────────
-- pos_products was staff/admin-only (020). A menu is not secret; expose only the
-- active items, and only for the caller's own tenant (get_my_tenant() reads it
-- from their profile, so it cannot be pointed at another hotel).
drop policy if exists pos_products_guest_read on pos_products;
create policy pos_products_guest_read on pos_products for select to authenticated
  using (is_active and tenant_id = get_my_tenant());

-- ─── 2. Guests place a request against their OWN in-house booking only ─────────
-- INSERT is the only write a guest gets. The WITH CHECK pins customer_id and
-- booking_id to rows owned by auth.uid(), and requires the booking to be
-- checked_in — room service is for guests actually staying. tenant_id is
-- auto-stamped by the trg_set_tenant_id trigger already on this table (019).
drop policy if exists guest_requests_customer_insert on guest_requests;
create policy guest_requests_customer_insert on guest_requests for insert to authenticated
  with check (
    customer_id in (select id from customers where profile_id = auth.uid())
    and booking_id in (
      select b.id
      from bookings b
      join customers c on c.id = b.customer_id
      where c.profile_id = auth.uid()
        and b.status = 'checked_in'
    )
  );

-- Guests can read back their own requests (to see status), but never update or
-- delete them — status is a staff action, so no UPDATE/DELETE policy is added.
drop policy if exists guest_requests_customer_select on guest_requests;
create policy guest_requests_customer_select on guest_requests for select to authenticated
  using (customer_id in (select id from customers where profile_id = auth.uid()));
