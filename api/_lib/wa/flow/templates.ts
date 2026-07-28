// Ready-made flows a hotel can install with one click.
//
// A blank canvas is the fastest way to lose someone who has never drawn a
// chatbot. These three templates are a working WhatsApp assistant on their own —
// install them and the hotel answers reservations, takes payment in-chat, and
// serves in-house guests without anyone touching a node. They are also the
// worked example: every node type and both takeover actions appear at least
// once, so editing them is how a hotel learns the vocabulary.
//
// ─── Why the priorities are what they are ────────────────────────────────────
// "Reservasi" (10) and "Request Tamu" (20) both claim words that "Sapaan" (90)
// also lists — deliberately. Selection walks them in priority order and skips
// any flow whose `requires` the guest does not meet, so ONE keyword resolves
// differently depending on who typed it:
//
//   guest typed "menu", is checked in      → Request Tamu   (requires inhouse ✓)
//   guest typed "menu", is not checked in  → Sapaan         (inhouse ✗, skipped)
//
// That is the whole reservation-vs-menu problem, expressed as data. Change the
// numbers in the console and the resolution changes with them.

import { FLOW_VERSION, type FlowDefinition } from "./types";
import type { FlowRequirement } from "./store";

export interface FlowTemplate {
  /** Stable id — also the idempotency key when installing. */
  key: string;
  name: string;
  description: string;
  triggerKeywords: string[];
  requires: FlowRequirement;
  priority: number;
  definition: FlowDefinition;
}

/** Lay nodes out in a readable column so the canvas opens tidy, not stacked. */
const at = (row: number, col = 0) => ({ x: 80 + col * 320, y: 80 + row * 140 });

// ─── 1. Reservasi kamar, dengan pembayaran di chat ───────────────────────────

const RESERVASI: FlowTemplate = {
  key: "reservasi",
  name: "01 Reservasi Kamar",
  description:
    "Tamu memesan kamar lewat WhatsApp: bot menanyakan tanggal, jumlah tamu, dan tipe kamar, " +
    "menghitung harga dari ketersediaan asli, lalu mengirim tautan pembayaran di chat yang sama.",
  triggerKeywords: [
    "booking", "bookingan", "pesan kamar", "pesen kamar", "reservasi",
    "nginap", "menginap", "sewa kamar", "kamar kosong", "check in",
  ],
  requires: "none",
  priority: 10,
  definition: {
    version: FLOW_VERSION,
    nodes: [
      { id: "t", type: "trigger", data: {}, position: at(0) },
      {
        id: "welcome",
        type: "message",
        position: at(1),
        data: {
          text:
            "Halo! Selamat datang di *{{hotel_name}}* 👋\n\n" +
            "Dengan senang hati kami bantu pemesanan kamar Anda.",
        },
      },
      // Show the real price list before asking for anything, so the guest can
      // answer the next question in one message instead of two.
      { id: "types", type: "action", position: at(2), data: { action: "show_room_types" } },
      // Hands over to the built-in booking conversation: slot-filling, live
      // availability, pricing, the "YA" confirmation, and — since this change —
      // the payment link. Everything after this point is owned by that
      // conversation, so no node follows it.
      { id: "book", type: "action", position: at(3), data: { action: "start_booking" } },
    ],
    edges: [
      { id: "e1", source: "t", target: "welcome" },
      { id: "e2", source: "welcome", target: "types" },
      { id: "e3", source: "types", target: "book" },
    ],
  },
};

// ─── 2. Request tamu yang sedang menginap ────────────────────────────────────

