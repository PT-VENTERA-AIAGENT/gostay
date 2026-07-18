-- Makes the `admin` role platform-wide (Ventera), able to see and manage EVERY
-- hotel, while `staff`/`customer` stay tenant-scoped exactly as before.
--
-- Model (per product owner): there is ONE admin — Ventera — and it operates
-- across all tenants (to run the platform and onboard hotels). There is no
-- per-hotel admin. Hotels are run by staff (tenant-scoped); guests are customers
-- (own rows). Staff-level policies are left untouched here and simply deferred.
--
-- Implementation: PERMISSIVE RLS policies are OR-ed, so rather than rewriting the
-- ~50 existing tenant-scoped policies (error-prone), we ADD one admin-override
-- policy per tenant table. `get_my_role() = 'admin'` grants an admin full access
-- to every row regardless of tenant; every other role still only matches its own
-- tenant through the pre-existing policies. Nothing here widens staff or customer
-- access.
--
-- get_my_role() already excludes inactive users, so a deactivated admin gets no
-- override. The wa_* internal tables are intentionally excluded — they remain
-- service-role only.

do $$
declare
  t text;
  tables text[] := array[
    'analytics_cache','availability_blocks','booking_audit_log','bookings',
    'call_logs','chat_messages','chat_threads','customers','profiles',
    'reviews','room_types','rooms','seasonal_pricing'
  ];
begin
  foreach t in array tables loop
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated '
      || 'using (get_my_role() = ''admin''::user_role) '
      || 'with check (get_my_role() = ''admin''::user_role)',
      t || '_admin_all', t
    );
  end loop;
end $$;
