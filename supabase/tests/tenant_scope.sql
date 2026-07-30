-- Pemeriksaan lingkup hotel: portal tamu mengikuti hotel yang DIKUNJUNGI,
-- sementara staf tidak bisa digeser ke mana pun.
--
-- Dijalankan terhadap database sungguhan (RLS menyala), karena yang diuji di
-- sini adalah policy dan `current_tenant()` — bukan sesuatu yang bisa ditiru di
-- unit test. Harness run.sh sengaja tidak dipakai: ia hanya memuat migration
-- 001–005, jauh sebelum current_tenant() ada.
--
--   psql "$SETUP_DB_CONNECTION_STRING" \
--     -v guest=<profile_id tamu> -v staff=<profile_id staf> \
--     -v visited=<slug hotel yang dikunjungi> -v home=<slug hotel staf> \
--     -f supabase/tests/tenant_scope.sql
--
-- Latar: 30 Jul 2026 seorang tamu membuka tautan Lor Kali, berhasil login, dan
-- melihat Kopi Rintik — nama, kamar, tarif, semuanya milik hotel lain. Sebabnya
-- current_tenant() mendahulukan profiles.tenant_id untuk siapa pun yang login,
-- dan kolom itu hanya bisa menyimpan SATU hotel.

\set ON_ERROR_STOP on
\pset pager off

create schema if not exists tests;

create or replace function tests.eq(what text, got text, want text) returns void
language plpgsql as $$
begin
  if got is not distinct from want then
    raise notice 'OK    % (%)', what, coalesce(got, 'null');
  else
    raise exception 'GAGAL % — dapat %, seharusnya %', what, coalesce(got,'null'), coalesce(want,'null');
  end if;
end $$;

-- Pemeriksaannya berjalan SEBAGAI `authenticated` — itu justru intinya, karena
-- RLS hanya berlaku untuk peran itu. Jadi peran tersebut harus boleh memanggil
-- fungsi bantu ini.
grant usage on schema tests to authenticated;
grant execute on function tests.eq(text, text, text) to authenticated;

begin;

-- ── TAMU membuka portal hotel yang ia kunjungi ───────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', :'guest', 'role', 'authenticated')::text, true);
select set_config('request.headers',
  json_build_object('x-tenant-slug', :'visited')::text, true);

select tests.eq(
  'tamu: hotel efektif mengikuti tautan yang dibuka',
  (select slug from tenants where id = current_tenant()),
  :'visited');

select tests.eq(
  'tamu: identitas hotel yang dikunjungi terbaca',
  (select count(*)::text from tenants where slug = :'visited'),
  '1');

select tests.eq(
  'tamu: tipe kamar yang terbaca milik hotel yang dikunjungi',
  (select count(distinct t.slug)::text from room_types rt join tenants t on t.id = rt.tenant_id),
  '1');

-- ── STAF tidak boleh digeser oleh header ─────────────────────────────────────
-- Ini batas keamanan, bukan soal tampilan: header datang dari browser, jadi
-- kalau ia bisa memindahkan staf, satu header sudah cukup untuk membuka data
-- operasional hotel yang bukan miliknya.
select set_config('request.jwt.claims',
  json_build_object('sub', :'staff', 'role', 'authenticated')::text, true);
select set_config('request.headers',
  json_build_object('x-tenant-slug', :'visited')::text, true);

select tests.eq(
  'staf: header hotel lain TIDAK memindahkannya',
  (select slug from tenants where id = current_tenant()),
  :'home');

select tests.eq(
  'staf: hanya membaca satu hotel — hotelnya sendiri',
  (select count(*)::text from tenants),
  '1');

rollback;

\echo ''
\echo 'Semua pemeriksaan lingkup hotel lulus.'
