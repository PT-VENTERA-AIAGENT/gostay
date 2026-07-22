# GoStay — Pending Tasks

> Last updated: 2026-07-22
> Priority: P0 = blocker GTM, P1 = penting bulan ini, P2 = bulan 2-3

---

## P0 — GTM Blockers (Selesaikan Sebelum Outreach)

- [ ] **Fase 6: Operasional WA** — wa-ventera deployment, QR flow production, e2e test end-to-end satu hotel nyata
- [ ] **Halaman `/pricing`** — saat ini 404. Buat pricing section di landing page gostay.id
- [ ] **Self-serve admin onboarding** — wrap `api/admin/onboard-hotel.ts` jadi UI form (atau minimal CLI script yang bisa dijalankan non-developer)
- [ ] **Billing/subscription** — belum ada sistem charge customer. Mulai dengan manual invoice Xendit/transfer, lalu otomasi
- [ ] **wa-ventera deployment docs** — tidak ada runbook lengkap untuk deploy gateway ke production server

---

## P1 — Lead Generation Agentic System

- [ ] **Google Maps scraper pipeline** — scrape hotel/villa berdasarkan area + filter (rating, review count, kategori)
- [ ] **Lead enrichment** — scrape harga kamar dari Booking.com/Traveloka per properti untuk personalisasi pitch
- [ ] **Outbound WA agent** — AI agent yang kirim WA dingin, handle replies, qualify leads, booking demo
- [ ] **Lead CRM** — tracking state per lead (contacted → replied → demo → trial → paying)
- [ ] **Personalized message generator** — Claude-based copywriter yang generate pesan berdasarkan profil properti
- [ ] **Follow-up scheduler** — auto follow-up D+2, D+7 untuk yang tidak reply
- [ ] **Demo booking flow** — lead bisa langsung jadwalkan demo via WA tanpa form eksternal

---

## P1 — Product Gaps (Harus Ada Sebelum Paid Launch)

- [ ] **Email notifications** — tidak ada SMTP/email template. Minimal: booking confirmation email ke tamu
- [ ] **Analytics aggregation pipeline** — `analytics_cache` table sudah ada tapi tidak ada job yang populate. Charts saat ini mocked
- [ ] **Booking policy config** — cancellation window, no-show fee, deposit minimum tidak ada di schema
- [ ] **Housekeeping workflow UI** — `housekeeping_status` enum sudah ada di schema tapi tidak ada dedicated halaman

---

## P2 — Vertical Duplication (Bulan 2-3)

- [ ] **GoKlinik** — fork GoStay untuk klinik/dokter/fisioterapi (appointment, reminder, rekam medis sederhana)
- [ ] **GoSalon** — fork untuk salon/barbershop/spa (slot booking, customer history, loyalty)
- [ ] **GoKost** — fork untuk kos-kosan (room occupancy, tagihan bulanan, pembayaran tracking)
- [ ] **Shared component library** — ekstrak UI + WA bot core ke shared package agar tidak duplikasi kode saat vertical scaling

---

## P2 — Technical Debt

- [ ] **README.md** — masih "TODO: Document your project here"
- [ ] **Analytics PDF export** — migration punya hook tapi pipeline belum ada
- [ ] **WA media handling** — saat ini teks only; foto kamar/KTP via WA belum ditangani
- [ ] **Multi-property per staff** — saat ini satu staff = satu tenant
- [ ] **OTA channel manager** — integrasi Booking.com / Traveloka / Airbnb (paling kompleks, P3)
- [ ] **Payment gateway** — Xendit untuk collect deposit atau full payment online (bukan hanya tracking manual)
