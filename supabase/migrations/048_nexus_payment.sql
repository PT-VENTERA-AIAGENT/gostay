-- 048: Pembayaran lewat Ventera-Nexus.
--
-- GoStay berhenti memanggil Xendit langsung untuk MEMBUAT invoice; pembuatan
-- pindah ke Nexus (POST /v1/payments) dan settlement pulang lewat callback
-- bertanda tangan HMAC ke /api/payment/nexus. Kontraknya di repo
-- PT-VENTERA-AIAGENT/ventera-nexus → docs/INTEGRASI.md. Tiga tabel di bawah
-- adalah "yang harus disiapkan aplikasi" menurut §11 kontrak itu:
--
--   nexus_references       reference → booking. Jenis transaksi TIDAK dikodekan
--                          di dalam reference (aturan §3), jadi pemetaannya
--                          hidup di sini. Juga menyimpan body request yang sudah
--                          diserialisasi — Idempotency-Key Nexus terikat pada
--                          hash body, sehingga retry WAJIB mengirim byte yang
--                          sama, bukan menyusun ulang.
--   nexus_processed_events idempotensi callback pada X-Nexus-Event-Id.
--   nexus_reconcile_state  kursor rekonsiliasi per environment (§7).
--
-- Ketiganya server-only (service role). RLS dinyalakan TANPA policy: anon dan
-- authenticated tidak bisa membaca sama sekali; service role mem-bypass RLS.

create table if not exists nexus_references (
  reference        text primary key,
  booking_id       uuid not null references bookings(id) on delete cascade,
  tenant_id        uuid not null references tenants(id) on delete cascade,
  environment      text not null check (environment in ('sandbox', 'production')),
  amount           numeric(14,2) not null,
  -- Body POST /v1/payments persis seperti yang dikirim (string). Dipakai ulang
  -- byte-per-byte saat retry supaya idempotensi Nexus mengembalikan pembayaran
  -- yang sama, bukan 409 idempotency_key_reused.
  request_body     text not null,
  nexus_payment_id text,
  checkout_url     text,
  -- Vokabulari status Nexus: requires_payment/pending/paid/expired/failed/
  -- cancelled/… plus 'created' lokal (baris ditulis sebelum Nexus menjawab).
  status           text not null default 'created',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_nexus_references_booking
  on nexus_references(booking_id, created_at desc);

create table if not exists nexus_processed_events (
  event_id   text primary key,
  created_at timestamptz not null default now()
);

create table if not exists nexus_reconcile_state (
  environment  text primary key check (environment in ('sandbox', 'production')),
  last_success timestamptz,
  updated_at   timestamptz not null default now()
);

alter table nexus_references       enable row level security;
alter table nexus_processed_events enable row level security;
alter table nexus_reconcile_state  enable row level security;
