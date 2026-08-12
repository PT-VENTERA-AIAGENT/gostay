-- Buku pembayaran langganan ke Ventera, dan gerbang tunggakan.
--
-- Sampai sekarang "lunas" hanyalah satu kolom status di hotel_subscription_
-- invoices. Itu cukup selama uangnya masuk pas dan sekali — dan tidak cukup
-- untuk semua yang lain: kurang bayar, bayar dua kali, bayar sebagian lewat
-- transfer lalu sisanya online, atau status yang dibalik operator. Semua itu
-- kehilangan angkanya; yang tersisa cuma kalimat di kolom catatan.
--
-- Karena itu pembayaran dipindah ke tabelnya sendiri, append-only, dan status
-- tagihan DITURUNKAN dari jumlahnya — pola yang sama dengan balance_ledger di
-- 031: uang dicatat sebagai kejadian, saldo/status hanyalah ringkasannya.
--
-- Bagian kedua: gerbang. Hotel yang menunggak lebih dari seminggu setelah
-- jatuh tempo kehilangan akses ke aplikasi stafnya sampai membayar. Tanggal
-- tagihnya TIDAK bergeser karena telat — periode berikutnya tetap jatuh pada
-- tanggal yang sama, jadi membayar telat tidak "membeli" tenggat baru.

