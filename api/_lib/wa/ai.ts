// WhatsApp booking-intent extraction.
//
// Lives under api/_lib so Vercel treats it as a helper, not a route. It is the
// one piece of Fase 5 that talks to the model: given a guest's free-text WA
// message (and whatever slots earlier turns already filled), it returns a
// structured BookingIntent the webhook can act on.
//
// House pattern (mirrors api/_lib/exchange.ts and provision.ts):
//   - env is read lazily inside config(), never at module scope, because the
//     Vite dev middleware only populates process.env after import time;
//   - the OpenAI key is OPENAI_API_KEY, deliberately WITHOUT a VITE_ prefix so
//     it can never be inlined into the browser bundle.
//
// It never throws: on a missing key, a network failure, or unparseable model
// output it falls back to a deterministic regex/keyword extractor, so the caller
// always gets a valid BookingIntent to reason about.

export interface BookingSlots {
  check_in: string | null;
  check_out: string | null;
  guests: number | null;
  room_type_hint: string | null;
  guest_name: string | null;
}

export interface BookingIntent extends BookingSlots {
  intent: "book" | "chat" | "other";
  confidence: number;
}

// The one endpoint we call. Overridable via env only so the test suite can point
// it at a local mock server (same trick as SSO_ISSUER in exchange.ts); in
// production it is always this constant.
const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = "gpt-4o-mini";

// Read lazily, never at module scope — see the file header.
function config() {
  return {
    apiKey: process.env.OPENAI_API_KEY,
    endpoint: process.env.OPENAI_API_URL ?? OPENAI_CHAT_COMPLETIONS_URL,
  };
}

/**
 * Extract a booking intent + slots from a guest's WhatsApp message.
 *
 * `known` carries slots already collected in earlier turns; they are fed to the
 * model as context and merged into the result, so a multi-turn conversation
 * accumulates rather than forgetting what the guest already said.
 *
 * Always resolves — never rejects. Without OPENAI_API_KEY, or when the API call
 * or its JSON parse fails, a deterministic fallback fills in what it can.
 */
export async function extractBookingIntent(
  text: string,
  known?: Partial<BookingSlots>,
): Promise<BookingIntent> {
  const knownSlots = normaliseKnown(known);
  const message = (text ?? "").trim();

  const { apiKey, endpoint } = config();

  if (apiKey) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          temperature: 0.1,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt(knownSlots) },
            { role: "user", content: message },
          ],
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const raw = data.choices?.[0]?.message?.content ?? "";
        const parsed = parseModelJson(raw);
        if (parsed) return mergeIntent(coerceIntent(parsed), knownSlots);
      } else {
        console.error(`[wa/ai] OpenAI extract failed: HTTP ${res.status}`);
      }
    } catch (e) {
      console.error(`[wa/ai] OpenAI extract exception: ${(e as Error).message}`);
    }
  }

  // No key, non-2xx, or unparseable output all land here.
  return mergeIntent(fallbackExtract(message), knownSlots);
}

// ── Room-service intent (deterministic, no model) ───────────────────────────────

// Phrases that mark a guest asking for room service (food/drinks/amenities) rather
// than a room booking. Matched as case-insensitive substrings — a keyword check is
// deliberately enough here (no OpenAI round-trip), because the room-service branch
// only proceeds once the guest is confirmed in-house anyway.
const ROOM_SERVICE_HINTS = [
  "room service",
  "roomservice",
  "pesan makan",
  "pesan minum",
  "order makan",
  "mau makan",
  "mau minum",
  "makanan",
  "minuman",
  "makan",
  "minum",
  "lapar",
  "haus",
  "laundry",
  "cuci baju",
  "cuci pakaian",
  "spa",
];

/**
 * True when the message reads as a room-service request. Deterministic and
 * synchronous — never calls the model. The caller still gates the flow on the
 * guest actually being in-house, so a loose match here is harmless.
 */
export function detectRoomServiceIntent(text: string): boolean {
  const lower = (text ?? "").toLowerCase();
  return ROOM_SERVICE_HINTS.some((h) => lower.includes(h));
}

// ── Prompt ────────────────────────────────────────────────────────────────────

