-- Per-hotel payment mode (live/test), controlled by the Ventera super admin.
--
-- Supersedes the single global toggle in payment_config: each hotel now has its
-- own live/test switch and an on/off (is_active) flag, so Ventera can bring
-- hotels onto live payments one at a time — the same idea as Storo's per-project
-- routing table, one level deeper (per hotel instead of per project).
--
-- The platform fee (payment_config.platform_fee_bps) stays global; only the
-- environment is per-hotel. payment_config.mode is kept as a fallback default
-- for hotels that don't yet have a row here.

create table if not exists hotel_payment_config (
  tenant_id   uuid primary key references tenants(id) on delete cascade,
  mode        text not null default 'test' check (mode in ('live','test')),
  is_active   boolean not null default true,   -- false = online payment disabled for this hotel
  updated_by  text,
  updated_at  timestamptz not null default now()
);

-- Audit every mode change (who flipped which hotel to live/test, and when).
create table if not exists hotel_payment_mode_audit (
  id         bigserial primary key,
  tenant_id  uuid not null,
  old_mode   text,
  new_mode   text,
  changed_by text,
  changed_at timestamptz not null default now()
);

-- Fires on INSERT and UPDATE: a hotel's first flip to live often arrives as an
-- upsert-INSERT (no prior row), and that must be audited too — money trail.
create or replace function log_hotel_payment_mode() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if (tg_op = 'INSERT' and new.mode is not null)
     or (tg_op = 'UPDATE' and new.mode is distinct from old.mode) then
    insert into hotel_payment_mode_audit(tenant_id, old_mode, new_mode, changed_by)
    values (new.tenant_id,
            case when tg_op = 'UPDATE' then old.mode else null end,
            new.mode, new.updated_by);
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_hotel_payment_mode on hotel_payment_config;
create trigger trg_hotel_payment_mode
  before insert or update on hotel_payment_config
  for each row execute function log_hotel_payment_mode();

-- ─── RLS ──────────────────────────────────────────────────────────────────────
-- A hotel's staff may READ their own row (the Saldo page shows the mode); ONLY
-- the platform admin (Ventera super admin) may create/update it — a hotel can
-- never flip itself to live. Admin is platform-wide, so it can write any row.
alter table hotel_payment_config enable row level security;

drop policy if exists hotel_payment_config_read on hotel_payment_config;
create policy hotel_payment_config_read on hotel_payment_config
  for select to authenticated
  using (get_my_role() = 'admin'::user_role
         or (get_my_role() = 'staff'::user_role and tenant_id = get_my_tenant()));

drop policy if exists hotel_payment_config_admin_write on hotel_payment_config;
create policy hotel_payment_config_admin_write on hotel_payment_config
  for all to authenticated
  using (get_my_role() = 'admin'::user_role)
  with check (get_my_role() = 'admin'::user_role);

-- ─── Resolver: the effective mode for a hotel ─────────────────────────────────
-- Per-hotel row wins; falls back to the global payment_config.mode, then 'test'.
-- Returns 'test' when the hotel's online payments are switched off, so a disabled
-- hotel can never accidentally transact live.
create or replace function hotel_payment_mode(p_tenant uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when hpc.is_active is false then 'test'
    else coalesce(hpc.mode, (select mode from payment_config where id = true), 'test')
  end
  from (select 1) _
  left join hotel_payment_config hpc on hpc.tenant_id = p_tenant;
$$;

revoke all on function hotel_payment_mode(uuid) from public;
grant execute on function hotel_payment_mode(uuid) to anon, authenticated, service_role;
