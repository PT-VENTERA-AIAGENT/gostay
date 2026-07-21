-- ─── Multi-tenancy, stage 6: onboarding a hotel is an operator action ─────────
--
-- 013 deliberately left tenants with no INSERT policy, so creating a hotel
-- already required the service role. That is correct but unergonomic: it means
-- raw INSERTs into a security-critical table, and every field a chance to fumble
-- the slug or forget is_active. This wraps it in one call that still cannot run
-- outside the service role — grant is restricted, and is_privileged_context()
-- (005) re-checks inside the body so a mistaken grant later cannot open it.

create or replace function create_tenant(p_name text, p_slug text)
returns tenants
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  t tenants;
begin
  if not is_privileged_context() then
    raise exception 'only the service role may create tenants' using errcode = '42501';
  end if;

  -- Normalise first, then validate the normalised form, so "Grand-Hotel" is
  -- accepted as "grand-hotel" rather than rejected for its capitals.
  p_slug := lower(coalesce(p_slug, ''));
  if p_slug !~ '^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$' then
    raise exception 'slug must be alphanumeric with dashes, e.g. "grand-hotel"'
      using errcode = '22023';
  end if;

  insert into tenants (name, slug) values (p_name, p_slug)
  returning * into t;
  return t;
end;
$$;

revoke all on function create_tenant(text, text) from public;
grant execute on function create_tenant(text, text) to service_role;
