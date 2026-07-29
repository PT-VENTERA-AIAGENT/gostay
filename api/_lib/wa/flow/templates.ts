// Ready-made flows a hotel can install and edit.
//
// A blank canvas is the fastest way to lose someone who has never drawn a
// chatbot. These are a working WhatsApp assistant on their own — install them
// and the hotel answers reservations, takes payment in-chat, serves in-house
// guests, and handles the dozen questions every hotel is asked daily. They are
// also the worked example: every node type and every action appears at least
// once, so editing them is how a hotel learns the vocabulary.
//
// ─── The part that is NOT in Chatly ──────────────────────────────────────────
// Chatly picks a flow from keywords alone. That is not enough here: the SAME
// word must reach different flows depending on whether the guest is actually
// staying. So a flow declares the guest state it needs (`requires`), and
// selection treats an unmet requirement as "no match" and keeps looking:
//
//   guest typed "menu", is checked in      → Request Tamu   (requires inhouse ✓)
//   guest typed "menu", is not checked in  → Sapaan         (inhouse ✗, skipped)
//
// ─── Reading the priority ladder ─────────────────────────────────────────────
// Lower runs first. The ladder is deliberate, not arbitrary:
//
//    10–29  things the guest wants to DO (book, order, request) — these are
//           intents, and an intent should beat a question that happens to share
//           a word with it.
//    30–49  getting a human.
//    50–79  questions with factual answers (price, hours, address, facilities).
//    90     the catch-all greeting, which must lose to everything above or it
//           would swallow words the specific flows own.
//
// A hotel that wants a different resolution changes the numbers in the console;
// nothing here is compiled into the engine.

import { FLOW_VERSION, type ActionType, type FlowDefinition, type FlowNode, type FlowEdge } from "./types";
import type { FlowRequirement } from "./store";

/** Grouping for the console's template picker. Presentation only. */
export type TemplateCategory = "reservasi" | "layanan" | "informasi" | "bantuan" | "sapaan";

export interface FlowTemplate {
  /** Stable id — also the idempotency key when installing. */
  key: string;
  name: string;
  category: TemplateCategory;
  description: string;
  triggerKeywords: string[];
  requires: FlowRequirement;
  priority: number;
  definition: FlowDefinition;
}

// ─── Builders ────────────────────────────────────────────────────────────────
// Most templates are a straight line: say something, maybe run an action, stop.
// Writing each one out node-by-node buried the CONTENT — the words a guest
// reads — in boilerplate, so the shape is expressed once here.

type Step =
  | { say: string }
  | { act: ActionType }
  | { finish: string }
  | { human: string };

/**
 * A linear flow: trigger → step → step → … Each step lands 140px below the last
 * so the canvas opens tidy rather than stacked at the origin.
 */
function linear(steps: Step[]): FlowDefinition {
  const nodes: FlowNode[] = [
    { id: "t", type: "trigger", data: {}, position: { x: 80, y: 80 } },
  ];
  const edges: FlowEdge[] = [];
  let prev = "t";

  steps.forEach((step, i) => {
    const id = `n${i + 1}`;
    const position = { x: 80, y: 80 + (i + 1) * 140 };
    if ("say" in step) {
      nodes.push({ id, type: "message", position, data: { text: step.say } });
    } else if ("act" in step) {
      nodes.push({ id, type: "action", position, data: { action: step.act } });
    } else if ("finish" in step) {
      nodes.push({ id, type: "end", position, data: { text: step.finish } });
    } else {
      nodes.push({ id, type: "handoff", position, data: { text: step.human } });
    }
    edges.push({ id: `e${i + 1}`, source: prev, target: id });
    prev = id;
  });

  return { version: FLOW_VERSION, nodes, edges };
}

// ─── 1. Reservasi kamar, dengan pembayaran di chat ───────────────────────────

