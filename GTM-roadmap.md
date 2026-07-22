# GoStay — GTM Roadmap
# "Dari HMS + Chatbot ke Revenue Engine untuk Hotel Kecil Indonesia"

> Last updated: 2026-07-22
> Repositori: PT-VENTERA-AIAGENT/gostay
> Target: 100 paying hotel dalam 90 hari

---

## Positioning (Berdasarkan Analisis Kodebase)

GoStay bukan sekadar booking system. Dengan WA AI bot yang sudah dibangun end-to-end (Fase 3-5 complete), GoStay bisa menjadi **revenue engine aktif** untuk hotel kecil:

- **Reaktif**: Tamu WA → bot jawab → booking masuk otomatis (sudah jalan)
- **Proaktif**: GoStay WA agent scrape leads → hubungi hotel owner → onboard mereka → push occupancy mereka

Kompetitor lokal (Moka Hotel, iReap, SinfoSys) hanya reactive HMS. GoStay bisa jadikan **AI sales partner** yang aktif generate tamu untuk tiap hotel customer-nya.

---

## Pricing Strategy

Benchmark kompetitor lokal Indonesia: Rp 200.000–400.000/bulan (hanya HMS, tanpa WA bot).

| Paket | Harga | Limit | Value Prop |
|---|---|---|---|
| Starter | Rp 99.000/bulan | s.d. 10 kamar | HMS + WA Bot basic |
| Pro | Rp 199.000/bulan | unlimited kamar | HMS + WA Bot + Analytics + Inbox terpusat |
| Growth | Rp 349.000/bulan | unlimited + multi-user | Semua Pro + Lead Push (GoStay aktif cari tamu buat mereka) |

**Early Bird Offer (50 hotel pertama)**: 3 bulan gratis → Rp 99rb/bulan setelahnya.
Framing: "Satu booking villa Bali = nutup biaya GoStay 1 tahun."

---

## Phase 0 — Fix Blockers (Minggu 1–2)

Jangan outreach sebelum ini selesai. Lead yang masuk tidak bisa dikonversi.

1. Selesaikan Fase 6 (wa-ventera production deploy + QR flow + e2e test)
2. Buat halaman `/pricing` di gostay.id (saat ini 404)
3. Buat UI onboarding admin sederhana atau CLI script
4. Setup Xendit untuk invoice/subscription billing (mulai manual dulu)
5. Siapkan demo property: satu hotel dummy yang bisa dipakai untuk demo live ke prospek

---

## Phase 1 — Lead Generation via Google Maps (Minggu 1–3)

### Target Properti
Filter ideal:
- Rating: 4.0–4.5 (aktif, punya tamu, tapi belum corporate)
- Review count: 20–300 (independen, belum chain)
- Kategori: villa, penginapan, guest house, boutique hotel
- Ada nomor WA di Google profile

### Area Prioritas (Urut Potensi)
1. Bali — Ubud, Canggu, Seminyak, Sanur, Kuta, Lovina
2. Lombok — Senggigi, Gili Trawangan, Gili Air
3. Yogyakarta — Prawirotaman, Kaliurang
4. Bandung + Puncak
5. Labuan Bajo, Raja Ampat, Manado, Flores

### Tools
- **Apify Google Maps Scraper**: $49/bulan, export CSV langsung, paling cepat
- **Python custom**: `googlemaps` + `requests` = Rp 0, butuh waktu setup
- **Target**: 5.000 leads batch pertama, 50.000 total dalam 3 bulan

### Data yang Dikumpulkan
```
nama_properti | nomor_wa | kategori | rating | total_review
alamat | kota | provinsi | url_gmaps | foto_thumbnail
```

---

## Phase 2 — Lead Enrichment (Paralel dengan Phase 1)

Untuk setiap lead dari Google Maps, scrape Booking.com / Traveloka:
- Jumlah kamar (estimasi)
- Range harga per malam
- Occupancy signals (berapa review per bulan)
- Fasilitas yang diiklankan

**Tujuan**: Generate pitch yang ultra-personal. Contoh:
> "Kak, villa Ubud [Nama] di Traveloka Rp 850rb/malam — satu booking saja nutup biaya GoStay 8 bulan."

---

## Phase 3 — Outbound WA Agent (Agentic Lead Gen — INTI STRATEGI)

Ini diferensiasi utama: **GoStay menggunakan infrastruktur WA-nya sendiri untuk sales.**

### Arsitektur Outbound Agent

```
Google Maps Scraper
        │
        ▼
Lead Database (Supabase `crm_leads` table)
        │
        ▼
Claude Agent (Personalized Message Generator)
  - Input: nama properti, kategori, rating, harga, area
  - Output: pesan WA yang personal dan relevan (bukan template generik)
        │
        ▼
wa-ventera Outbound Sender
  - Kirim via nomor dedicated GoStay Sales (bukan nomor hotel customer)
  - 100–150 WA/hari (batas aman anti-ban)
        │
        ▼
Reply Handler (AI Conversation Agent)
  - Hotel owner replies → Claude handle percakapan
  - Qualify: sudah pakai sistem apa? berapa kamar? pain point?
  - Convert: tawarkan free trial → kirim link signup → book demo
        │
        ▼
Escalation ke Human (Ade/tim)
  - Hanya jika lead sangat qualified atau minta negosiasi harga
  - AI handle semua yang lain
```

