-- Catat SETIAP jawaban concierge AI beserta hotel yang memakainya.
--
-- Concierge sudah sangat berhati-hati memutuskan boleh-tidaknya sebuah jawaban
-- dikirim — ia lebih sering menolak daripada menjawab. Masalahnya, semua
-- penolakan itu hanya jadi console.error di serverless: tidak ada satu tempat
-- pun yang membedakan bot yang bekerja normal dari bot yang sejak kemarin
-- mengganti SEMUA jawaban dengan "boleh saya hubungkan dengan staf?" karena
-- kredit vendor model habis. Celah yang sama persis dengan yang ditutup
-- 043_wa_incidents untuk balasan yang gagal terkirim, satu lapis di atasnya.
--
-- Dibaca konsol platform (lintas hotel) di /platform/ai-logs.

create table if not exists ai_reply_logs (
  id          uuid primary key default uuid_generate_v4(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  -- 'sent'            — dijawab dari data tool, dikirim ke tamu.
  -- 'ungrounded'      — dijawab TANPA memanggil satu tool pun (model mengarang
  --                     dari ingatan); pemanggil membuang jawaban ini.
  -- 'blocked_numbers' — menyebut tarif/jumlah yang tidak ada di hasil tool.
  -- 'blocked_pii'     — bocor nomor telepon / email / kode booking.
  -- 'failed'          — tidak ada provider yang menjawab, atau belum dikonfigurasi.
  status      text not null check (status in
                ('sent', 'ungrounded', 'blocked_numbers', 'blocked_pii', 'failed')),
  -- Pertanyaan tamu apa adanya. Dipotong di aplikasi (2000 char); kolomnya
  -- tanpa batas supaya insert tidak pernah ditolak.
  question    text not null,
  -- Teks yang BENAR-BENAR dikirim. Null bila jawaban diganti atau gagal —
  -- itulah yang membedakan "bot menjawab" dari "bot menolak".
  reply       text,
  -- Provider dari rantai AI_CHAT_PROVIDER yang melayani ('nous' | 'openai'),
  -- dan model konkretnya. Null bila belum sempat memanggil siapa pun.
  provider    text,
  model       text,
  -- Tool yang sempat dipanggil, urut. Kosong = model tidak melihat data apa pun.
  tools_used  text[] not null default '{}',
  -- Angka yang tidak bisa dilacak ke hasil tool (status blocked_numbers).
  offenders   text[] not null default '{}',
  -- Pesan error vendor, saat status = failed.
  error       text,
  latency_ms  integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists idx_ai_reply_logs_tenant
  on ai_reply_logs(tenant_id, created_at desc);
-- Konsol platform membaca lintas hotel, terbaru dulu.
create index if not exists idx_ai_reply_logs_recent
  on ai_reply_logs(created_at desc);
-- Filter per status di konsol.
create index if not exists idx_ai_reply_logs_status
  on ai_reply_logs(status, created_at desc);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
-- Ditulis HANYA oleh webhook (service role, melewati RLS), jadi tidak ada policy
-- insert/update/delete untuk klien: baris audit tidak boleh diubah dari aplikasi.
-- Anggota hotel membaca miliknya sendiri; operator platform dengan scope membaca
-- semuanya — pola yang sama dengan 041 dan 043.
alter table ai_reply_logs enable row level security;

drop policy if exists ai_reply_logs_read on ai_reply_logs;
create policy ai_reply_logs_read on ai_reply_logs for select to authenticated
  using (public.platform_admin_scope()
         or (public.is_hotel_member() and tenant_id = public.get_my_tenant()));