const REQUEST_TAMU: FlowTemplate = {
  key: "request_tamu",
  name: "02 Request Tamu (Room Service)",
  description:
    "Khusus tamu yang SUDAH check-in. Menampilkan menu dari kasir/POS hotel, tamu memilih " +
    "lewat chat, pesanan masuk ke antrean Permintaan Tamu dan ditagihkan ke folio kamar.",
  // Includes "menu" — the word every guest types. It only reaches this flow
  // when the guest is actually staying; see the header note.
  triggerKeywords: [
    "menu", "room service", "roomservice", "pesan makan", "pesan makanan",
    "makan", "minum", "lapar", "haus", "laundry", "handuk", "spa",
  ],
  requires: "inhouse",
  priority: 20,
  definition: {
    version: FLOW_VERSION,
    nodes: [
      { id: "t", type: "trigger", data: {}, position: at(0) },
      {
        id: "hello",
        type: "message",
        position: at(1),
        data: {
          text:
            "Halo {{guest_name}} 👋\n" +
            "Kami siap membantu kebutuhan Anda selama menginap di *{{hotel_name}}*.",
        },
      },
      // Takes over: shows the POS menu, collects picks, totals the order, and
      // waits for the "YA" before writing anything.
      { id: "order", type: "action", position: at(2), data: { action: "start_room_service" } },
      // Only reached when the action DECLINES — the stay ended between the
      // keyword gate and here. Without this the guest would get silence.
      {
        id: "notstaying",
        type: "end",
        position: at(3),
        data: {
          text:
            "Mohon maaf, layanan ini khusus untuk tamu yang sedang menginap. " +
            "Bila Anda ingin memesan kamar, ketik *booking* ya.",
        },
      },
    ],
    edges: [
      { id: "e1", source: "t", target: "hello" },
      { id: "e2", source: "hello", target: "order" },
      { id: "e3", source: "order", target: "notstaying" },
    ],
  },
};

// ─── 3. Sapaan + menu utama (jaring pengaman) ────────────────────────────────

const SAPAAN: FlowTemplate = {
  key: "sapaan",
  name: "90 Sapaan & Menu Utama",
  description:
    "Jaring pengaman untuk sapaan umum. Menawarkan pilihan bernomor: pesan kamar, " +
    "lihat kamar & harga, atau bicara dengan staf. Prioritas paling rendah, jadi hanya " +
    "menangkap pesan yang tidak diklaim flow lain.",
  triggerKeywords: [
    "halo", "hallo", "helo", "hai", "hi", "hey", "assalamualaikum",
    "permisi", "pagi", "siang", "sore", "malam",
    // Also listed here so a guest who is NOT staying still gets a useful answer
    // to "menu" instead of silence.
    "menu", "info", "bantuan", "help", "tanya", "mulai", "start",
  ],
  requires: "none",
  priority: 90,
  definition: {
    version: FLOW_VERSION,
    nodes: [
      { id: "t", type: "trigger", data: {}, position: at(0) },
      {
        id: "ask",
        type: "choice",
        position: at(1),
        data: {
          text: "*{{hotel_name}}*\nHalo! Ada yang bisa kami bantu?",
          options: [
            { id: "book", label: "Pesan kamar" },
            { id: "info", label: "Lihat kamar & harga" },
            { id: "cs", label: "Bicara dengan staf" },
          ],
        },
      },
      { id: "book", type: "action", position: at(2, 0), data: { action: "start_booking" } },
      { id: "info", type: "action", position: at(2, 1), data: { action: "show_room_types" } },
      { id: "portal", type: "action", position: at(3, 1), data: { action: "send_portal_link" } },
      {
        id: "infoend",
        type: "end",
        position: at(4, 1),
        data: { text: "Bila ingin memesan, ketik *booking* ya. Terima kasih! 🙏" },
      },
      {
        id: "cs",
        type: "handoff",
        position: at(2, 2),
        data: {
          text:
            "Baik, kami sambungkan dengan staf *{{hotel_name}}*. " +
            "Mohon tunggu sebentar ya 🙏",
        },
      },
    ],
    edges: [
      { id: "e1", source: "t", target: "ask" },
      { id: "e2", source: "ask", target: "book", sourceHandle: "book" },
      { id: "e3", source: "ask", target: "info", sourceHandle: "info" },
      { id: "e4", source: "ask", target: "cs", sourceHandle: "cs" },
      { id: "e5", source: "info", target: "portal" },
      { id: "e6", source: "portal", target: "infoend" },
    ],
  },
};

export const FLOW_TEMPLATES: FlowTemplate[] = [RESERVASI, REQUEST_TAMU, SAPAAN];

export function findTemplate(key: string): FlowTemplate | null {
  return FLOW_TEMPLATES.find((t) => t.key === key) ?? null;
}
