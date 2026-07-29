-- Catat kegagalan layanan WhatsApp beserta TAMU yang mengalaminya.
--
-- Selama ini kegagalan hanya jadi console.error di serverless. Akibatnya staf
-- melihat balasan bot terpampang rapi di inbox GoStay, tamunya tidak pernah
-- menerima apa pun, dan tidak ada satu pun tempat yang menunjukkan bedanya.
-- Kasus nyatanya tamu ber-alamat `@lid` (alias privasi WhatsApp tanpa nomor
-- telepon): mustahil dikirimi pesan, dan diam-diam gagal berhari-hari.
--
-- Tabel ini membuat kegagalan punya alamat: hotel mana, tamu siapa, jenis apa.
-- Dibaca oleh inbox hotel dan oleh konsol platform (lintas hotel).

create table if not exists wa_incidents (
  id           uuid primary key default uuid_generate_v4(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  -- 'delivery'     — balasan gagal dikirim ke WhatsApp tamu.
  -- 'conversation' — bot gagal memproses pesan tamu (tamu dibalas permintaan maaf).
  kind         text not null check (kind in ('delivery', 'conversation')),
  -- Tamu yang mengalami. Null bila kegagalan terjadi sebelum kontak sempat
  -- dibuat (mis. provisioning gagal) — insidennya tetap tercatat.
  customer_id  uuid references customers(id) on delete set null,
  thread_id    uuid references chat_threads(id) on delete set null,
  -- Alamat tujuan apa adanya, supaya "@lid" terlihat sebagai penyebab.
  target_jid   text,
  session_id   text,
  -- Kode teknis: send_failed_<status> | network_error | send_not_configured |
  -- unroutable_lid:<sebab> | exception:<pesan>.
  reason       text not null,
  -- Cuplikan isi supaya staf tahu apa yang tidak sampai / apa yang gagal
  -- diproses. Dipotong di aplikasi; kolomnya tanpa batas agar tak menolak insert.
  message_preview text,
  -- Diisi saat staf menandai sudah ditindaklanjuti (mis. dihubungi manual).
  resolved_at  timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists idx_wa_incidents_tenant
  on wa_incidents(tenant_id, created_at desc);
create index if not exists idx_wa_incidents_customer
  on wa_incidents(customer_id, created_at desc);
-- Konsol platform membaca lintas hotel, terbaru dulu.
create index if not exists idx_wa_incidents_recent
  on wa_incidents(created_at desc);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
-- Ditulis HANYA oleh webhook (service role, melewati RLS), jadi tidak ada policy
-- insert untuk klien. Anggota hotel membaca miliknya sendiri; operator platform
-- dengan scope membaca semuanya — pola yang sama dengan 041.
alter table wa_incidents enable row level security;

drop policy if exists wa_incidents_read on wa_incidents;
create policy wa_incidents_read on wa_incidents for select to authenticated
  using (public.platform_admin_scope()
         or (public.is_hotel_member() and tenant_id = public.get_my_tenant()));

-- Menandai sudah ditindaklanjuti adalah tindakan hotel; baris tetap tak bisa
-- dibuat atau dihapus dari klien.
drop policy if exists wa_incidents_resolve on wa_incidents;
create policy wa_incidents_resolve on wa_incidents for update to authenticated
  using (public.platform_admin_scope()
         or (public.is_hotel_member() and tenant_id = public.get_my_tenant()))
  with check (public.platform_admin_scope()
              or (public.is_hotel_member() and tenant_id = public.get_my_tenant()));
