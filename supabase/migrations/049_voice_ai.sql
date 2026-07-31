-- 049: Resepsionis AI (Voice) fase 1 — jejak percakapan di call_logs.
--
-- Log panggilan kini bisa lahir dari dua sumber: dicatat staf (perilaku lama)
-- atau ditulis otomatis oleh resepsionis AI. `source` membedakannya di UI dan
-- laporan; `transcript` menyimpan percakapan penuh — `summary` tetap ringkasan
-- pendek yang tampil di daftar, transkrip untuk ditelusuri saat perlu.
--
-- Keduanya aditif; tidak ada perilaku lama yang berubah.

alter table call_logs add column if not exists transcript text;

alter table call_logs add column if not exists source text not null default 'manual';

do $$ begin
  alter table call_logs
    add constraint call_logs_source_check check (source in ('manual', 'ai'));
exception when duplicate_object then null; end $$;