function systemPrompt(known: BookingSlots): string {
  const today = new Date().toISOString().slice(0, 10);
  const context = JSON.stringify(known);
  return `Kamu asisten reservasi hotel via WhatsApp. Tugasmu mengekstrak niat dan detail booking dari pesan tamu (Bahasa Indonesia atau Inggris).

Kembalikan HANYA satu objek JSON valid, tanpa markdown, dengan bentuk PERSIS:
{"intent":"book"|"chat"|"other","check_in":"YYYY-MM-DD"|null,"check_out":"YYYY-MM-DD"|null,"guests":<integer>|null,"room_type_hint":"<string>"|null,"guest_name":"<string>"|null,"confidence":<number 0..1>}

ATURAN:
- intent: "book" bila tamu ingin memesan/menanyakan ketersediaan kamar; "chat" untuk sapaan/obrolan biasa; "other" bila di luar konteks reservasi.
- check_in / check_out: tanggal format "YYYY-MM-DD". Hari ini adalah ${today}; asumsikan tahun berjalan bila tamu tidak menyebut tahun. null bila tidak disebut. Untuk rentang seperti "20-22 juli", check_in="…-07-20" dan check_out="…-07-22".
- guests: jumlah tamu sebagai bilangan bulat (mis. "2 orang" -> 2). null bila tidak disebut.
- room_type_hint: kata TIPE kamar (mis. "deluxe", "suite", "standard", "family"). null bila tidak disebut. JANGAN ambil NOMOR kamar sebagai tipe — "kamar 101" / "no 101" itu nomor kamar (bukan tipe), set null.
- guest_name: NAMA pemesan bila disebut ("atas nama Budi", "a/n Budi", "an. Budi", "nama saya Budi", "untuk Budi"). null bila tidak disebut. JANGAN mengarang nama; jangan ambil tipe kamar/angka sebagai nama.
- confidence: keyakinanmu 0..1.

Slot yang sudah terkumpul dari percakapan sebelumnya (pertahankan bila tamu tidak mengubahnya): ${context}

LANJUTAN: bila slot di atas SUDAH ada isinya dan pesan tamu berupa angka/tanggal singkat, itu jawaban untuk slot yang MASIH kosong — set intent="book" dan isi slot itu. Contoh: check_in sudah "2026-07-21", tamu kirim "23" → check_out="2026-07-23" (bulan & tahun sama). Angka setelah ditanya jumlah tamu → guests. Bila HANYA nama yang masih kosong dan tamu mengirim sebuah nama (mis. "Budi Santoso"), isi guest_name dengan teks itu.

Kembalikan HANYA objek JSON tersebut.`;
}

// ── Parsing / coercion ─────────────────────────────────────────────────────────

