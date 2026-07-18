-- GoStay HMS — RLS regression test: assertion helpers. Run as the superuser.
-- Separate from attacks.sql because `authenticator` has no CREATE on schema
-- tests — and should not have.

create schema if not exists tests;
grant usage on schema tests to anon, authenticated;

-- A write is only denied if it raises OR touches zero rows. Checking only for
-- an exception scores an RLS-filtered UPDATE (which raises nothing and changes
-- nothing) as "allowed" — the first version of this test got that wrong and
-- reported two false breaches.
create or replace function tests.blocked(label text, stmt text)
returns text language plpgsql as $$
declare n integer;
begin
  execute stmt;
  get diagnostics n = row_count;
  if n = 0 then return 'pass  ' || label || '  (0 rows)'; end if;
  return 'FAIL <-- ' || label || ' CHANGED ' || n || ' ROW(S)';
exception when others then
  return 'pass  ' || label || '  (' || sqlstate || ')';
end $$;

create or replace function tests.allowed(label text, stmt text)
returns text language plpgsql as $$
begin
  execute stmt;
  return 'pass  ' || label;
exception when others then
  return 'FAIL <-- ' || label || ' SHOULD BE ALLOWED: ' || sqlerrm;
end $$;

create or replace function tests.eq(label text, got bigint, want bigint)
returns text language sql as $$
  select case when got = want then 'pass  ' || label || ' = ' || got
              else 'FAIL <-- ' || label || ' = ' || got || ', want ' || want end
$$;

