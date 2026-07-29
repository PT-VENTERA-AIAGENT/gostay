-- Kembalikan akses operator platform ke HOTELNYA SENDIRI.
--
-- Regresi dari 035. Maksud 035 sudah benar: kewenangan lintas-hotel harus lewat
-- daftar putih + header scope, supaya admin yang membuka halaman staf melihat
-- hotelnya sendiri, bukan semua hotel. Tapi cabang tenant-nya ditulis
--
--     platform_admin_scope() OR (get_my_role() = 'staff' AND tenant_id = get_my_tenant())
--
-- sehingga seorang admin yang bekerja di aplikasi hotel biasa (tanpa header
-- x-platform-scope) jatuh ke celah: platform_admin_scope() false karena tak ada
-- header, dan cabang kedua menolaknya karena rolenya 'admin', bukan 'staff'.
-- Hasilnya bukan "seperti staf" melainkan TERKUNCI PENUH dari hotelnya sendiri —
-- Permintaan Tamu gagal dibuat ("new row violates row-level security policy for
-- table guest_requests"), begitu pula POS, pembayaran, dan saldo.
--
-- Perbaikannya satu kata: cabang tenant menerima 'staff' DAN 'admin'. Isolasi
-- antar hotel tidak berubah sedikit pun — pembandingnya tetap
-- `tenant_id = get_my_tenant()`, yaitu tenant di profil si pemanggil, jadi
-- lintas hotel tetap wajib platform_admin_scope().

-- Peran yang boleh bekerja di dalam hotelnya sendiri. Satu fungsi supaya aturan
-- ini punya satu definisi, bukan tersebar sebagai literal di belasan policy.
create or replace function public.is_hotel_member() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.get_my_role() in ('staff'::user_role, 'admin'::user_role)
$$;
revoke all on function public.is_hotel_member() from public;
grant execute on function public.is_hotel_member() to anon, authenticated, service_role;

-- ─── Policy "for all" (baca + tulis) ──────────────────────────────────────────
do $$
declare
  t text;
  tables text[] := array[
    'guest_requests','pos_products','pos_orders','pos_charges','payments'
  ];
begin
  foreach t in array tables loop
    execute format('drop policy if exists %I on public.%I', t || '_access', t);
    execute format(
      'create policy %I on public.%I for all to authenticated '
      || 'using (public.platform_admin_scope() '
      || '       or (public.is_hotel_member() and tenant_id = public.get_my_tenant())) '
      || 'with check (public.platform_admin_scope() '
      || '       or (public.is_hotel_member() and tenant_id = public.get_my_tenant()))',
      t || '_access', t);
  end loop;
end $$;

-- ─── Policy hanya-baca ────────────────────────────────────────────────────────
drop policy if exists hotel_balance_read on hotel_balance;
create policy hotel_balance_read on hotel_balance for select to authenticated
  using (public.platform_admin_scope()
         or (public.is_hotel_member() and tenant_id = public.get_my_tenant()));

drop policy if exists balance_ledger_read on balance_ledger;
create policy balance_ledger_read on balance_ledger for select to authenticated
  using (public.platform_admin_scope()
         or (public.is_hotel_member() and tenant_id = public.get_my_tenant()));

drop policy if exists payouts_read on payouts;
create policy payouts_read on payouts for select to authenticated
  using (public.platform_admin_scope()
         or (public.is_hotel_member() and tenant_id = public.get_my_tenant()));

drop policy if exists hotel_payment_config_read on hotel_payment_config;
create policy hotel_payment_config_read on hotel_payment_config for select to authenticated
  using (public.platform_admin_scope()
         or (public.is_hotel_member() and tenant_id = public.get_my_tenant()));

drop policy if exists wa_hotel_sessions_read on wa_hotel_sessions;
create policy wa_hotel_sessions_read on wa_hotel_sessions for select to authenticated
  using (public.platform_admin_scope()
         or (public.is_hotel_member() and tenant_id = public.get_my_tenant()));

-- ─── Penarikan saldo ──────────────────────────────────────────────────────────
-- Meminta penarikan = tindakan hotel (staf ATAU admin hotel itu). Memproses
-- (menyetujui/menolak) tetap kewenangan platform — policy payouts_process dari
-- 035 sengaja TIDAK disentuh.
drop policy if exists payouts_request on payouts;
create policy payouts_request on payouts for insert to authenticated
  with check (public.platform_admin_scope()
              or (public.is_hotel_member() and tenant_id = public.get_my_tenant()));
