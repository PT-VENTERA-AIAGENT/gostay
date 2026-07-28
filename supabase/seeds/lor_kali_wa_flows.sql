-- GENERATED — do not edit by hand.
-- Source: api/_lib/wa/flow/templates.ts (regenerate rather than patch).
--
-- Installed ACTIVE, unlike the console's Pasang Template button which leaves
-- them off. This is a test hotel that exists to be messaged: a seed that needs
-- a follow-up click before anything answers is a seed that looks broken.

begin;

insert into wa_flows (tenant_id, name, description, trigger_keywords, requires, priority, definition, is_active)
values (
  '0cfdd376-f6c9-4d8d-ac39-fa77e24cc64e'::uuid,
  '01 Reservasi Kamar',
  'Tamu memesan kamar lewat WhatsApp: bot menanyakan tanggal, jumlah tamu, dan tipe kamar, menghitung harga dari ketersediaan asli, lalu mengirim tautan pembayaran di chat yang sama.',
  array['booking', 'bookingan', 'pesan kamar', 'pesen kamar', 'reservasi', 'nginap', 'menginap', 'sewa kamar', 'mau nginap', 'mau pesan']::text[],
  'none'::wa_flow_requirement,
  10,
  '{"version":1,"nodes":[{"id":"t","type":"trigger","data":{},"position":{"x":80,"y":80}},{"id":"n1","type":"message","position":{"x":80,"y":220},"data":{"text":"Halo! Selamat datang di *{{hotel_name}}* 👋\n\nDengan senang hati kami bantu pemesanan kamar Anda."}},{"id":"n2","type":"action","position":{"x":80,"y":360},"data":{"action":"show_room_types"}},{"id":"n3","type":"action","position":{"x":80,"y":500},"data":{"action":"start_booking"}}],"edges":[{"id":"e1","source":"t","target":"n1"},{"id":"e2","source":"n1","target":"n2"},{"id":"e3","source":"n2","target":"n3"}]}'::jsonb,
  true
)
on conflict (tenant_id, name) do nothing;

insert into wa_flows (tenant_id, name, description, trigger_keywords, requires, priority, definition, is_active)
values (
  '0cfdd376-f6c9-4d8d-ac39-fa77e24cc64e'::uuid,
  '02 Request Tamu (Room Service)',
  'Khusus tamu yang SUDAH check-in. Menampilkan menu dari kasir/POS hotel, tamu memilih lewat chat, pesanan masuk ke antrean Permintaan Tamu dan ditagihkan ke folio kamar.',
  array['menu', 'room service', 'roomservice', 'pesan makan', 'pesan makanan', 'makan', 'minum', 'lapar', 'haus', 'sarapan']::text[],
  'inhouse'::wa_flow_requirement,
  20,
  '{"version":1,"nodes":[{"id":"t","type":"trigger","data":{},"position":{"x":80,"y":80}},{"id":"hello","type":"message","position":{"x":80,"y":220},"data":{"text":"Halo {{guest_name}} 👋\nKami siap membantu kebutuhan Anda selama menginap di *{{hotel_name}}*."}},{"id":"order","type":"action","position":{"x":80,"y":360},"data":{"action":"start_room_service"}},{"id":"notstaying","type":"end","position":{"x":80,"y":500},"data":{"text":"Mohon maaf, layanan ini khusus untuk tamu yang sedang menginap. Bila Anda ingin memesan kamar, ketik *booking* ya."}}],"edges":[{"id":"e1","source":"t","target":"hello"},{"id":"e2","source":"hello","target":"order"},{"id":"e3","source":"order","target":"notstaying"}]}'::jsonb,
  true
)
on conflict (tenant_id, name) do nothing;

insert into wa_flows (tenant_id, name, description, trigger_keywords, requires, priority, definition, is_active)
values (
  '0cfdd376-f6c9-4d8d-ac39-fa77e24cc64e'::uuid,
  '03 Housekeeping & Laundry',
  'Permintaan non-makanan dari tamu yang menginap: handuk, bersih-bersih kamar, laundry, perlengkapan mandi. Ditanyakan detailnya, lalu diteruskan ke staf.',
  array['handuk', 'laundry', 'cuci baju', 'cuci pakaian', 'bersihkan kamar', 'housekeeping', 'sabun', 'sampo', 'tisu', 'selimut', 'bantal', 'ganti sprei']::text[],
  'inhouse'::wa_flow_requirement,
  25,
  '{"version":1,"nodes":[{"id":"t","type":"trigger","data":{},"position":{"x":80,"y":80}},{"id":"ask","type":"ask","position":{"x":80,"y":220},"data":{"prompt":"Baik {{guest_name}}, kami bantu ya. Mohon tuliskan detail permintaan Anda (misalnya: 2 handuk, atau laundry 3 potong).","variable":"permintaan"}},{"id":"done","type":"end","position":{"x":80,"y":360},"data":{"text":"Terima kasih. Permintaan Anda — _{{permintaan}}_ — sudah kami teruskan ke petugas. Mohon ditunggu ya 🙏"}}],"edges":[{"id":"e1","source":"t","target":"ask"},{"id":"e2","source":"ask","target":"done"}]}'::jsonb,
  true
)
on conflict (tenant_id, name) do nothing;

