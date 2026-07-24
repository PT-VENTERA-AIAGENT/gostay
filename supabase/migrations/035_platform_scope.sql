-- ─── Dua dunia: hotel dan platform ────────────────────────────────────────────
--
-- 018 membuat `role = 'admin'` berarti "operator platform, boleh lihat SEMUA
-- hotel", lalu menempelkan satu policy admin-override ke tiap tabel. Dua akibat
-- yang keduanya terbukti di project ini:
--
--   1. Halaman STAF ikut kebanjiran. Halaman hotel (Pesan, Reservasi, Kamar, …)
--      query tanpa filter tenant dan menyerahkan pembatasan ke RLS — benar untuk
--      staf, tapi untuk seorang admin RLS tidak membatasi apa pun, jadi inbox
--      "hotel saya" berisi percakapan SELURUH hotel. Itulah yang terlihat waktu
--      dua akun dites dan isinya sama persis (148 pesan, 3 hotel). Konsol lintas
--      hotel harusnya di /platform, bukan menyusup ke dashboard hotel.
--
--   2. Kewenangan itu menempel pada sebuah kolom yang bisa diubah dari UI. Satu
--      klik salah di User Management → akun itu membaca setiap hotel.
--
-- Perbaikannya memisah dua hal yang selama ini satu:
--
--   SIAPA  — `platform_admins`, daftar putih yang hanya bisa diisi service role.
--            Bukan lagi `profiles.role`, yang dikelola dari dalam aplikasi.
--   KAPAN  — header `x-platform-scope: all`, dikirim HANYA oleh klien konsol
--            platform (src/lib/supabase.ts → platformDb). Tanpa header, seorang
--            operator platform membaca persis seperti staf: tenant-nya sendiri.
--
-- Header itu bukan batas keamanan — operator platform toh berhak melihat semua —
-- melainkan pemisah dunia: satu klien untuk aplikasi hotel, satu untuk konsol,
-- sehingga tidak ada halaman staf yang bisa kecolongan data hotel lain.

-- ─── 1. Daftar putih operator platform ────────────────────────────────────────
create table if not exists platform_admins (
  profile_id uuid primary key references profiles(id) on delete cascade,
  note       text,
  created_at timestamptz not null default now()
);

-- Pola yang sama dengan tabel wa_* (016): RLS aktif TANPA policy sama sekali —
-- Supabase memberi grant ke anon/authenticated secara default, dan tabel ber-RLS
-- tanpa policy menolak semuanya, sementara service role melewati RLS. Jadi
-- keanggotaan hanya bisa diubah oleh operator lewat service role, tidak dari UI.
alter table platform_admins enable row level security;
comment on table platform_admins is
  'Operator platform Ventera (lintas hotel). Service-role only: RLS aktif tanpa policy.';

-- ─── 2. Predikat ──────────────────────────────────────────────────────────────

-- SECURITY DEFINER: policy yang memakai ini harus bisa membaca platform_admins,
-- yang justru disegel dari pemanggil. search_path dipatok supaya tabelnya tidak
-- bisa dibayangi tabel temp milik pemanggil (alasan yang sama dengan get_my_role).
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from platform_admins pa
    join profiles p on p.id = pa.profile_id
    where pa.profile_id = auth.uid() and p.is_active
  );
$$;

-- Apakah permintaan ini datang dari konsol platform? Header di-set klien, jadi
-- ia hanya boleh MEMPERSEMPIT, tidak pernah memberi hak baru: selalu di-AND
-- dengan is_platform_admin(). Blok exception mengikuti current_tenant() (013):
-- request.headers tidak selalu ada (mis. koneksi psql), dan itu harus berarti
-- "tanpa scope", bukan error yang menjatuhkan seluruh query.
create or replace function public.platform_scope_all()
returns boolean
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare hdr text;
begin
  begin
    hdr := nullif(current_setting('request.headers', true)::json ->> 'x-platform-scope', '');
  exception when others then
    hdr := null;
  end;
  return hdr = 'all';
