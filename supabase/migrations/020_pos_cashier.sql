-- Standalone POS / cashier: a product catalogue and walk-in sales that are NOT
-- tied to a booking. Two settlement paths exist in the app:
--   • walk-in (paid on the spot) → recorded here as a pos_orders row + items
--   • post to a room folio       → reuses pos_charges (migration 019), so those
--                                   sales flow through the booking balance and
--                                   are NOT duplicated here.
-- Same tenancy model as the rest of the app (see 019): tenant_id on every row,
-- staff see their own hotel, admin (Ventera) is platform-wide, service-role
-- bypasses. Line items live in a jsonb column to keep this to two tables.

-- ─── Product catalogue ────────────────────────────────────────────────────────
create table if not exists pos_products (
  id         uuid primary key default uuid_generate_v4(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  name       text not null,
  category   text not null default 'fnb',   -- fnb | minibar | laundry | spa | other
  price      numeric(12,2) not null check (price >= 0),
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_pos_products_tenant on pos_products(tenant_id, is_active);

-- ─── Walk-in sales (settled at the till, no booking) ──────────────────────────
create table if not exists pos_orders (
  id             uuid primary key default uuid_generate_v4(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  guest_name     text,                                    -- optional walk-in label
  items          jsonb not null default '[]'::jsonb,      -- [{description,category,unit_price,quantity}]
  subtotal       numeric(12,2) not null default 0 check (subtotal >= 0),
  payment_method payment_method not null default 'cash',
  status         text not null default 'paid',            -- paid | void
  created_by     uuid references profiles(id),
  created_at     timestamptz not null default now()
);
create index if not exists idx_pos_orders_tenant on pos_orders(tenant_id, created_at desc);

-- ─── RLS: staff manage their own hotel, admin (Ventera) platform-wide ──────────
do $$
declare t text;
begin
  foreach t in array array['pos_products','pos_orders'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_access', t);
    execute format(
      'create policy %I on %I for all to authenticated '
      || 'using (get_my_role() = ''admin''::user_role '
      || 'or (get_my_role() = ''staff''::user_role and tenant_id = get_my_tenant())) '
      || 'with check (get_my_role() = ''admin''::user_role '
      || 'or (get_my_role() = ''staff''::user_role and tenant_id = get_my_tenant()))',
      t || '_access', t);
  end loop;
end $$;

-- Auto-stamp tenant_id from the caller's profile on client (authenticated) inserts.
do $$
declare t text;
begin
  foreach t in array array['pos_products','pos_orders'] loop
    execute format('drop trigger if exists trg_set_tenant_id on %I', t);
    execute format('create trigger trg_set_tenant_id before insert on %I for each row execute function set_tenant_id()', t);
  end loop;
end $$;

-- ─── Seed a few starter products for the GoStay demo hotel ─────────────────────
-- Idempotent: only inserts when the tenant has no products yet.
do $$
declare tid uuid := '00000000-0000-4000-8000-000000000001';
begin
  if exists (select 1 from tenants where id = tid)
     and not exists (select 1 from pos_products where tenant_id = tid) then
    insert into pos_products (tenant_id, name, category, price) values
      (tid, 'Kopi',            'fnb',     25000),
      (tid, 'Teh Botol',       'fnb',     15000),
      (tid, 'Nasi Goreng',     'fnb',     45000),
      (tid, 'Air Mineral',     'minibar', 10000),
      (tid, 'Bir Kaleng',      'minibar', 40000),
      (tid, 'Snack Ringan',    'minibar', 20000),
      (tid, 'Cuci Setrika /kg','laundry', 30000),
      (tid, 'Pijat 60 menit',  'spa',    200000);
  end if;
end $$;