insert into wa_flows (tenant_id, name, description, trigger_keywords, requires, priority, definition, is_active)
values (
  '0cfdd376-f6c9-4d8d-ac39-fa77e24cc64e'::uuid,
  '04 Keluhan & Kendala',
  'Menangkap keluhan (AC rusak, kamar kotor, air mati) dengan sopan, menanyakan detailnya, lalu langsung mengalihkan ke staf. Tidak dijawab bot — keluhan butuh manusia.',
  array['komplain', 'keluhan', 'rusak', 'mati', 'bocor', 'kotor', 'bau', 'tidak berfungsi', 'gak berfungsi', 'kecewa', 'protes']::text[],
  'none'::wa_flow_requirement,
  30,
  '{"version":1,"nodes":[{"id":"t","type":"trigger","data":{},"position":{"x":80,"y":80}},{"id":"ask","type":"ask","position":{"x":80,"y":220},"data":{"prompt":"Mohon maaf atas ketidaknyamanannya 🙏\n\nBoleh dijelaskan kendalanya agar dapat segera kami tangani?","variable":"keluhan"}},{"id":"staff","type":"handoff","position":{"x":80,"y":360},"data":{"text":"Terima kasih sudah menyampaikan. Keluhan Anda — _{{keluhan}}_ — kami teruskan ke staf *{{hotel_name}}* sekarang juga. Mohon tunggu sebentar ya."}}],"edges":[{"id":"e1","source":"t","target":"ask"},{"id":"e2","source":"ask","target":"staff"}]}'::jsonb,
  true
)
on conflict (tenant_id, name) do nothing;

insert into wa_flows (tenant_id, name, description, trigger_keywords, requires, priority, definition, is_active)
values (
  '0cfdd376-f6c9-4d8d-ac39-fa77e24cc64e'::uuid,
  '05 Bicara dengan Staf',
  'Jalan pintas ke manusia. Tamu yang mengetik ''admin'' atau ''cs'' langsung dialihkan tanpa melewati pertanyaan bot apa pun.',
  array['admin', 'cs', 'customer service', 'staf', 'staff', 'operator', 'manusia', 'orangnya', 'bicara dengan', 'resepsionis']::text[],
  'none'::wa_flow_requirement,
  40,
  '{"version":1,"nodes":[{"id":"t","type":"trigger","data":{},"position":{"x":80,"y":80}},{"id":"n1","type":"handoff","position":{"x":80,"y":220},"data":{"text":"Baik, kami sambungkan dengan staf *{{hotel_name}}*. Mohon tunggu sebentar ya 🙏"}}],"edges":[{"id":"e1","source":"t","target":"n1"}]}'::jsonb,
  true
)
on conflict (tenant_id, name) do nothing;

insert into wa_flows (tenant_id, name, description, trigger_keywords, requires, priority, definition, is_active)
values (
  '0cfdd376-f6c9-4d8d-ac39-fa77e24cc64e'::uuid,
  '06 Cek Kamar Kosong',
  'Menjawab “ada kamar kosong?” dengan jumlah kamar yang benar-benar tersedia per tipe, dibaca dari booking asli. Menyebut jumlah dan tarif saja — tidak pernah nomor kamar yang terisi atau siapa yang menginap.',
  array['kamar kosong', 'masih ada kamar', 'ada kamar', 'kamar tersedia', 'ketersediaan', 'masih kosong', 'ada yang kosong', 'sisa kamar']::text[],
  'none'::wa_flow_requirement,
  45,
  '{"version":1,"nodes":[{"id":"t","type":"trigger","data":{},"position":{"x":80,"y":80}},{"id":"n1","type":"action","position":{"x":80,"y":220},"data":{"action":"check_availability"}}],"edges":[{"id":"e1","source":"t","target":"n1"}]}'::jsonb,
  true
)
on conflict (tenant_id, name) do nothing;