end;
$$;

/** Keduanya sekaligus — inilah yang menggantikan `get_my_role() = 'admin'`. */
create or replace function public.platform_admin_scope()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select public.is_platform_admin() and public.platform_scope_all();
$$;

-- Dipakai UI untuk memutuskan apakah menu konsol platform ditampilkan. Sengaja
-- terpisah dari platform_admin_scope(): pertanyaannya "apakah saya operator?",
-- bukan "apakah request ini sedang ber-scope platform?".
revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated, service_role;
revoke all on function public.platform_scope_all() from public;
grant execute on function public.platform_scope_all() to anon, authenticated, service_role;
revoke all on function public.platform_admin_scope() from public;
grant execute on function public.platform_admin_scope() to anon, authenticated, service_role;

-- ─── 3. Isi daftar putih dari admin yang ada ──────────────────────────────────
-- Semua akun yang HARI INI ber-role 'admin' dipindahkan apa adanya, supaya tidak
-- ada operator Ventera yang kehilangan akses saat migrasi jalan. Mencabut satu
-- akun sekarang cukup satu baris dan tidak lagi menyentuh role-nya:
--   delete from platform_admins where profile_id = (select id from profiles where email = '…');
insert into platform_admins (profile_id, note)
select id, 'dipindahkan dari role=admin oleh 035'
from profiles where role = 'admin'
on conflict (profile_id) do nothing;

-- ─── 4. Ganti setiap policy yang memberi admin jangkauan lintas hotel ─────────
-- 4a. Policy admin-override buatan 018 + 033 (satu per tabel, `*_admin_all`).
do $$
declare
  t text;
  tables text[] := array[
    'analytics_cache','availability_blocks','booking_audit_log','bookings',
    'call_logs','chat_messages','chat_threads','customers','profiles',
    'reviews','room_types','rooms','seasonal_pricing','tenants'
  ];
begin
  foreach t in array tables loop
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format('drop policy if exists %I on public.%I', t || '_platform_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated '
      || 'using (public.platform_admin_scope()) '
      || 'with check (public.platform_admin_scope())',
      t || '_platform_all', t
    );
  end loop;
end $$;

-- 4b. Policy bergaya "(admin) OR (staf tenant sendiri)" dari 019/020/030/031.
-- Cabang stafnya tidak berubah; hanya cabang adminnya yang kini butuh scope.
drop policy if exists guest_requests_access on guest_requests;
create policy guest_requests_access on guest_requests for all to authenticated
  using (public.platform_admin_scope() or (public.get_my_role() = 'staff'::user_role and tenant_id = public.get_my_tenant()))
  with check (public.platform_admin_scope() or (public.get_my_role() = 'staff'::user_role and tenant_id = public.get_my_tenant()));

drop policy if exists pos_products_access on pos_products;
create policy pos_products_access on pos_products for all to authenticated
  using (public.platform_admin_scope() or (public.get_my_role() = 'staff'::user_role and tenant_id = public.get_my_tenant()))
  with check (public.platform_admin_scope() or (public.get_my_role() = 'staff'::user_role and tenant_id = public.get_my_tenant()));

drop policy if exists pos_orders_access on pos_orders;
create policy pos_orders_access on pos_orders for all to authenticated
  using (public.platform_admin_scope() or (public.get_my_role() = 'staff'::user_role and tenant_id = public.get_my_tenant()))
  with check (public.platform_admin_scope() or (public.get_my_role() = 'staff'::user_role and tenant_id = public.get_my_tenant()));

drop policy if exists pos_charges_access on pos_charges;
create policy pos_charges_access on pos_charges for all to authenticated
  using (public.platform_admin_scope() or (public.get_my_role() = 'staff'::user_role and tenant_id = public.get_my_tenant()))
  with check (public.platform_admin_scope() or (public.get_my_role() = 'staff'::user_role and tenant_id = public.get_my_tenant()));