const RESERVASI: FlowTemplate = {
  key: "reservasi",
  name: "01 Reservasi Kamar",
  category: "reservasi",
  description:
    "Tamu memesan kamar lewat WhatsApp: bot menanyakan tanggal, jumlah tamu, dan tipe kamar, " +
    "menghitung harga dari ketersediaan asli, lalu mengirim tautan pembayaran di chat yang sama.",
  // Two phrases are deliberately NOT here, both because they are QUESTIONS that
  // this flow would otherwise answer with a five-field form:
  //   "check in"     → "jam check in berapa?" belongs to the Info flow.
  //   "kamar kosong" → "ada kamar kosong?" belongs to Cek Kamar Kosong. This
  //                    one was a real reported bug: the guest asked whether
  //                    anything was free and had to fill in a form to find out.
  triggerKeywords: [
    "booking", "bookingan", "pesan kamar", "pesen kamar", "reservasi",
    "nginap", "menginap", "sewa kamar", "mau nginap", "mau pesan",
  ],
  requires: "none",
  priority: 10,
  definition: linear([
    { say: "Halo! Selamat datang di *{{hotel_name}}* 👋\n\nDengan senang hati kami bantu pemesanan kamar Anda." },
    // Show the real price list before asking anything, so the guest can answer
    // the next question in one message instead of two.
    { act: "show_room_types" },
    // Hands over to the built-in booking conversation. Everything after this is
    // owned by that conversation, so no node follows it.
    { act: "start_booking" },
  ]),
};

// ─── 2. Request tamu yang sedang menginap ────────────────────────────────────