insert into wa_flows (tenant_id, name, description, trigger_keywords, requires, priority, definition, is_active)
values (
  '0cfdd376-f6c9-4d8d-ac39-fa77e24cc64e'::uuid,
  '07 Cek Harga & Tarif',
  'Menjawab ''berapa harganya?'' dengan daftar tipe kamar dan tarif per malam yang asli, lalu menawarkan untuk lanjut memesan. Lebih ringan daripada alur reservasi penuh.',
  array['harga', 'harganya', 'tarif', 'biaya', 'price', 'rate', 'berapa harga', 'berapa tarif', 'list harga', 'daftar harga']::text[],
  'none'::wa_flow_requirement,
  50,
  '{"version":1,"nodes":[{"id":"t","type":"trigger","data":{},"position":{"x":80,"y":80}},{"id":"types","type":"action","position":{"x":80,"y":220},"data":{"action":"show_room_types"}},{"id":"next","type":"choice","position":{"x":80,"y":360},"data":{"text":"Apakah ada yang ingin dipesan?","options":[{"id":"book","label":"Ya, mau pesan"},{"id":"later","label":"Nanti dulu"}]}},{"id":"book","type":"action","position":{"x":80,"y":500},"data":{"action":"start_booking"}},{"id":"later","type":"end","position":{"x":400,"y":500},"data":{"text":"Baik, silakan hubungi kami kapan saja. Terima kasih! 🙏"}}],"edges":[{"id":"e1","source":"t","target":"types"},{"id":"e2","source":"types","target":"next"},{"id":"e3","source":"next","target":"book","sourceHandle":"book"},{"id":"e4","source":"next","target":"later","sourceHandle":"later"}]}'::jsonb,
  true
)
on conflict (tenant_id, name) do nothing;

insert into wa_flows (tenant_id, name, description, trigger_keywords, requires, priority, definition, is_active)
values (
  '0cfdd376-f6c9-4d8d-ac39-fa77e24cc64e'::uuid,
  '08 Info Check-in & Check-out',
  'Jam check-in dan check-out, syarat identitas, dan deposit. Ubah teksnya sesuai kebijakan hotel Anda — ini template, bukan aturan sistem.',
  array['check in', 'checkin', 'check out', 'checkout', 'jam berapa', 'jam check', 'deposit', 'syarat', 'ktp', 'bawa apa']::text[],
  'none'::wa_flow_requirement,
  55,
  '{"version":1,"nodes":[{"id":"t","type":"trigger","data":{},"position":{"x":80,"y":80}},{"id":"n1","type":"message","position":{"x":80,"y":220},"data":{"text":"*Check-in & Check-out — {{hotel_name}}*\n\n🕐 Check-in mulai pukul *14.00*\n🕛 Check-out paling lambat pukul *12.00*\n\nMohon membawa *KTP/identitas asli* saat check-in.\nCheck-in lebih awal atau check-out lebih lambat dapat kami usahakan sesuai ketersediaan kamar."}},{"id":"n2","type":"end","position":{"x":80,"y":360},"data":{"text":"Ada lagi yang dapat kami bantu? Ketik *menu* untuk pilihan lainnya."}}],"edges":[{"id":"e1","source":"t","target":"n1"},{"id":"e2","source":"n1","target":"n2"}]}'::jsonb,
  true
)
on conflict (tenant_id, name) do nothing;

insert into wa_flows (tenant_id, name, description, trigger_keywords, requires, priority, definition, is_active)
values (
  '0cfdd376-f6c9-4d8d-ac39-fa77e24cc64e'::uuid,
  '09 Lokasi & Arah',
  'Alamat, patokan, dan pilihan transportasi. Ganti alamat contoh di bawah dengan alamat hotel Anda sebelum mengaktifkan.',
  array['lokasi', 'alamat', 'dimana', 'di mana', 'maps', 'google maps', 'arah', 'patokan', 'jalan ke', 'rute']::text[],
  'none'::wa_flow_requirement,
  60,
  '{"version":1,"nodes":[{"id":"t","type":"trigger","data":{},"position":{"x":80,"y":80}},{"id":"n1","type":"message","position":{"x":80,"y":220},"data":{"text":"*Lokasi {{hotel_name}}*\n\n📍 _Isi alamat lengkap hotel Anda di sini_\n\nPatokan: _isi patokan terdekat_\nGoogle Maps: _tempel tautan Maps di sini_\n\nTersedia parkir untuk mobil dan motor."}},{"id":"n2","type":"end","position":{"x":80,"y":360},"data":{"text":"Sampai jumpa di {{hotel_name}}! 🙏"}}],"edges":[{"id":"e1","source":"t","target":"n1"},{"id":"e2","source":"n1","target":"n2"}]}'::jsonb,
  true
)
on conflict (tenant_id, name) do nothing;

