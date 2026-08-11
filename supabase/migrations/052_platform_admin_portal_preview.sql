-- A platform admin may open a hotel's public portal from the platform console.
--
-- The normal hotel client deliberately has no x-platform-scope header: an admin
-- working in the hotel dashboard must see their own hotel, not every tenant.
-- That also meant a platform admin opening `/portal?hotel=...` could not see the
-- explicitly selected hotel's public data and the UI fell back to Kopi Rintik.
--
-- This is a narrow exception. The browser must send both the hotel slug and a
-- preview marker, and the database still requires is_platform_admin(). Staff,
-- hotel admins, and guests keep their existing tenant rules.

create or replace function public.current_tenant() returns uuid
language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  t       uuid;
  hdr     text;
  preview boolean := false;
  n       int;
  r       user_role;
begin
  begin
    hdr := nullif(current_setting('request.headers', true)::json ->> 'x-tenant-slug', '');
    preview := coalesce(current_setting('request.headers', true)::json ->> 'x-portal-preview', '') = 'true';
  exception when others then
    hdr := null;
    preview := false;
  end;

  r := get_my_role();

  -- Hotel staff are never moved by a browser header.
  if r = 'staff'::user_role then
    return get_my_tenant();
  end if;

  -- A whitelisted platform admin may preview an explicitly selected hotel.
  -- Without the marker, the ordinary hotel shell remains pinned to their own
  -- tenant, even if localStorage contains a slug from an earlier guest visit.
  if r = 'admin'::user_role then
    if public.is_platform_admin() and preview and hdr is not null then
      select id into t from tenants where slug = hdr and is_active;
      return t;
    end if;
    return get_my_tenant();
  end if;

  -- Guests and anonymous visitors follow the portal URL. An invalid explicit
  -- slug must return NULL, not fall through to the first/profile hotel.
  if hdr is not null then
    select id into t from tenants where slug = hdr and is_active;
    return t;
  end if;

  t := get_my_tenant();
  if t is not null then
    return t;
  end if;

  -- With no header and no session, only one active hotel is unambiguous.
  select count(*) into n from tenants where is_active;
  if n <> 1 then
    return null;
  end if;

  select id into t from tenants where is_active;
  return t;
end;
$function$;
