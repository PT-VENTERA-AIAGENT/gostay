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
  array['booking', 'bookingan', 'pesan kamar', 'pesen kamar', 'reservasi', 'nginap', 'menginap', 'sewa kamar', 'kamar kosong', 'check in']::text[],
  'none'::wa_flow_requirement,
  10,
  '{"version":1,"nodes":[{"id":"t","type":"trigger","data":{},"position":{"x":80,"y":80}},{"id":"welcome","type":"message","position":{"x":80,"y":220},"data":{"text":"Halo! Selamat datang di *{{hotel_name}}* 👋\n\nDengan senang hati kami bantu pemesanan kamar Anda."}},{"id":"types","type":"action","position":{"x":80,"y":360},"data":{"action":"show_room_types"}},{"id":"book","type":"action","position":{"x":80,"y":500},"data":{"action":"start_booking"}}],"edges":[{"id":"e1","source":"t","target":"welcome"},{"id":"e2","source":"welcome","target":"types"},{"id":"e3","source":"types","target":"book"}]}'::jsonb,
  true
)
on conflict (tenant_id, name) do nothing;

insert into wa_flows (tenant_id, name, description, trigger_keywords, requires, priority, definition, is_active)
values (
  '0cfdd376-f6c9-4d8d-ac39-fa77e24cc64e'::uuid,
  '02 Request Tamu (Room Service)',
  'Khusus tamu yang SUDAH check-in. Menampilkan menu dari kasir/POS hotel, tamu memilih lewat chat, pesanan masuk ke antrean Permintaan Tamu dan ditagihkan ke folio kamar.',
  array['menu', 'room service', 'roomservice', 'pesan makan', 'pesan makanan', 'makan', 'minum', 'lapar', 'haus', 'laundry', 'handuk', 'spa']::text[],
  'inhouse'::wa_flow_requirement,
  20,
  '{"version":1,"nodes":[{"id":"t","type":"trigger","data":{},"position":{"x":80,"y":80}},{"id":"hello","type":"message","position":{"x":80,"y":220},"data":{"text":"Halo {{guest_name}} 👋\nKami siap membantu kebutuhan Anda selama menginap di *{{hotel_name}}*."}},{"id":"order","type":"action","position":{"x":80,"y":360},"data":{"action":"start_room_service"}},{"id":"notstaying","type":"end","position":{"x":80,"y":500},"data":{"text":"Mohon maaf, layanan ini khusus untuk tamu yang sedang menginap. Bila Anda ingin memesan kamar, ketik *booking* ya."}}],"edges":[{"id":"e1","source":"t","target":"hello"},{"id":"e2","source":"hello","target":"order"},{"id":"e3","source":"order","target":"notstaying"}]}'::jsonb,
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
  '{"version":1,"nodes":[{"id":"t","type":"trigger","data":{},"position":{"x":80,"y":80}},{"id":"ask","type":"choice","position":{"x":80,"y":220},"data":{"text":"*{{hotel_name}}*\nHalo! Ada yang bisa kami bantu?","options":[{"id":"book","label":"Pesan kamar"},{"id":"info","label":"Lihat kamar & harga"},{"id":"cs","label":"Bicara dengan staf"}]}},{"id":"book","type":"action","position":{"x":80,"y":360},"data":{"action":"start_booking"}},{"id":"info","type":"action","position":{"x":400,"y":360},"data":{"action":"show_room_types"}},{"id":"portal","type":"action","position":{"x":400,"y":500},"data":{"action":"send_portal_link"}},{"id":"infoend","type":"end","position":{"x":400,"y":640},"data":{"text":"Bila ingin memesan, ketik *booking* ya. Terima kasih! 🙏"}},{"id":"cs","type":"handoff","position":{"x":720,"y":360},"data":{"text":"Baik, kami sambungkan dengan staf *{{hotel_name}}*. Mohon tunggu sebentar ya 🙏"}}],"edges":[{"id":"e1","source":"t","target":"ask"},{"id":"e2","source":"ask","target":"book","sourceHandle":"book"},{"id":"e3","source":"ask","target":"info","sourceHandle":"info"},{"id":"e4","source":"ask","target":"cs","sourceHandle":"cs"},{"id":"e5","source":"info","target":"portal"},{"id":"e6","source":"portal","target":"infoend"}]}'::jsonb,
  true
)
on conflict (tenant_id, name) do nothing;

commit;