insert into wa_flows (tenant_id, name, description, trigger_keywords, requires, priority, definition, is_active)
values (
  '0cfdd376-f6c9-4d8d-ac39-fa77e24cc64e'::uuid,
  '10 Fasilitas Hotel',
  'Wifi, sarapan, parkir, AC, air panas — pertanyaan yang paling sering masuk sebelum tamu memutuskan memesan. Sesuaikan daftarnya dengan fasilitas Anda.',
  array['fasilitas', 'wifi', 'wi-fi', 'internet', 'parkir', 'ac', 'air panas', 'kolam', 'kolam renang', 'mushola', 'musholla', 'tv']::text[],
  'none'::wa_flow_requirement,
  65,
  '{"version":1,"nodes":[{"id":"t","type":"trigger","data":{},"position":{"x":80,"y":80}},{"id":"n1","type":"message","position":{"x":80,"y":220},"data":{"text":"*Fasilitas {{hotel_name}}*\n\n✅ Wifi gratis di seluruh area\n✅ Parkir mobil & motor\n✅ Air panas\n✅ Sarapan _(sesuai tipe kamar)_\n✅ Resepsionis 24 jam\n\n_Sesuaikan daftar ini dengan fasilitas hotel Anda._"}},{"id":"n2","type":"end","position":{"x":80,"y":360},"data":{"text":"Ingin melihat pilihan kamar? Ketik *harga* ya."}}],"edges":[{"id":"e1","source":"t","target":"n1"},{"id":"e2","source":"n1","target":"n2"}]}'::jsonb,
  true
)
on conflict (tenant_id, name) do nothing;

insert into wa_flows (tenant_id, name, description, trigger_keywords, requires, priority, definition, is_active)
values (
  '0cfdd376-f6c9-4d8d-ac39-fa77e24cc64e'::uuid,
  '11 Pembatalan & Refund',
  'Menjelaskan kebijakan pembatalan lalu mengalihkan ke staf, karena refund menyangkut uang dan tidak boleh diputuskan bot. Sesuaikan kebijakannya dengan aturan Anda.',
  array['pembatalan', 'batalkan pesanan', 'refund', 'uang kembali', 'reschedule', 'ganti tanggal', 'pindah tanggal']::text[],
  'none'::wa_flow_requirement,
  70,
  '{"version":1,"nodes":[{"id":"t","type":"trigger","data":{},"position":{"x":80,"y":80}},{"id":"n1","type":"message","position":{"x":80,"y":220},"data":{"text":"*Kebijakan Pembatalan — {{hotel_name}}*\n\n• Pembatalan *H-3* sebelum check-in: refund penuh\n• Pembatalan *H-1*: refund 50%\n• Pembatalan di hari-H atau tidak hadir: tidak ada refund\n\n_Sesuaikan kebijakan ini dengan aturan hotel Anda._"}},{"id":"n2","type":"handoff","position":{"x":80,"y":360},"data":{"text":"Untuk memproses pembatalan atau perubahan tanggal, staf kami akan membantu langsung. Mohon tunggu sebentar ya 🙏"}}],"edges":[{"id":"e1","source":"t","target":"n1"},{"id":"e2","source":"n1","target":"n2"}]}'::jsonb,
  true
)
on conflict (tenant_id, name) do nothing;

insert into wa_flows (tenant_id, name, description, trigger_keywords, requires, priority, definition, is_active)
values (
  '0cfdd376-f6c9-4d8d-ac39-fa77e24cc64e'::uuid,
  '12 Ulasan & Masukan',
  'Meminta masukan tamu dan meneruskannya ke staf. Cocok dipakai setelah tamu check-out — ubah kata pemicunya bila ingin dikirim manual oleh staf.',
  array['ulasan', 'review', 'masukan', 'saran', 'feedback', 'kritik', 'penilaian']::text[],
  'none'::wa_flow_requirement,
  75,
  '{"version":1,"nodes":[{"id":"t","type":"trigger","data":{},"position":{"x":80,"y":80}},{"id":"rate","type":"choice","position":{"x":80,"y":220},"data":{"text":"Terima kasih sudah menginap di *{{hotel_name}}* 🙏\n\nBagaimana pengalaman Anda?","options":[{"id":"baik","label":"Puas 😊"},{"id":"biasa","label":"Biasa saja 😐"},{"id":"kurang","label":"Kurang puas 😞"}]}},{"id":"tanya","type":"ask","position":{"x":80,"y":400},"data":{"prompt":"Boleh dibagikan alasannya? Masukan Anda sangat membantu kami.","variable":"masukan"}},{"id":"terima","type":"end","position":{"x":80,"y":540},"data":{"text":"Terima kasih banyak atas masukannya 🙏 Kami catat: _{{masukan}}_\n\nSemoga bertemu lagi!"}},{"id":"maaf","type":"handoff","position":{"x":440,"y":400},"data":{"text":"Mohon maaf atas pengalaman yang kurang menyenangkan 🙏 Staf kami akan menghubungi Anda untuk menindaklanjuti."}}],"edges":[{"id":"e1","source":"t","target":"rate"},{"id":"e2","source":"rate","target":"tanya","sourceHandle":"baik"},{"id":"e3","source":"rate","target":"tanya","sourceHandle":"biasa"},{"id":"e4","source":"rate","target":"maaf","sourceHandle":"kurang"},{"id":"e5","source":"tanya","target":"terima"}]}'::jsonb,
  true
)
on conflict (tenant_id, name) do nothing;

