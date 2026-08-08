// The grounded assistant: answers a guest's free-text question using TOOLS that
// read the hotel's real data, and refuses when the tools do not cover it.
//
// ─── Why tools and not a bigger prompt ───────────────────────────────────────
// A model asked "ada kamar kosong tanggal 5 Agustus?" with no way to look will
// not say it cannot know. It answers plausibly, and it answers DIFFERENTLY next
// time — two guests, two answers, both confident, one of them wrong. Stuffing
// today's availability into the prompt does not fix it either, because the
// question names a date nobody predicted.
//
// So the model gets no facts up front. It gets four read-only tools and an
// instruction that its entire answer must come from what they return. That is
// what makes the reply both correct and STABLE: the same question hits the same
// tool with the same arguments and gets the same rows.
//
// ─── The guardrail, in three layers ──────────────────────────────────────────
//   1. The tools cannot leak. `cek_ketersediaan` returns counts (availability.ts
//      keeps no room rows); the knowledge tool returns text a human wrote. There
//      is no tool that reads bookings, guests, phone numbers or revenue, so no
//      prompt can talk the model into producing them — the data is not in reach.
//   2. The instruction forbids inventing, and requires an explicit "I don't
//      know, shall I connect you to staff?" when the tools come back empty.
//   3. The output is scanned before it is sent. Anything shaped like a phone
//      number, an email, or a booking reference means something went wrong
//      upstream, and the reply is replaced rather than delivered.
//   4. The FIGURES in the answer are checked against what the tools actually
//      returned (./number-guard). Layers 1–3 never looked at them, so a model
//      that read "Deluxe Rp450.000" and wrote "Rp420.000" passed every check.
//      A rate, a night count or a room count the tools did not produce is the
//      same class of failure as a leaked phone number, and gets the same
//      treatment: replaced, not delivered.
//
// Layer 1 is the one that actually holds. The others are for the day someone
// adds a FIFTH tool without reading this comment.

import { checkAvailability, renderAvailability, todayJakarta } from "./availability";
import { findKnowledge } from "./knowledge";
import { isoOrNull } from "./ai";
import { listRoomTypes } from "./booking";
import { groundedNumbers, ungroundedNumbers } from "./number-guard";
import { recordAiReply, type AiReplyStatus } from "./ai-log";
import { chatCompletion, hasChatProvider, type ChatToolCall } from "../ai/chat";

/** Bounded so a confused model cannot loop the webhook into a timeout. */
const MAX_TOOL_ROUNDS = 3;

// ─── Tool definitions ────────────────────────────────────────────────────────
// Descriptions are written for the MODEL, not for us: they say when to call the
// tool, because a tool the model never calls is the same as no tool at all.

