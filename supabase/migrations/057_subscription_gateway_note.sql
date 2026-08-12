-- Catatan MESIN pada tagihan langganan, terpisah dari catatan operator.
--
-- Lahir dari satu pertanyaan: ke mana perginya uang yang masuk tapi tidak
-- melunasi apa pun? Ada tiga keadaan seperti itu di jalur pembayaran online
-- (056), dan ketiganya sebelumnya hanya hidup di log server yang tak pernah
-- dibuka siapa-siapa:
--
--   • kurang bayar     — callback "PAID" tapi nominalnya di bawah tagihan
--   • sudah dibebaskan — operator me-waive, hotel terlanjur membayar
--   • bayar ganda      — dua invoice untuk bulan yang sama, dua-duanya dibayar
--
-- Kolomnya sengaja BUKAN `note`. Itu milik operator ("transfer 5 Agustus via
-- BCA"), dan mesin yang menimpanya setiap kali callback datang akan menghapus
-- catatan tangan orang.
--
-- Berdiri sendiri, bukan menumpang 056, karena 056 sudah pernah diterapkan:
-- mengedit berkas yang sudah dijalankan tidak memunculkan kolomnya di basis
-- data mana pun, dan PATCH ke kolom yang tidak ada dijawab PostgREST dengan
-- 400 — tepat pada kasus yang paling perlu diselesaikan.

alter table hotel_subscription_invoices
  add column if not exists gateway_note text;