### Conversation States (Outbound)
```
SENT → READ → REPLIED → QUALIFIED → DEMO_BOOKED → TRIAL → PAYING
                                  ↘ NOT_INTERESTED (archive)
                                  ↘ FOLLOW_UP_D2 → FOLLOW_UP_D7 → ARCHIVE
```

### Template Awal per Segmen

**Villa Premium (Bali/Lombok):**
```
Halo Kak [nama pemilik jika ada], saya Ade dari GoStay 🙏

Lihat [Nama Villa] di Google Maps — propertinya keren.
Ada 1 masalah umum villa di sana: WA telat dibalas, tamu
sudah book di tempat lain.

GoStay solve ini — WA Bot AI 24/7 yang auto-handle booking
langsung masuk dashboard. [Nama Villa] di Traveloka Rp [harga]/malam,
satu booking nutup biaya kami [X] bulan.

Gratis 3 bulan pertama, setup 30 menit. Boleh saya kirim demo singkat?
```

**Guest House / Penginapan (kota):**
```
Halo Pak/Bu, GoStay di sini 🙏

Masih kelola booking [Nama Penginapan] via WhatsApp manual?
Kami bikin itu otomatis: bot balas tamu 24 jam, booking
langsung masuk sistem, laporan revenue auto.

Gratis coba 3 bulan. Mau lihat demo 5 menit?
```

---

## Phase 4 — Onboarding & Aktivasi (Target: 30 Menit per Hotel)

Flow saat ini sudah ada di codebase (`api/admin/onboard-hotel.ts`):

1. Admin GoStay run onboarding → buat tenant
2. Hotel owner buka `app.gostay.id` → login via SSO
3. Scan QR di Settings → WA bot aktif terhubung nomor hotel
4. Input room types + harga via wizard (sudah ada di rooms management)
5. Bot langsung aktif menerima tamu

Target onboarding terjadwal: setelah demo, onboarding same-day. Jangan biarkan lead dingin lebih dari 24 jam.

---

## Phase 5 — GoStay sebagai Revenue Partner (Paket Growth)

Ini diferensiasi jangka panjang: GoStay aktif generate tamu untuk hotel customer-nya.

Fitur Growth tier yang perlu dibangun (bulan 2–3):
- **GoStay Discovery** — hotel yang pakai GoStay muncul di direktori `gostay.id/stay` (booking langsung, zero komisi ke OTA)
- **Tamu Cross-Sell** — tamu yang pernah booking hotel A via GoStay bisa diretarget untuk hotel B di area sama
- **Seasonal Push** — GoStay kirim WA blast ke database tamu saat occupancy hotel low (dengan consent)
- **Review Aggregation** — kumpulkan Google Review → tampilkan di portal GoStay

Ini mengubah GoStay dari cost center (sistem manajemen) menjadi revenue center (sumber tamu langsung).

---

## Phase 6 — Vertical Duplication (Bulan 3+)

Kodebase GoStay sudah multi-tenant. Duplikasi ke vertikal lain butuh 2–3 minggu per vertikal karena 80% kode sama.

| Produk | Target | Pain Point | Beda dari GoStay |
|---|---|---|---|
| GoKlinik | Klinik, dokter, fisioterapi | Appointment manual, no reminder, pasien no-show | Slot per dokter, reminder H-1, rekam medis sederhana |
| GoSalon | Salon, barbershop, spa | Dobel booking, no customer history | Slot per stylist, loyalty point, before/after foto |
| GoKost | Kos-kosan | Tagihan manual, kamar kosong tidak diketahui | Tagihan bulanan recurring, laporan per kamar |
| GoEvent | Venue, gedung, studio | Tanggal bentrok, deposit manual | Date blocking ketat, contract digital, deposit tracking |

Approach: satu domain per produk (goklinik.id, gosalons.id, dll) tapi satu SaaS platform di belakang.

---

## Metrics & Target

| Bulan | Leads Scraped | WA Terkirim | Trial Aktif | Paying |
|---|---|---|---|---|
| 1 | 5.000 | 3.000 | 50 | 15 |
| 2 | 20.000 | 9.000 | 150 | 50 |
| 3 | 50.000 | 18.000 | 300 | 100 |

MRR target bulan 3: 100 × Rp 149.000 avg = **Rp 14.900.000/bulan**

---

## Budget GTM Bulanan

- Apify Google Maps scraper: ~Rp 800.000/bulan
- Fonnte / wa-ventera outbound WA: Rp 49.000–200.000/bulan
- OpenAI GPT-4o-mini (WA bot AI): ~Rp 160.000–320.000/1.000 percakapan
- Claude API (personalized message gen): ~Rp 50.000–150.000/bulan
- **Total: < Rp 1.500.000/bulan**

---

## Action Items Minggu Ini

1. [ ] Selesaikan Fase 6 wa-ventera (production deploy)
2. [ ] Buat `/pricing` page di gostay.id
3. [ ] Setup Apify account + mulai scraping Bali
4. [ ] Buat `crm_leads` table di Supabase untuk tracking outbound
5. [ ] Build outbound WA agent (Claude + wa-ventera outbound sender)
6. [ ] Test onboarding 1 hotel dummy end-to-end