-- ─── Buku pembayaran ──────────────────────────────────────────────────────────
create table if not exists subscription_payments (
  id           bigserial primary key,
  tenant_id    uuid   not null references tenants(id) on delete cascade,
  invoice_id   bigint not null references hotel_subscription_invoices(id) on delete cascade,
  amount       numeric(14,2) not null check (amount > 0),
  method       text   not null default 'transfer'
                 check (method in ('xendit','transfer','cash','adjustment')),
  -- id invoice di Xendit untuk pembayaran online. UNIQUE = kunci idempotensi:
  -- callback yang diulang tidak bisa mencatat uang yang sama dua kali.
  gateway_ref  text,
  gateway_env  text check (gateway_env in ('live','test')),
  paid_at      timestamptz not null default now(),
  recorded_by  text,
  note         text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_subscription_payments_invoice
  on subscription_payments(invoice_id, paid_at);
create index if not exists idx_subscription_payments_tenant
  on subscription_payments(tenant_id, paid_at desc);
create unique index if not exists uq_subscription_payments_gateway_ref
  on subscription_payments(gateway_ref) where gateway_ref is not null;

-- Ringkasan yang diturunkan dari buku di atas.
alter table hotel_subscription_invoices
  add column if not exists paid_total numeric(14,2) not null default 0;

-- ─── Status tagihan = ringkasan pembayarannya ─────────────────────────────────
-- 'waived' tidak pernah diganggu: itu keputusan operator, bukan hasil hitungan.
-- Toleransi setengah rupiah supaya pembulatan tidak membuat tagihan yang sudah
-- dibayar penuh tetap tampak kurang.
create or replace function recompute_subscription_invoice(p_invoice bigint) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  inv    record;
  total  numeric(14,2);
  first_paid timestamptz;
  last_method text;
begin
  select * into inv from hotel_subscription_invoices where id = p_invoice;
  if not found then return; end if;

  select coalesce(sum(amount), 0), min(paid_at), (array_agg(method order by paid_at desc, id desc))[1]
    into total, first_paid, last_method
    from subscription_payments where invoice_id = p_invoice;

  update hotel_subscription_invoices
     set paid_total  = total,
         status      = case when inv.status = 'waived' then 'waived'
                            when total + 0.5 >= inv.amount then 'paid'
                            else 'unpaid' end,
         -- Waktu lunas = pembayaran PERTAMA yang menutupinya, bukan waktu
         -- baris ini disentuh. Trigger stamp_… (055) menghormatinya lewat
         -- coalesce, dan mengosongkannya sendiri kalau statusnya turun lagi.
         paid_at     = first_paid,
         paid_method = last_method,
         updated_at  = now()
   where id = p_invoice;
end $$;

create or replace function on_subscription_payment_change() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform recompute_subscription_invoice(coalesce(new.invoice_id, old.invoice_id));
  -- Pembayaran yang dipindah antar tagihan (jarang, tapi mungkin lewat koreksi
  -- manual) harus memperbarui KEDUA sisinya.
  if tg_op = 'UPDATE' and new.invoice_id is distinct from old.invoice_id then
    perform recompute_subscription_invoice(old.invoice_id);
  end if;
  return null;
end $$;

drop trigger if exists trg_subscription_payment_change on subscription_payments;
create trigger trg_subscription_payment_change
  after insert or update or delete on subscription_payments
  for each row execute function on_subscription_payment_change();

-- ─── Isi buku dari tagihan yang sudah terlanjur lunas ─────────────────────────
-- Tanpa ini setiap tagihan lunas yang lahir sebelum migration ini akan dihitung
-- ulang jadi 'unpaid' begitu ada pembayaran lain menyentuhnya — dan hotel yang
-- sudah membayar bisa ikut kena gerbang.
insert into subscription_payments (tenant_id, invoice_id, amount, method, gateway_ref, gateway_env, paid_at, recorded_by, note)
select i.tenant_id, i.id, i.amount,
       case when i.paid_method in ('xendit','transfer','cash','adjustment') then i.paid_method else 'transfer' end,
       i.gateway_ref, i.gateway_env, coalesce(i.paid_at, i.updated_at, now()),
       coalesce(i.updated_by, 'migration_058'), 'Disalin dari status lunas sebelum buku pembayaran ada'
  from hotel_subscription_invoices i
 where i.status = 'paid'
   and not exists (select 1 from subscription_payments p where p.invoice_id = i.id);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
-- Hotel boleh MELIHAT pembayarannya sendiri; hanya platform yang boleh menulis.
-- Jalur online menulis lewat service key, yang menembus RLS.
alter table subscription_payments enable row level security;

drop policy if exists subscription_payments_read on subscription_payments;
create policy subscription_payments_read on subscription_payments
  for select to authenticated
  using (public.platform_admin_scope()
         or (public.is_hotel_member() and tenant_id = public.get_my_tenant()));

drop policy if exists subscription_payments_write on subscription_payments;
create policy subscription_payments_write on subscription_payments
  for all to authenticated
  using (public.platform_admin_scope())
  with check (public.platform_admin_scope());

-- ─── Penerbitan tagihan yang tidak bergantung pada ingatan orang ──────────────
-- Gerbang hanya seadil daftar tagihannya. Kalau tagihan terbit hanya saat
-- operator ingat menekan tombol, hotel yang terlewat tidak pernah tertagih dan
-- tidak pernah tergerbang — dan yang tidak terlewat merasa dipilih-pilih.
--
-- Fungsi ini menambal SEMUA periode yang hilang, dari bulan hotel itu mulai
-- berlangganan sampai bulan berjalan. Idempoten: yang sudah ada dilewati apa
-- adanya, termasuk yang sudah lunas.
create or replace function ensure_subscription_invoices(p_tenant uuid default null)
returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  dibuat int;
begin
  if not public.is_platform_admin() then
    raise exception 'hanya operator platform yang boleh menerbitkan tagihan'
      using errcode = 'insufficient_privilege';
  end if;

  with target as (
    select c.tenant_id, c.subscription_amount,
           date_trunc('month', coalesce(c.subscription_since, current_date))::date as mulai
      from hotel_payment_config c
     where c.billing_mode = 'subscription'
       and c.subscription_amount > 0
       and (p_tenant is null or c.tenant_id = p_tenant)
  ),
  wajib as (
    select t.tenant_id, t.subscription_amount,
           generate_series(t.mulai, date_trunc('month', current_date)::date, interval '1 month')::date as period
      from target t
  ),
  baru as (
    insert into hotel_subscription_invoices (tenant_id, period, amount, updated_by)
    select w.tenant_id, w.period, w.subscription_amount, 'ensure_subscription_invoices'
      from wajib w
     where not exists (
       select 1 from hotel_subscription_invoices i
        where i.tenant_id = w.tenant_id and i.period = w.period)
    returning 1
  )
  select count(*)::int into dibuat from baru;

  return dibuat;
end $$;
revoke all on function ensure_subscription_invoices(uuid) from public;
grant execute on function ensure_subscription_invoices(uuid) to authenticated, service_role;

-- ─── Gerbang tunggakan ────────────────────────────────────────────────────────
-- Masa tenggang SETELAH jatuh tempo. Jatuh tempo tanggal 1 → tergerbang tanggal 8.
create or replace function subscription_grace_days() returns int
language sql immutable as $$ select 7 $$;

/*
 * Keadaan tagihan tertua yang belum dibayar sebuah hotel.
 *
 * Tidak bergantung pada baris tagihan yang sudah terbit: periodenya DIHITUNG
 * dari subscription_since sampai bulan berjalan, lalu baru dicocokkan dengan
 * tagihan yang ada. Kalau tidak begitu, hotel yang tagihannya lupa diterbitkan
 * justru bebas dari gerbang — persis kebalikan dari yang seharusnya.
 *
 * Jatuh tempo bulan pertama tidak pernah mundur ke belakang tanggal hotel itu
 * mulai berlangganan; tanpa itu, hotel yang bergabung tanggal 20 dengan tenggat
 * tanggal 1 akan langsung menunggak di hari pertamanya.
 *
 * Nol baris = tidak ada yang terutang.
 */
create or replace function subscription_gate(p_tenant uuid)
returns table (
  gated boolean,
  period date,
  due_date date,
  days_late int,
  amount_due numeric
)
language sql stable security definer set search_path = public, pg_temp as $$
  with cfg as (
    select subscription_amount, subscription_day,
           coalesce(subscription_since, current_date) as since
      from hotel_payment_config
     where tenant_id = p_tenant
       and billing_mode = 'subscription'
       and subscription_amount > 0
  ),
  periods as (
    select gs::date as period
      from cfg,
           generate_series(date_trunc('month', cfg.since),
                           date_trunc('month', current_date),
                           interval '1 month') gs
  ),
  owed as (
    select p.period,
           greatest((p.period + ((select subscription_day from cfg) - 1) * interval '1 day')::date,
                    (select since from cfg)) as due_date,
           coalesce(i.amount, (select subscription_amount from cfg)) as amount,
           coalesce(i.status, 'unpaid') as status
      from periods p
      left join hotel_subscription_invoices i
        on i.tenant_id = p_tenant and i.period = p.period
  )
  select (current_date >= o.due_date + subscription_grace_days()) as gated,
         o.period,
         o.due_date,
         greatest((current_date - o.due_date)::int, 0) as days_late,
         o.amount
    from owed o
   where o.status = 'unpaid' and o.amount > 0
   order by o.period
   limit 1;
$$;
revoke all on function subscription_gate(uuid) from public;
grant execute on function subscription_gate(uuid) to authenticated, service_role;

/** Gerbang untuk hotel si pemanggil sendiri — yang dipakai aplikasi staf. */
create or replace function my_subscription_gate()
returns table (gated boolean, period date, due_date date, days_late int, amount_due numeric)
language sql stable security definer set search_path = public, pg_temp as $$
  select * from subscription_gate(public.get_my_tenant());
$$;
revoke all on function my_subscription_gate() from public;
grant execute on function my_subscription_gate() to authenticated, service_role;