const TOOLS = [
  {
    type: "function",
    function: {
      name: "cek_ketersediaan",
      description:
        "Cek berapa kamar yang benar-benar kosong pada rentang tanggal tertentu. " +
        "WAJIB dipanggil untuk setiap pertanyaan tentang kamar kosong, ketersediaan, " +
        "atau apakah bisa menginap pada tanggal tertentu. Jangan pernah menjawab " +
        "ketersediaan tanpa memanggil tool ini.",
      parameters: {
        type: "object",
        properties: {
          check_in: {
            type: "string",
            description: "Tanggal check-in, format YYYY-MM-DD. Kosongkan untuk malam ini.",
          },
          check_out: {
            type: "string",
            description: "Tanggal check-out, format YYYY-MM-DD. Kosongkan untuk satu malam.",
          },
          tipe_kamar: {
            type: "string",
            description: "Nama tipe kamar bila tamu menyebutkannya, misalnya 'Deluxe'.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "daftar_tipe_kamar",
      description:
        "Daftar tipe kamar hotel beserta tarif per malam dan kapasitas tamu. " +
        "Panggil untuk pertanyaan tentang harga, tarif, atau pilihan kamar.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "tentang_asisten",
      description:
        "Jelaskan siapa Anda dan apa yang bisa Anda bantu. Panggil untuk pertanyaan " +
        "tentang asisten itu sendiri: 'kamu siapa', 'ini bot ya', 'bisa bantu apa', " +
        "'ini manusia atau robot'.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "cari_informasi_hotel",
      description:
        "Cari informasi resmi hotel yang ditulis stafnya: jam check-in/out, sarapan, " +
        "wifi, parkir, lokasi, kebijakan, fasilitas, dan sejenisnya. Panggil untuk " +
        "SEMUA pertanyaan yang bukan tentang ketersediaan atau tarif.",
      parameters: {
        type: "object",
        properties: {
          pertanyaan: {
            type: "string",
            description: "Pertanyaan tamu, apa adanya.",
          },
        },
        required: ["pertanyaan"],
      },
    },
  },
] as const;

function systemPrompt(brand: string, today: string): string {
  return [
    `Anda adalah asisten WhatsApp resmi hotel "${brand}". Hari ini ${today} (zona Asia/Jakarta).`,
    "",
    "ATURAN MUTLAK:",
    "1. Jawab HANYA dari hasil tool. Dilarang menebak, mengarang, atau memakai",
    "   pengetahuan umum tentang hotel lain.",
    "2. Untuk pertanyaan ketersediaan kamar, WAJIB panggil cek_ketersediaan lebih",
    "   dulu. Jangan pernah mengira-ngira kamar kosong atau penuh.",
    "3. Bila tool tidak memuat jawabannya, katakan terus terang bahwa Anda belum",
    "   memiliki informasinya dan tawarkan untuk menghubungkan ke staf. Jangan",
    "   mengarang jawaban yang terdengar masuk akal.",
    "4. Dilarang menyebut data tamu lain: nama, nomor telepon, tanggal menginap,",
    "   kode pesanan, atau nomor kamar yang sedang terisi. Anda memang tidak",
    "   memiliki aksesnya — jangan pura-pura punya.",
    "5. Jangan menjanjikan harga, diskon, atau kebijakan yang tidak ada di hasil tool.",
    "",
    "GAYA: Bahasa Indonesia yang sopan dan ringkas, maksimal 4 kalimat. Boleh pakai",
    "*tebal* WhatsApp. Jangan gunakan tabel atau markdown selain *tebal*.",
  ].join("\n");
}

// ─── Tool execution ──────────────────────────────────────────────────────────

interface ToolContext {
  tenantId: string;
  brand: string;
}

/**
 * A real calendar date, or null.
 *
 * Reuses the booking extractor's validator rather than re-checking the SHAPE
 * here. A shape check alone passes "2026-13-45" and "2026-02-30" — both look
 * like dates and neither exists — and forwarding one built a PostgREST filter
 * on a day that never happened, which comes back empty and reads as "penuh".
 */
const isoDate = (v: unknown): string | null => isoOrNull(v);

/**
 * Run one tool call and return what the model should see.
 *
 * Every branch returns TEXT, never raw rows: the model does not need object
 * shapes, and text is one fewer place for a field nobody meant to expose to
 * travel through.
 */
async function runTool(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  try {
    switch (name) {
      case "cek_ketersediaan": {
        const a = await checkAvailability({
          tenantId: ctx.tenantId,
          checkIn: isoDate(args.check_in),
          checkOut: isoDate(args.check_out),
          typeHint: typeof args.tipe_kamar === "string" ? args.tipe_kamar : "",
        });
        return renderAvailability(ctx.brand, a);
      }

      case "daftar_tipe_kamar": {
        const types = await listRoomTypes(ctx.tenantId);
        if (types.length === 0) return "Hotel belum memiliki tipe kamar yang dapat dipesan.";
        return types
          .map((t) => `${t.name}: Rp ${t.base_rate.toLocaleString("id-ID")}/malam` +
            (t.max_occupancy ? `, maksimal ${t.max_occupancy} tamu` : ""))
          .join("\n");
      }

      // Answered from a fixed string rather than left to the system prompt.
      //
      // Found in production: a guest asked "Kamu siapa" and got SILENCE. The
      // model answered correctly and without needing any data, but an answer
      // with no tool call counts as ungrounded — the rule that stops it
      // inventing facts — so the reply was discarded. Making identity a tool
      // keeps one rule ("every answer comes from a tool") instead of carving
      // an exception into it.
      case "tentang_asisten":
        return [
          `Saya asisten WhatsApp resmi ${ctx.brand}. Saya dapat membantu:`,
          "- mengecek ketersediaan kamar pada tanggal tertentu",
          "- menyebutkan tipe kamar dan tarifnya",
          "- memesan kamar",
          "- menjawab pertanyaan seputar hotel (jam check-in, sarapan, wifi, lokasi)",
          "Untuk hal di luar itu, saya hubungkan dengan staf.",
        ].join("\n");

      case "cari_informasi_hotel": {
        const q = typeof args.pertanyaan === "string" ? args.pertanyaan : "";
        const hits = await findKnowledge(ctx.tenantId, q);
        if (hits.length === 0) {
          // Said explicitly rather than returned empty, so the model is told
          // what to do instead of being left to improvise.
          return "TIDAK DITEMUKAN. Hotel belum menuliskan informasi untuk pertanyaan ini. " +
            "Katakan Anda belum memiliki informasinya dan tawarkan menghubungkan ke staf.";
        }
        return hits.map((h) => `${h.topic}: ${h.content}`).join("\n\n");
      }

      default:
        return "Tool tidak dikenal.";
    }
  } catch (e) {
    console.error(`[wa/concierge] tool ${name} failed:`, (e as Error).message);
    return "Informasi tidak dapat diambil saat ini. Katakan Anda belum bisa memastikan " +
      "dan tawarkan menghubungkan ke staf.";
  }
}

// ─── Output guardrail ────────────────────────────────────────────────────────

/**
 * Patterns that must never reach a guest. Their presence means a tool returned
 * something it should not have, or the model produced a detail from nowhere —
 * either way the reply is not trustworthy and is replaced wholesale rather than
 * redacted, because a partially-scrubbed answer still carries the claim.
 */
const FORBIDDEN = [
  // An Indonesian mobile number, tolerating the separators people actually
  // type. The first version required unbroken digits, so "0812-3456-7890" —
  // the form a staff member writes into a knowledge entry, and the form a model
  // reaches for when it formats — walked straight past a guardrail that looked
  // like it was working.
  //
  // Two bounds keep it from over-firing, which matters because a tripped
  // guardrail replaces the WHOLE answer:
  //   • the number must begin at a token boundary, so the "085" inside a price
  //     like "Rp 1.085.000.000" is not read as the start of a phone number;
  //   • separators are capped at two characters, so the pattern cannot wander
  //     across a sentence stitching unrelated digits together.
  /(?:^|[\s(])\+?(?:62|0)[\s.()-]{0,2}8[\s.()-]{0,2}(?:\d[\s.()-]{0,2}){7,12}/,
  /\b[\w.%-]+@[\w.-]+\.[A-Za-z]{2,}\b/, // an email address
  /\bBK-\d{8}-[A-Z0-9]{4}\b/,          // a booking reference
];

export function violatesGuardrail(text: string): boolean {
  return FORBIDDEN.some((re) => re.test(text ?? ""));
}

const SAFE_FALLBACK =
  "Mohon maaf, saya belum dapat memastikan informasi tersebut. " +
  "Boleh saya hubungkan dengan staf kami?";

// ─── Public API ──────────────────────────────────────────────────────────────

export interface ConciergeResult {
  /** The reply to send. Always present and always safe to send. */
  text: string;
  /** False when the model was unavailable or the answer failed the guardrail. */
  grounded: boolean;
  /** Which tools ran, for logging and for the live check's transcript. */
  toolsUsed: string[];
}

/**
 * Answer a guest's question, grounded in the hotel's real data.
 *
 * Never throws and never returns an empty string: a webhook must always be able
 * to reply, and "I'll get a human" is a valid reply. With no provider configured
 * it degrades to that immediately rather than pretending.
 *
 * Every outcome — answered, replaced, or failed — is recorded for the platform
 * console (./ai-log). Recording is best-effort and no-ops when the service role
 * is unconfigured, so it stays invisible to unit tests.
 */
export async function askConcierge(params: {
  tenantId: string;
  brand: string;
  question: string;
}): Promise<ConciergeResult> {
  const toolsUsed: string[] = [];
  const startedAt = Date.now();
  let provider: string | null = null;
  let model: string | null = null;

  /** Log the outcome, then hand back the result the caller expects. */
  const done = async (
    status: AiReplyStatus,
    result: ConciergeResult,
    extra?: { offenders?: string[]; error?: string },
  ): Promise<ConciergeResult> => {
    await recordAiReply({
      tenantId: params.tenantId,
      question: params.question,
      status,
      reply: status === "sent" || status === "ungrounded" ? result.text : null,
      provider,
      model,
      toolsUsed: result.toolsUsed,
      offenders: extra?.offenders,
      error: extra?.error,
      latencyMs: Date.now() - startedAt,
    });
    return result;
  };

  if (!hasChatProvider()) {
    return done(
      "failed",
      { text: SAFE_FALLBACK, grounded: false, toolsUsed },
      { error: "ai_chat_not_configured" },
    );
  }

  const ctx: ToolContext = { tenantId: params.tenantId, brand: params.brand };
  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: systemPrompt(params.brand, todayJakarta()) },
    { role: "user", content: params.question },
  ];

  // Everything the tools hand back, kept for the layer-4 figure check. The
  // guest's own question counts too: a guest who says "untuk 4 orang" may have
  // that number repeated back to them.
  const groundingSources: string[] = [params.question];

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      let msg;
      try {
        const completion = await chatCompletion({
          // Low but not zero: the wording may vary, the FACTS come from tools.
          temperature: 0.2,
          messages,
          tools: TOOLS,
        });
        msg = completion.message;
        provider = completion.provider;
        model = completion.model;
      } catch (e) {
        const reason = (e as Error).message;
        console.error(`[wa/concierge] ${reason}`);
        return done("failed", { text: SAFE_FALLBACK, grounded: false, toolsUsed }, { error: reason });
      }

      const calls: ChatToolCall[] = msg.tool_calls ?? [];
      if (calls.length === 0) {
        const answer = (msg.content ?? "").trim();
        if (!answer) {
          return done(
            "failed",
            { text: SAFE_FALLBACK, grounded: false, toolsUsed },
            { error: "empty_answer" },
          );
        }

        if (violatesGuardrail(answer)) {
          console.error("[wa/concierge] answer tripped the output guardrail — replaced");
          return done("blocked_pii", { text: SAFE_FALLBACK, grounded: false, toolsUsed });
        }

        // Layer 4: a rate or a count the tools never produced.
        const invented = ungroundedNumbers(answer, groundedNumbers(groundingSources));
        if (invented.length > 0) {
          console.error(
            `[wa/concierge] answer quoted figures no tool returned (${invented.join(", ")}) — replaced`,
          );
          return done(
            "blocked_numbers",
            { text: SAFE_FALLBACK, grounded: false, toolsUsed },
            { offenders: invented },
          );
        }
        // Grounded only if it actually looked something up. An answer produced
        // without a single tool call is the model talking from memory, which is
        // the failure mode this module exists to prevent.
        const grounded = toolsUsed.length > 0;
        return done(grounded ? "sent" : "ungrounded", { text: answer, grounded, toolsUsed });
      }

      // Record the assistant turn verbatim; the API rejects tool results that do
      // not follow the call that requested them.
      messages.push(msg as unknown as Record<string, unknown>);

      for (const call of calls) {
        const name = call.function?.name ?? "";
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function?.arguments || "{}") as Record<string, unknown>;
        } catch {
          // A malformed argument blob is the model's mistake, not the guest's;
          // run the tool with defaults rather than failing the whole answer.
        }
        toolsUsed.push(name);
        const output = await runTool(name, args, ctx);
        groundingSources.push(output);
        messages.push({ role: "tool", tool_call_id: call.id, content: output });
      }
    }

    // Ran out of rounds without a final answer.
    console.error(`[wa/concierge] no answer after ${MAX_TOOL_ROUNDS} tool rounds`);
    return done(
      "failed",
      { text: SAFE_FALLBACK, grounded: false, toolsUsed },
      { error: `no_answer_after_${MAX_TOOL_ROUNDS}_rounds` },
    );
  } catch (e) {
    const reason = (e as Error).message;
    console.error("[wa/concierge] exception:", reason);
    return done("failed", { text: SAFE_FALLBACK, grounded: false, toolsUsed }, { error: reason });
  }
}