const REQUEST_TAMU: FlowTemplate = {
  key: "request_tamu",
  name: "02 Request Tamu (Room Service)",
  category: "layanan",
  description:
    "Khusus tamu yang SUDAH check-in. Menampilkan menu dari kasir/POS hotel, tamu memilih " +
    "lewat chat, pesanan masuk ke antrean Permintaan Tamu dan ditagihkan ke folio kamar.",
  triggerKeywords: [
    "menu", "room service", "roomservice", "pesan makan", "pesan makanan",
    "makan", "minum", "lapar", "haus", "sarapan",
  ],
  requires: "inhouse",
  priority: 20,
  definition: {
    version: FLOW_VERSION,
    nodes: [
      { id: "t", type: "trigger", data: {}, position: { x: 80, y: 80 } },
      {
        id: "hello", type: "message", position: { x: 80, y: 220 },
        data: { text: "Halo {{guest_name}} 👋\nKami siap membantu kebutuhan Anda selama menginap di *{{hotel_name}}*." },
      },
      { id: "order", type: "action", position: { x: 80, y: 360 }, data: { action: "start_room_service" } },
      // Only reached when the action DECLINES — the stay ended between the
      // keyword gate and here. Without this the guest gets silence.
      {
        id: "notstaying", type: "end", position: { x: 80, y: 500 },
        data: {
          text: "Mohon maaf, layanan ini khusus untuk tamu yang sedang menginap. " +
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

// ─── 3. Housekeeping & laundry (tamu menginap) ───────────────────────────────

const HOUSEKEEPING: FlowTemplate = {
  key: "housekeeping",
  name: "03 Housekeeping & Laundry",
  category: "layanan",
  description:
    "Permintaan non-makanan dari tamu yang menginap: handuk, bersih-bersih kamar, laundry, " +
    "perlengkapan mandi. Ditanyakan detailnya, lalu diteruskan ke staf.",
  triggerKeywords: [
    "handuk", "laundry", "cuci baju", "cuci pakaian", "bersihkan kamar",
    "housekeeping", "sabun", "sampo", "tisu", "selimut", "bantal", "ganti sprei",
  ],
  requires: "inhouse",
  priority: 25,
  definition: {
    version: FLOW_VERSION,
    nodes: [
      { id: "t", type: "trigger", data: {}, position: { x: 80, y: 80 } },
      {
        id: "ask", type: "ask", position: { x: 80, y: 220 },
        data: {
          prompt: "Baik {{guest_name}}, kami bantu ya. Mohon tuliskan detail permintaan Anda " +
            "(misalnya: 2 handuk, atau laundry 3 potong).",
          variable: "permintaan",
        },
      },
      {
        id: "done", type: "end", position: { x: 80, y: 360 },
        data: {
          text: "Terima kasih. Permintaan Anda — _{{permintaan}}_ — sudah kami teruskan ke petugas. " +
            "Mohon ditunggu ya 🙏",
        },
      },
    ],
    edges: [
      { id: "e1", source: "t", target: "ask" },
      { id: "e2", source: "ask", target: "done" },
    ],
  },
};

// ─── 4. Keluhan ──────────────────────────────────────────────────────────────

const KELUHAN: FlowTemplate = {
  key: "keluhan",
  name: "04 Keluhan & Kendala",
  category: "bantuan",
  description:
    "Menangkap keluhan (AC rusak, kamar kotor, air mati) dengan sopan, menanyakan detailnya, " +
    "lalu langsung mengalihkan ke staf. Tidak dijawab bot — keluhan butuh manusia.",
  triggerKeywords: [
    "komplain", "keluhan", "rusak", "mati", "bocor", "kotor", "bau",
    "tidak berfungsi", "gak berfungsi", "kecewa", "protes",
  ],
  requires: "none",
  priority: 30,
  definition: {
    version: FLOW_VERSION,
    nodes: [
      { id: "t", type: "trigger", data: {}, position: { x: 80, y: 80 } },
      {
        id: "ask", type: "ask", position: { x: 80, y: 220 },
        data: {
          prompt: "Mohon maaf atas ketidaknyamanannya 🙏\n\n" +
            "Boleh dijelaskan kendalanya agar dapat segera kami tangani?",
          variable: "keluhan",
        },
      },
      // Straight to a human: an unhappy guest answered by a bot gets unhappier.
      {
        id: "staff", type: "handoff", position: { x: 80, y: 360 },
        data: {
          text: "Terima kasih sudah menyampaikan. Keluhan Anda — _{{keluhan}}_ — kami teruskan " +
            "ke staf *{{hotel_name}}* sekarang juga. Mohon tunggu sebentar ya.",
        },
      },
    ],
    edges: [
      { id: "e1", source: "t", target: "ask" },
      { id: "e2", source: "ask", target: "staff" },
    ],
  },
};

// ─── 5. Bicara dengan staf ───────────────────────────────────────────────────

const STAF: FlowTemplate = {
  key: "staf",
  name: "05 Bicara dengan Staf",
  category: "bantuan",
  description:
    "Jalan pintas ke manusia. Tamu yang mengetik 'admin' atau 'cs' langsung dialihkan " +
    "tanpa melewati pertanyaan bot apa pun.",
  triggerKeywords: [
    "admin", "cs", "customer service", "staf", "staff", "operator",
    "manusia", "orangnya", "bicara dengan", "resepsionis",
  ],
  requires: "none",
  priority: 40,
  definition: linear([
    {
      human: "Baik, kami sambungkan dengan staf *{{hotel_name}}*. Mohon tunggu sebentar ya 🙏",
    },
  ]),
};

// ─── 6. Cek harga & ketersediaan ─────────────────────────────────────────────

const HARGA: FlowTemplate = {
  key: "harga",
  name: "07 Cek Harga & Tarif",
  category: "informasi",
  description:
    "Menjawab 'berapa harganya?' dengan daftar tipe kamar dan tarif per malam yang asli, " +
    "lalu menawarkan untuk lanjut memesan. Lebih ringan daripada alur reservasi penuh.",
  // NOT a bare "berapa": it is a generic question word that also appears in
  // "jam berapa check in", "berapa orang", "berapa lama" — and this flow
  // outranks the info ones, so a loose match here silently swallows them.
  triggerKeywords: [
    "harga", "harganya", "tarif", "biaya", "price", "rate",
    "berapa harga", "berapa tarif", "list harga", "daftar harga",
  ],
  requires: "none",
  priority: 50,
  definition: {
    version: FLOW_VERSION,
    nodes: [
      { id: "t", type: "trigger", data: {}, position: { x: 80, y: 80 } },
      { id: "types", type: "action", position: { x: 80, y: 220 }, data: { action: "show_room_types" } },
      {
        id: "next", type: "choice", position: { x: 80, y: 360 },
        data: {
          text: "Apakah ada yang ingin dipesan?",
          options: [
            { id: "book", label: "Ya, mau pesan" },
            { id: "later", label: "Nanti dulu" },
          ],
        },
      },
      { id: "book", type: "action", position: { x: 80, y: 500 }, data: { action: "start_booking" } },
      {
        id: "later", type: "end", position: { x: 400, y: 500 },
        data: { text: "Baik, silakan hubungi kami kapan saja. Terima kasih! 🙏" },
      },
    ],
    edges: [
      { id: "e1", source: "t", target: "types" },
      { id: "e2", source: "types", target: "next" },
      { id: "e3", source: "next", target: "book", sourceHandle: "book" },
      { id: "e4", source: "next", target: "later", sourceHandle: "later" },
    ],
  },
};


// ─── 13. Cek kamar kosong ────────────────────────────────────────────────────

const KETERSEDIAAN: FlowTemplate = {
  key: "ketersediaan",
  name: "06 Cek Kamar Kosong",
  category: "informasi",
  description:
    "Menjawab “ada kamar kosong?” dengan jumlah kamar yang benar-benar tersedia per tipe, " +
    "dibaca dari booking asli. Menyebut jumlah dan tarif saja — tidak pernah nomor kamar yang " +
    "terisi atau siapa yang menginap.",
  triggerKeywords: [
    "kamar kosong", "masih ada kamar", "ada kamar", "kamar tersedia",
    "ketersediaan", "masih kosong", "ada yang kosong", "sisa kamar",
  ],
  requires: "none",
  // Above the price flow: a guest asking what is FREE wants availability, and
  // the answer already includes the rate — so this satisfies both questions.
  priority: 45,
  definition: linear([
    { act: "check_availability" },
  ]),
};

// ─── 7. Info check-in & check-out ────────────────────────────────────────────

const CHECKIN_INFO: FlowTemplate = {
  key: "checkin_info",
  name: "08 Info Check-in & Check-out",
  category: "informasi",
  description:
    "Jam check-in dan check-out, syarat identitas, dan deposit. Ubah teksnya sesuai " +
    "kebijakan hotel Anda — ini template, bukan aturan sistem.",
  // NOT a bare "jam berapa". It is a generic question word that belongs to
  // whatever noun follows it — "sarapan jam berapa" is a breakfast question and
  // was landing here, answering with check-in times. Same lesson as "berapa" on
  // the price flow: a broad keyword on a high-priority flow silently swallows
  // the specific ones below it.
  triggerKeywords: [
    "check in", "checkin", "check out", "checkout",
    "jam check", "jam masuk", "deposit", "syarat", "ktp", "bawa apa",
  ],
  requires: "none",
  priority: 55,
  definition: linear([
    {
      say: "*Check-in & Check-out — {{hotel_name}}*\n\n" +
        "🕐 Check-in mulai pukul *14.00*\n" +
        "🕛 Check-out paling lambat pukul *12.00*\n\n" +
        "Mohon membawa *KTP/identitas asli* saat check-in.\n" +
        "Check-in lebih awal atau check-out lebih lambat dapat kami usahakan " +
        "sesuai ketersediaan kamar.",
    },
    { finish: "Ada lagi yang dapat kami bantu? Ketik *menu* untuk pilihan lainnya." },
  ]),
};

// ─── 8. Lokasi & arah ────────────────────────────────────────────────────────

const LOKASI: FlowTemplate = {
  key: "lokasi",
  name: "09 Lokasi & Arah",
  category: "informasi",
  description:
    "Alamat, patokan, dan pilihan transportasi. Ganti alamat contoh di bawah dengan " +
    "alamat hotel Anda sebelum mengaktifkan.",
  triggerKeywords: [
    "lokasi", "alamat", "dimana", "di mana", "maps", "google maps",
    "arah", "patokan", "jalan ke", "rute",
  ],
  requires: "none",
  priority: 60,
  definition: linear([
    {
      say: "*Lokasi {{hotel_name}}*\n\n" +
        "📍 _Isi alamat lengkap hotel Anda di sini_\n\n" +
        "Patokan: _isi patokan terdekat_\n" +
        "Google Maps: _tempel tautan Maps di sini_\n\n" +
        "Tersedia parkir untuk mobil dan motor.",
    },
    { finish: "Sampai jumpa di {{hotel_name}}! 🙏" },
  ]),
};

// ─── 9. Fasilitas ────────────────────────────────────────────────────────────

const FASILITAS: FlowTemplate = {
  key: "fasilitas",
  name: "10 Fasilitas Hotel",
  category: "informasi",
  description:
    "Wifi, sarapan, parkir, AC, air panas — pertanyaan yang paling sering masuk sebelum " +
    "tamu memutuskan memesan. Sesuaikan daftarnya dengan fasilitas Anda.",
  triggerKeywords: [
    "fasilitas", "wifi", "wi-fi", "internet", "parkir", "ac",
    "air panas", "kolam", "kolam renang", "mushola", "musholla", "tv",
  ],
  requires: "none",
  priority: 65,
  definition: linear([
    {
      say: "*Fasilitas {{hotel_name}}*\n\n" +
        "✅ Wifi gratis di seluruh area\n" +
        "✅ Parkir mobil & motor\n" +
        "✅ Air panas\n" +
        "✅ Sarapan _(sesuai tipe kamar)_\n" +
        "✅ Resepsionis 24 jam\n\n" +
        "_Sesuaikan daftar ini dengan fasilitas hotel Anda._",
    },
    { finish: "Ingin melihat pilihan kamar? Ketik *harga* ya." },
  ]),
};

// ─── 10. Pembatalan & refund ─────────────────────────────────────────────────

const PEMBATALAN: FlowTemplate = {
  key: "pembatalan",
  name: "11 Pembatalan & Refund",
  category: "bantuan",
  description:
    "Menjelaskan kebijakan pembatalan lalu mengalihkan ke staf, karena refund menyangkut " +
    "uang dan tidak boleh diputuskan bot. Sesuaikan kebijakannya dengan aturan Anda.",
  // "batal" is intentionally absent: it is the word a guest uses to back out of
  // a pending quote, and the built-in conversation must keep owning it.
  triggerKeywords: [
    "pembatalan", "batalkan pesanan", "refund", "uang kembali",
    "reschedule", "ganti tanggal", "pindah tanggal",
  ],
  requires: "none",
  priority: 70,
  definition: linear([
    {
      say: "*Kebijakan Pembatalan — {{hotel_name}}*\n\n" +
        "• Pembatalan *H-3* sebelum check-in: refund penuh\n" +
        "• Pembatalan *H-1*: refund 50%\n" +
        "• Pembatalan di hari-H atau tidak hadir: tidak ada refund\n\n" +
        "_Sesuaikan kebijakan ini dengan aturan hotel Anda._",
    },
    // Money decisions need a human.
    {
      human: "Untuk memproses pembatalan atau perubahan tanggal, staf kami akan membantu " +
        "langsung. Mohon tunggu sebentar ya 🙏",
    },
  ]),
};

// ─── 11. Ulasan & masukan ────────────────────────────────────────────────────

const ULASAN: FlowTemplate = {
  key: "ulasan",
  name: "12 Ulasan & Masukan",
  category: "bantuan",
  description:
    "Meminta masukan tamu dan meneruskannya ke staf. Cocok dipakai setelah tamu check-out — " +
    "ubah kata pemicunya bila ingin dikirim manual oleh staf.",
  triggerKeywords: [
    "ulasan", "review", "masukan", "saran", "feedback", "kritik", "penilaian",
  ],
  requires: "none",
  priority: 75,
  definition: {
    version: FLOW_VERSION,
    nodes: [
      { id: "t", type: "trigger", data: {}, position: { x: 80, y: 80 } },
      {
        id: "rate", type: "choice", position: { x: 80, y: 220 },
        data: {
          text: "Terima kasih sudah menginap di *{{hotel_name}}* 🙏\n\nBagaimana pengalaman Anda?",
          options: [
            { id: "baik", label: "Puas 😊" },
            { id: "biasa", label: "Biasa saja 😐" },
            { id: "kurang", label: "Kurang puas 😞" },
          ],
        },
      },
      {
        id: "tanya", type: "ask", position: { x: 80, y: 400 },
        data: { prompt: "Boleh dibagikan alasannya? Masukan Anda sangat membantu kami.", variable: "masukan" },
      },
      {
        id: "terima", type: "end", position: { x: 80, y: 540 },
        data: { text: "Terima kasih banyak atas masukannya 🙏 Kami catat: _{{masukan}}_\n\nSemoga bertemu lagi!" },
      },
      // An unhappy guest goes to a human, not to a thank-you note.
      {
        id: "maaf", type: "handoff", position: { x: 440, y: 400 },
        data: {
          text: "Mohon maaf atas pengalaman yang kurang menyenangkan 🙏 " +
            "Staf kami akan menghubungi Anda untuk menindaklanjuti.",
        },
      },
    ],
    edges: [
      { id: "e1", source: "t", target: "rate" },
      { id: "e2", source: "rate", target: "tanya", sourceHandle: "baik" },
      { id: "e3", source: "rate", target: "tanya", sourceHandle: "biasa" },
      { id: "e4", source: "rate", target: "maaf", sourceHandle: "kurang" },
      { id: "e5", source: "tanya", target: "terima" },
    ],
  },
};


// ─── 14. Tanya apa saja (AI, berpijak pada data) ─────────────────────────────

const TANYA_AI: FlowTemplate = {
  key: "tanya_ai",
  name: "80 Tanya Apa Saja (AI)",
  category: "informasi",
  description:
    "Menjawab pertanyaan bebas memakai data asli hotel: ketersediaan kamar pada tanggal " +
    "tertentu, tarif, dan informasi yang staf tulis di Basis Pengetahuan. Bila tidak ada " +
    "yang mencakupnya, AI mengatakan belum tahu dan menawarkan staf — tidak mengarang.",
  // Question words, not statements. Placed just above the greeting so every
  // specific flow still wins; this is the net that catches what they miss.
  triggerKeywords: [
    "apakah", "apa itu", "bagaimana", "gimana", "bisakah", "boleh tidak",
    "boleh gak", "tanya dong", "mau tanya", "izin bertanya",
  ],
  requires: "none",
  priority: 80,
  definition: linear([
    { act: "ask_concierge" },
  ]),
};

// ─── 12. Sapaan + menu utama (jaring pengaman) ───────────────────────────────

const SAPAAN: FlowTemplate = {
  key: "sapaan",
  name: "90 Sapaan & Menu Utama",
  category: "sapaan",
  description:
    "Jaring pengaman untuk sapaan umum. Menawarkan pilihan bernomor: pesan kamar, " +
    "lihat kamar & harga, atau bicara dengan staf. Prioritas paling rendah, jadi hanya " +
    "menangkap pesan yang tidak diklaim flow lain.",
  triggerKeywords: [
    "halo", "hallo", "helo", "hai", "hi", "hey", "assalamualaikum",
    "permisi", "pagi", "siang", "sore", "malam",
    // "menu" is deliberately NOT here — it belongs to Request Tamu (priority
    // 20), which wins it either way. A guest who has not checked in is now told
    // that room service needs a check-in, and how to get one; before, this flow
    // caught the word and answered a food request with a welcome message.
    "info", "bantuan", "help", "tanya", "mulai", "start",
  ],
  requires: "none",
  priority: 90,
  definition: {
    version: FLOW_VERSION,
    nodes: [
      { id: "t", type: "trigger", data: {}, position: { x: 80, y: 80 } },
      {
        id: "ask", type: "choice", position: { x: 80, y: 220 },
        data: {
          text: "*{{hotel_name}}*\nHalo! Ada yang bisa kami bantu?",
          options: [
            { id: "book", label: "Pesan kamar" },
            { id: "info", label: "Lihat kamar & harga" },
            { id: "cs", label: "Bicara dengan staf" },
          ],
        },
      },
      { id: "book", type: "action", position: { x: 80, y: 400 }, data: { action: "start_booking" } },
      { id: "info", type: "action", position: { x: 400, y: 400 }, data: { action: "show_room_types" } },
      { id: "portal", type: "action", position: { x: 400, y: 540 }, data: { action: "send_portal_link" } },
      {
        id: "infoend", type: "end", position: { x: 400, y: 680 },
        data: { text: "Bila ingin memesan, ketik *booking* ya. Terima kasih! 🙏" },
      },
      {
        id: "cs", type: "handoff", position: { x: 720, y: 400 },
        data: { text: "Baik, kami sambungkan dengan staf *{{hotel_name}}*. Mohon tunggu sebentar ya 🙏" },
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

export const FLOW_TEMPLATES: FlowTemplate[] = [
  RESERVASI,
  REQUEST_TAMU,
  HOUSEKEEPING,
  KELUHAN,
  STAF,
  KETERSEDIAAN,
  HARGA,
  CHECKIN_INFO,
  LOKASI,
  FASILITAS,
  PEMBATALAN,
  ULASAN,
  TANYA_AI,
  SAPAAN,
];

export const CATEGORY_META: Record<TemplateCategory, { label: string; hint: string }> = {
  reservasi: { label: "Reservasi", hint: "Memesan kamar dan pembayaran." },
  layanan:   { label: "Layanan Tamu", hint: "Khusus tamu yang sedang menginap." },
  informasi: { label: "Informasi", hint: "Pertanyaan yang sering masuk sebelum memesan." },
  bantuan:   { label: "Bantuan & Staf", hint: "Keluhan, pembatalan, dan jalan ke manusia." },
  sapaan:    { label: "Sapaan", hint: "Jaring pengaman untuk pesan pembuka." },
};

export const CATEGORY_ORDER: TemplateCategory[] = [
  "reservasi", "layanan", "informasi", "bantuan", "sapaan",
];

export function findTemplate(key: string): FlowTemplate | null {
  return FLOW_TEMPLATES.find((t) => t.key === key) ?? null;
}
