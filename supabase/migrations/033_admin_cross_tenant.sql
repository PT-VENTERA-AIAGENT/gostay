-- Let the Ventera super admin (role='admin') operate across ALL hotels, for the
-- platform console. Most tenant-owned tables already have an admin-override
-- policy (018_admin_platform_wide), but `tenants` itself was missed — a bare
-- select there returned only the admin's own hotel, so the platform console
-- could not list every hotel. Add it, plus admin read on the WA session links.

-- Admin can see (and manage) every hotel row.
drop policy if exists tenants_admin_all on tenants;
create policy tenants_admin_all on tenants
  for all to authenticated
  using (get_my_role() = 'admin'::user_role)
  with check (get_my_role() = 'admin'::user_role);

-- Admin can read which WhatsApp session is linked to each hotel (linked-WA
-- monitor). The table may currently be service-role-only; add an admin/own-tenant
-- SELECT without loosening anything else.
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'wa_hotel_sessions') then
    execute 'alter table public.wa_hotel_sessions enable row level security';
    execute 'drop policy if exists wa_hotel_sessions_read on public.wa_hotel_sessions';
    execute 'create policy wa_hotel_sessions_read on public.wa_hotel_sessions '
         || 'for select to authenticated using ('
         || 'get_my_role() = ''admin''::user_role '
         || 'or (get_my_role() = ''staff''::user_role and tenant_id = get_my_tenant()))';
  end if;
end $$;