/** Strip code fences and parse; returns null on any failure. */
function parseModelJson(raw: string): Record<string, unknown> | null {
  const cleaned = raw
    .replace(/```json\s*/gi, "")
    .replace(/```/g, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    const obj = JSON.parse(cleaned.slice(start, end + 1));
    return obj && typeof obj === "object" ? (obj as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Coerce arbitrary parsed JSON into a well-formed BookingIntent. */
function coerceIntent(parsed: Record<string, unknown>): BookingIntent {
  const intent =
    parsed.intent === "book" || parsed.intent === "chat" || parsed.intent === "other"
      ? parsed.intent
      : "chat";

  const guestsNum =
    typeof parsed.guests === "number"
      ? Math.trunc(parsed.guests)
      : typeof parsed.guests === "string" && /^\d+$/.test(parsed.guests.trim())
        ? parseInt(parsed.guests, 10)
        : null;

  let confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.5;
  if (!isFinite(confidence)) confidence = 0.5;
  confidence = Math.min(1, Math.max(0, confidence));

  return {
    intent,
    check_in: isoOrNull(parsed.check_in),
    check_out: isoOrNull(parsed.check_out),
    guests: guestsNum !== null && guestsNum > 0 ? guestsNum : null,
    room_type_hint:
      typeof parsed.room_type_hint === "string" && parsed.room_type_hint.trim()
        ? parsed.room_type_hint.trim()
        : null,
    guest_name:
      typeof parsed.guest_name === "string" && parsed.guest_name.trim()
        ? parsed.guest_name.trim()
        : null,
    confidence,
  };
}

/**
 * Accept a string ONLY if it is a real calendar date in YYYY-MM-DD form. The
 * format check alone is not enough: "2026-07-34" and "2026-02-30" both match the
 * shape but aren't real days, and letting them through made the bot query
 * availability with a bogus date and answer "penuh" instead of flagging the date.
 * A round-trip through Date rejects any day that rolled over into another month.
 */
function isoOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = ISO_DATE.exec(v.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return v.trim();
}

// ── Merge with previously-collected slots ───────────────────────────────────────

function normaliseKnown(known?: Partial<BookingSlots>): BookingSlots {
  return {
    check_in: isoOrNull(known?.check_in),
    check_out: isoOrNull(known?.check_out),
    guests:
      typeof known?.guests === "number" && known.guests > 0
        ? Math.trunc(known.guests)
        : null,
    room_type_hint:
      typeof known?.room_type_hint === "string" && known.room_type_hint.trim()
        ? known.room_type_hint.trim()
        : null,
    guest_name:
      typeof known?.guest_name === "string" && known.guest_name.trim()
        ? known.guest_name.trim()
        : null,
  };
}

/**
 * A freshly-extracted non-null slot wins; otherwise the value carried in from an
 * earlier turn is preserved. Multi-turn collection therefore only ever adds
 * information, never drops it.
 */
function mergeIntent(fresh: BookingIntent, known: BookingSlots): BookingIntent {
  return {
    intent: fresh.intent,
    confidence: fresh.confidence,
    check_in: fresh.check_in ?? known.check_in,
    check_out: fresh.check_out ?? known.check_out,
    guests: fresh.guests ?? known.guests,
    room_type_hint: fresh.room_type_hint ?? known.room_type_hint,
    guest_name: fresh.guest_name ?? known.guest_name,
  };
}

// ── Deterministic fallback ──────────────────────────────────────────────────────

const ID_MONTHS: Record<string, number> = {
  januari: 1, jan: 1,
  februari: 2, feb: 2, pebruari: 2,
  maret: 3, mar: 3,
  april: 4, apr: 4,
  mei: 5,
  juni: 6, jun: 6,
  juli: 7, jul: 7,
  agustus: 8, agu: 8, agt: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  oktober: 10, okt: 10, oct: 10,
  november: 11, nov: 11, nop: 11,
  desember: 12, des: 12, dec: 12,
};

const ROOM_HINTS = ["presidential", "deluxe", "superior", "suite", "standard", "standar", "family", "executive", "eksekutif"];

/**
 * Regex/keyword extractor used whenever the model is unavailable. It recognises
 * ISO dates, Indonesian "20-22 juli" ranges, digit guest counts ("2 orang" /
 * "2 tamu"), and common room-type keywords. Confidence stays low (0.3) — it is a
 * best-effort floor, not a substitute for the model.
 */
function fallbackExtract(text: string): BookingIntent {
  const lower = text.toLowerCase();

  const { check_in, check_out } = extractDates(lower);
  const guests = extractGuests(lower);
  const room_type_hint = ROOM_HINTS.find((h) => lower.includes(h)) ?? null;
  const guest_name = extractName(text);

  const hasDate = Boolean(check_in || check_out);
  const intent: BookingIntent["intent"] = hasDate || room_type_hint || guest_name ? "book" : "chat";

  return {
    intent,
    check_in,
    check_out,
    guests,
    // Normalise the Indonesian "standar" spelling to the keyword staff expect.
    room_type_hint: room_type_hint === "standar" ? "standard" : room_type_hint,
    guest_name,
    confidence: 0.3,
  };
}

/**
 * "atas nama Budi", "a/n Budi Santoso", "a.n Budi", "nama saya Budi".
 * The abbreviation must carry a separator (a/n, a.n) so a bare "an" inside a
 * word (e.g. "makan") can never be mistaken for a name marker.
 */
function extractName(text: string): string | null {
  const m = text.match(/(?:atas\s+nama|\ba[./]n\b|\bnama(?:\s+saya)?)\s*:?\s*([A-Za-z][A-Za-z .'-]{1,49})/i);
  const name = m?.[1]?.trim().replace(/[.,]+$/, "");
  return name ? name : null;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function currentYear(): number {
  return new Date().getFullYear();
}

/** Extract check-in/check-out from ISO dates or Indonesian date phrases. */
function extractDates(lower: string): { check_in: string | null; check_out: string | null } {
  // 1. Explicit ISO dates take precedence: "2026-07-20 sampai 2026-07-22".
  const iso = lower.match(/\d{4}-\d{2}-\d{2}/g);
  if (iso && iso.length >= 1) {
    return { check_in: iso[0], check_out: iso[1] ?? null };
  }

  // 2. Day-range + month: "20-22 juli", "20 - 22 juli 2026".
  const range = lower.match(
    /\b(\d{1,2})\s*(?:-|–|s\/d|sampai|sd|hingga|s\.d\.?)\s*(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?/,
  );
  if (range) {
    const month = ID_MONTHS[range[3]];
    if (month) {
      const d1 = parseInt(range[1], 10);
      const d2 = parseInt(range[2], 10);
      const year = range[4] ? parseInt(range[4], 10) : currentYear();
      if (validDay(d1) && validDay(d2)) {
        return {
          check_in: `${year}-${pad(month)}-${pad(d1)}`,
          check_out: `${year}-${pad(month)}-${pad(d2)}`,
        };
      }
    }
  }

  // 3. Single "20 juli" -> check-in only.
  const single = lower.match(/\b(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?/);
  if (single) {
    const month = ID_MONTHS[single[2]];
    const d1 = parseInt(single[1], 10);
    if (month && validDay(d1)) {
      const year = single[3] ? parseInt(single[3], 10) : currentYear();
      return { check_in: `${year}-${pad(month)}-${pad(d1)}`, check_out: null };
    }
  }

  return { check_in: null, check_out: null };
}

function validDay(d: number): boolean {
  return d >= 1 && d <= 31;
}

/** "2 orang", "2 tamu", "utk 3 pax". */
function extractGuests(lower: string): number | null {
  const m = lower.match(/(\d{1,2})\s*(orang|tamu|pax|guest|guests|dewasa|people)/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n > 0) return n;
  }
  return null;
}