drop policy if exists payments_access on payments;
create policy payments_access on payments for all to authenticated
  using (public.platform_admin_scope() or (public.get_my_role() = 'staff'::user_role and tenant_id = public.get_my_tenant()))
  with check (public.platform_admin_scope() or (public.get_my_role() = 'staff'::user_role and tenant_id = public.get_my_tenant()));

drop policy if exists hotel_balance_read on hotel_balance;
create policy hotel_balance_read on hotel_balance for select to authenticated
  using (public.platform_admin_scope() or (public.get_my_role() = 'staff'::user_role and tenant_id = public.get_my_tenant()));

drop policy if exists balance_ledger_read on balance_ledger;
create policy balance_ledger_read on balance_ledger for select to authenticated
  using (public.platform_admin_scope() or (public.get_my_role() = 'staff'::user_role and tenant_id = public.get_my_tenant()));

drop policy if exists payouts_read on payouts;
create policy payouts_read on payouts for select to authenticated
  using (public.platform_admin_scope() or (public.get_my_role() = 'staff'::user_role and tenant_id = public.get_my_tenant()));

drop policy if exists payouts_request on payouts;
create policy payouts_request on payouts for insert to authenticated
  with check (public.platform_admin_scope() or (public.get_my_role() = 'staff'::user_role and tenant_id = public.get_my_tenant()));

drop policy if exists payouts_process on payouts;
create policy payouts_process on payouts for update to authenticated
  using (public.platform_admin_scope()) with check (public.platform_admin_scope());

drop policy if exists hotel_payment_config_read on hotel_payment_config;
create policy hotel_payment_config_read on hotel_payment_config for select to authenticated
  using (public.platform_admin_scope() or (public.get_my_role() = 'staff'::user_role and tenant_id = public.get_my_tenant()));

drop policy if exists hotel_payment_config_admin_write on hotel_payment_config;
create policy hotel_payment_config_admin_write on hotel_payment_config for all to authenticated
  using (public.platform_admin_scope()) with check (public.platform_admin_scope());

drop policy if exists payment_mode_audit_read on payment_mode_audit;
create policy payment_mode_audit_read on payment_mode_audit for select to authenticated
  using (public.platform_admin_scope());

-- 4c. Peta sesi WhatsApp (033).
drop policy if exists wa_hotel_sessions_read on wa_hotel_sessions;
create policy wa_hotel_sessions_read on wa_hotel_sessions for select to authenticated
  using (public.platform_admin_scope() or (public.get_my_role() = 'staff'::user_role and tenant_id = public.get_my_tenant()));

-- 4d. Tabel milik platform sendiri (029: lead gen & kampanye outbound). Tidak
-- punya tenant, jadi tidak ada yang bocor antar hotel — tapi kewenangannya tetap
-- dipindah ke daftar putih, supaya "siapa operator platform" hanya punya SATU
-- jawaban. Tanpa platform_scope_all(): halaman /admin/leads memakai klien biasa.
do $$
declare
  t text;
  tables text[] := array[
    'outbound_leads','outbound_conversations','outbound_message_drafts','outbound_campaigns'
  ];
begin
  foreach t in array tables loop
    if exists (select 1 from information_schema.tables
               where table_schema = 'public' and table_name = t) then
      execute format('drop policy if exists %I on public.%I', 'admin_all_' || t, t);
      execute format('drop policy if exists %I on public.%I', 'platform_all_' || t, t);
      execute format(
        'create policy %I on public.%I for all to authenticated '
        || 'using (public.is_platform_admin()) with check (public.is_platform_admin())',
        'platform_all_' || t, t
      );
    end if;
  end loop;
end $$;

-- ─── 5. Sisa jangkauan admin di halaman hotel ────────────────────────────────
-- 011/027 memberi 'admin' hak yang SAMA dengan staf tapi tetap dipagari
-- `tenant_id = public.get_my_tenant()`, jadi tidak lintas hotel dan dibiarkan: seorang
-- operator yang membuka dashboard hotel bekerja di dalam tenant-nya sendiri,
-- persis yang diminta ("di halaman staf harusnya seperti hotel biasa").