insert into wa_flows (tenant_id, name, description, trigger_keywords, requires, priority, definition, is_active)
values (
  '0cfdd376-f6c9-4d8d-ac39-fa77e24cc64e'::uuid,
  '80 Tanya Apa Saja (AI)',
  'Menjawab pertanyaan bebas memakai data asli hotel: ketersediaan kamar pada tanggal tertentu, tarif, dan informasi yang staf tulis di Basis Pengetahuan. Bila tidak ada yang mencakupnya, AI mengatakan belum tahu dan menawarkan staf — tidak mengarang.',
  array['apakah', 'apa itu', 'bagaimana', 'gimana', 'bisakah', 'boleh tidak', 'boleh gak', 'tanya dong', 'mau tanya', 'izin bertanya']::text[],
  'none'::wa_flow_requirement,
  80,
  '{"version":1,"nodes":[{"id":"t","type":"trigger","data":{},"position":{"x":80,"y":80}},{"id":"n1","type":"action","position":{"x":80,"y":220},"data":{"action":"ask_concierge"}}],"edges":[{"id":"e1","source":"t","target":"n1"}]}'::jsonb,
  true
)
on conflict (tenant_id, name) do nothing;

insert into wa_flows (tenant_id, name, description, trigger_keywords, requires, priority, definition, is_active)
values (
  '0cfdd376-f6c9-4d8d-ac39-fa77e24cc64e'::uuid,
  '90 Sapaan & Menu Utama',
  'Jaring pengaman untuk sapaan umum. Menawarkan pilihan bernomor: pesan kamar, lihat kamar & harga, atau bicara dengan staf. Prioritas paling rendah, jadi hanya menangkap pesan yang tidak diklaim flow lain.',
  array['halo', 'hallo', 'helo', 'hai', 'hi', 'hey', 'assalamualaikum', 'permisi', 'pagi', 'siang', 'sore', 'malam', 'menu', 'info', 'bantuan', 'help', 'tanya', 'mulai', 'start']::text[],
  'none'::wa_flow_requirement,
  90,
  '{"version":1,"nodes":[{"id":"t","type":"trigger","data":{},"position":{"x":80,"y":80}},{"id":"ask","type":"choice","position":{"x":80,"y":220},"data":{"text":"*{{hotel_name}}*\nHalo! Ada yang bisa kami bantu?","options":[{"id":"book","label":"Pesan kamar"},{"id":"info","label":"Lihat kamar & harga"},{"id":"cs","label":"Bicara dengan staf"}]}},{"id":"book","type":"action","position":{"x":80,"y":400},"data":{"action":"start_booking"}},{"id":"info","type":"action","position":{"x":400,"y":400},"data":{"action":"show_room_types"}},{"id":"portal","type":"action","position":{"x":400,"y":540},"data":{"action":"send_portal_link"}},{"id":"infoend","type":"end","position":{"x":400,"y":680},"data":{"text":"Bila ingin memesan, ketik *booking* ya. Terima kasih! 🙏"}},{"id":"cs","type":"handoff","position":{"x":720,"y":400},"data":{"text":"Baik, kami sambungkan dengan staf *{{hotel_name}}*. Mohon tunggu sebentar ya 🙏"}}],"edges":[{"id":"e1","source":"t","target":"ask"},{"id":"e2","source":"ask","target":"book","sourceHandle":"book"},{"id":"e3","source":"ask","target":"info","sourceHandle":"info"},{"id":"e4","source":"ask","target":"cs","sourceHandle":"cs"},{"id":"e5","source":"info","target":"portal"},{"id":"e6","source":"portal","target":"infoend"}]}'::jsonb,
  true
)
on conflict (tenant_id, name) do nothing;

commit;
