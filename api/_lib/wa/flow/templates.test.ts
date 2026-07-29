// @vitest-environment node
//
// End-to-end proof of the shipped templates: the real graphs, run through the
// real engine, asserting the exact text a guest receives.
//
// These are transcript tests on purpose. Every other test here checks mechanics
// (did it branch, did it park); these check the PRODUCT — that a hotel which
// installs the templates and changes nothing has a WhatsApp assistant that
// reads correctly in Indonesian and routes "menu" to the right place.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { runFlow, type FlowActions } from "./engine";
import { pickFlow, selectFlow } from "./select";
import { FLOW_TEMPLATES, findTemplate, CATEGORY_META, CATEGORY_ORDER, type FlowTemplate } from "./templates";
import { coerceFlow } from "./types";
import type { StoredFlow } from "./store";

let sent: string[];
let actions: FlowActions;

beforeEach(() => {
  sent = [];
  actions = {
    startBooking: vi.fn().mockImplementation(async () => {
      sent.push("[booking conversation takes over]");
    }),
    startRoomService: vi.fn().mockImplementation(async () => {
      sent.push("[room service conversation takes over]");
      return true;
    }),
    checkAvailability: vi.fn().mockImplementation(async () => {
      // Shape only — availability.test.ts owns the wording and the privacy rule.
      sent.push("[ketersediaan: 2 kamar Deluxe tersedia dari 3]");
    }),
    showRoomTypes: vi.fn().mockImplementation(async () => {
      sent.push("Pilihan kamar & tarif per malam di *Hotel Uji*:\n\n*Deluxe*\n    Rp 500.000 / malam");
    }),
    showMenu: vi.fn().mockResolvedValue(undefined),
    askConcierge: vi.fn().mockImplementation(async () => {
      sent.push("[AI menjawab dari data hotel]");
    }),
    sendPortalLink: vi.fn().mockImplementation(async () => {
      sent.push("Pantau & kelola pesanan Anda di portal tamu:\nhttps://app.gostay.id/portal?hotel=hotel-uji");
    }),
  };
});

const ctx = () => ({ reply: async (t: string) => { sent.push(t); }, actions });

const VARS = { hotel_name: "Hotel Uji", guest_name: "Budi" };

/** A template as the store would hand it to the engine. */
function stored(t: FlowTemplate): StoredFlow {
  return {
    id: t.key,
    name: t.name,
    triggerKeywords: t.triggerKeywords,
    requires: t.requires,
    priority: t.priority,
    // Through coerceFlow, exactly as production does — so a template that the
    // coercer would reject fails here rather than silently shipping empty.
    definition: coerceFlow(t.definition),
  };
}

const ALL = FLOW_TEMPLATES.map(stored).sort(
  (a, b) => a.priority - b.priority || a.name.localeCompare(b.name),
);

// ─── No template may shadow another's trigger ────────────────────────────────

describe("trigger keywords do not collide", () => {
  // Selection walks flows in precedence order and the first best match wins, so
  // a keyword listed by two templates only ever fires the higher-priority one —
  // the lower one is dead for that word, silently. Lor Kali shipped with exactly
  // this: "handuk" and "laundry" sat on Request Tamu, so the whole Housekeeping
  // flow could never be reached; "kamar kosong" and "check in" sat on Reservasi,
  // burying Cek Kamar Kosong and Info Check-in.
  it("no keyword appears in more than one template", () => {
    const owner = new Map<string, string>();
    const clashes: string[] = [];

    for (const t of ALL) {
      for (const kw of t.triggerKeywords) {
        const key = kw.trim().toLowerCase();
        const prev = owner.get(key);
        if (prev && prev !== t.name) {
          clashes.push(`"${kw}" diklaim "${prev}" dan "${t.name}"`);
        } else {
          owner.set(key, t.name);
        }
      }
    }

    expect(clashes).toEqual([]);
  });
});

// ─── The templates survive coercion ──────────────────────────────────────────

describe("templates are well-formed", () => {
  it("keeps every node and edge through coerceFlow", () => {
    for (const t of FLOW_TEMPLATES) {
      const coerced = coerceFlow(t.definition);
      expect(coerced.nodes, `${t.name} nodes`).toHaveLength(t.definition.nodes.length);
      expect(coerced.edges, `${t.name} edges`).toHaveLength(t.definition.edges.length);
    }
  });

  it("gives every template exactly one trigger and a unique key", () => {
    const keys = new Set<string>();
    for (const t of FLOW_TEMPLATES) {
      expect(t.definition.nodes.filter((n) => n.type === "trigger"), t.name).toHaveLength(1);
      expect(keys.has(t.key), `duplicate key ${t.key}`).toBe(false);
      keys.add(t.key);
      expect(t.triggerKeywords.length, `${t.name} has no keywords`).toBeGreaterThan(0);
    }
  });

  it("wires every edge between nodes that exist", () => {
    for (const t of FLOW_TEMPLATES) {
      const ids = new Set(t.definition.nodes.map((n) => n.id));
      for (const e of t.definition.edges) {
        expect(ids.has(e.source), `${t.name}: edge from missing ${e.source}`).toBe(true);
        expect(ids.has(e.target), `${t.name}: edge to missing ${e.target}`).toBe(true);
      }
    }
  });

  it("leaves nothing after a takeover action, which would never be reached", () => {
    // start_booking ends the run. An edge out of it is a drawing mistake.
    for (const t of FLOW_TEMPLATES) {
      const takeovers = t.definition.nodes.filter(
        (n) => n.type === "action" && n.data.action === "start_booking",
      );
      for (const n of takeovers) {
        const out = t.definition.edges.filter((e) => e.source === n.id);
        expect(out, `${t.name}: unreachable node after ${n.id}`).toHaveLength(0);
      }
    }
  });
});

// ─── Routing: the reservation-vs-menu question, on the real templates ────────

describe("the shipped set is coherent", () => {
  it("ships fourteen templates with unique keys and names", () => {
    expect(FLOW_TEMPLATES).toHaveLength(14);
    expect(new Set(FLOW_TEMPLATES.map((t) => t.key)).size).toBe(14);
    expect(new Set(FLOW_TEMPLATES.map((t) => t.name)).size).toBe(14);
  });

  it("gives every template a known category, and every category a template", () => {
    for (const t of FLOW_TEMPLATES) {
      expect(CATEGORY_META[t.category], `${t.name} has an unknown category`).toBeTruthy();
      expect(CATEGORY_ORDER).toContain(t.category);
    }
    // An empty group would render as a heading with nothing under it.
    for (const c of CATEGORY_ORDER) {
      expect(FLOW_TEMPLATES.some((t) => t.category === c), `category ${c} is empty`).toBe(true);
    }
  });

  it("keeps the greeting last so it cannot swallow a specific flow's words", () => {
    const sapaan = findTemplate("sapaan")!;
    for (const t of FLOW_TEMPLATES) {
      if (t.key === "sapaan") continue;
      expect(t.priority, `${t.name} must outrank the catch-all`).toBeLessThan(sapaan.priority);
    }
  });

  it("never gives two templates the same priority AND an overlapping keyword", () => {
    // Equal priority plus a shared word means the winner depends on array order,
    // which is exactly the arbitrariness the tiered matcher exists to remove.
    for (let i = 0; i < FLOW_TEMPLATES.length; i++) {
      for (let j = i + 1; j < FLOW_TEMPLATES.length; j++) {
        const a = FLOW_TEMPLATES[i], b = FLOW_TEMPLATES[j];
        if (a.priority !== b.priority) continue;
        const shared = a.triggerKeywords.filter((k) => b.triggerKeywords.includes(k));
        expect(shared, `${a.name} and ${b.name} share ${shared} at priority ${a.priority}`).toHaveLength(0);
      }
    }
  });

  it("does not let an ungated flow shadow an in-house one at the same word", () => {
    // A shared word is fine — that is the whole design — but only when the
    // in-house flow runs FIRST, or the gate can never be reached.
    const gated = FLOW_TEMPLATES.filter((t) => t.requires === "inhouse");
    const open = FLOW_TEMPLATES.filter((t) => t.requires === "none");
    for (const g of gated) {
      for (const o of open) {
        const shared = g.triggerKeywords.filter((k) => o.triggerKeywords.includes(k));
        if (shared.length === 0) continue;
        expect(
          g.priority,
          `${o.name} would claim ${shared} before ${g.name} could gate on it`,
        ).toBeLessThan(o.priority);
      }
    }
  });

  it("keeps 'batal' out of the templates — the built-in quote owns it", () => {
    // A guest typing "batal" is backing out of a pending quote. A template
    // claiming it would steal that from the booking conversation.
    for (const t of FLOW_TEMPLATES) {
      expect(t.triggerKeywords, `${t.name} claims 'batal'`).not.toContain("batal");
    }
  });
});

describe("routing across the installed templates", () => {
  const pick = (input: string, isInhouse: boolean) => pickFlow(ALL, input, { isInhouse })?.id ?? null;

  it('"menu" reaches Request Tamu for a guest who is checked in', () => {
    expect(pick("menu", true)).toBe("request_tamu");
  });

  it('"menu" is owned by Request Tamu even for a guest who is not staying', () => {
    // pickFlow only returns what may RUN, so a guest who is not checked in gets
    // null here — and selectFlow (which the router uses) reports it as blocked
    // so they are told room service needs a check-in. Previously Sapaan also
    // claimed "menu" and answered a food request with a welcome message.
    expect(pick("menu", false)).toBeNull();
    expect(selectFlow(ALL, "menu", { isInhouse: false })).toMatchObject({
      kind: "blocked",
      flow: { id: "request_tamu" },
    });
  });

  it("a guest who is not staying still reaches Sapaan by other words", () => {
    expect(pick("halo", false)).toBe("sapaan");
    expect(pick("bantuan", false)).toBe("sapaan");
  });

  it("booking words reach Reservasi whether or not they are staying", () => {
    expect(pick("mau booking dong", false)).toBe("reservasi");
    expect(pick("mau booking dong", true)).toBe("reservasi");
  });

  it("food words reach Request Tamu only while staying", () => {
    expect(pick("lapar", true)).toBe("request_tamu");
    // "lapar" is not a Sapaan keyword, so a non-guest gets no flow and the
    // built-in conversation answers instead.
    expect(pick("lapar", false)).toBeNull();
  });

  it("greetings reach Sapaan", () => {
    expect(pick("halo", false)).toBe("sapaan");
    expect(pick("assalamualaikum", false)).toBe("sapaan");
  });

  it("does not fire on an unrelated message", () => {
    expect(pick("nomor rekening berapa ya", false)).toBeNull();
  });

  it("does not fire on words that merely contain a trigger", () => {
    // "menunggu" ⊃ "menu"; substring alone cannot start a flow.
    expect(pick("saya menunggu konfirmasi transfer", true)).toBeNull();
  });

  it("routes the new question templates to their own flows", () => {
    expect(pick("berapa harga kamarnya", false)).toBe("harga");
    expect(pick("jam check in berapa", false)).toBe("checkin_info");
    expect(pick("alamat hotelnya dimana", false)).toBe("lokasi");
    expect(pick("ada wifi tidak", false)).toBe("fasilitas");
    expect(pick("mau refund", false)).toBe("pembatalan");
    expect(pick("mau kasih masukan", false)).toBe("ulasan");
  });

  it("sends a complaint and a request for a human straight to the right place", () => {
    expect(pick("ac nya rusak", false)).toBe("keluhan");
    expect(pick("mau bicara dengan admin", false)).toBe("staf");
  });

  it("routes housekeeping words only for a guest who is staying", () => {
    expect(pick("minta handuk", true)).toBe("housekeeping");
    expect(pick("minta handuk", false)).toBeNull();
  });

  it('lets "check in" mean the question, not a booking', () => {
    // Reservasi deliberately drops "check in": a guest asking the time is not
    // trying to book, and the booking flow outranks the info one.
    expect(pick("jam check in berapa ya", false)).toBe("checkin_info");
  });

  it("does not let a generic question word swallow the specific flows", () => {
    // "jam berapa" and "berapa" are question words, not topics. Both used to sit
    // on high-priority flows and quietly claimed sentences that belonged to
    // others — "sarapan jam berapa" was answered with check-in times.
    const info = findTemplate("checkin_info")!;
    const harga = findTemplate("harga")!;
    expect(info.triggerKeywords).not.toContain("jam berapa");
    expect(harga.triggerKeywords).not.toContain("berapa");
  });
});

// ─── Transcript: reservation, including payment in chat ──────────────────────

describe("01 Reservasi Kamar — the guest transcript", () => {
  it("greets, prices, then hands over to booking", async () => {
    const flow = stored(findTemplate("reservasi")!);

    const r = await runFlow({ flow, vars: VARS, input: "mau booking", ctx: ctx() });

    expect(sent).toEqual([
      "Halo! Selamat datang di *Hotel Uji* 👋\n\nDengan senang hati kami bantu pemesanan kamar Anda.",
      "Pilihan kamar & tarif per malam di *Hotel Uji*:\n\n*Deluxe*\n    Rp 500.000 / malam",
      "[booking conversation takes over]",
    ]);
    // The booking conversation owns the state from here — the flow must not
    // park anything of its own over it.
    expect(r.status).toBe("done");
    expect(r.tookOver).toBe(true);
  });
});

// ─── Transcript: in-house guest request ──────────────────────────────────────

describe("02 Request Tamu — the guest transcript", () => {
  it("greets by name and opens the room-service order", async () => {
    const flow = stored(findTemplate("request_tamu")!);

    await runFlow({ flow, vars: VARS, input: "menu", ctx: ctx() });

    expect(sent).toEqual([
      "Halo Budi 👋\nKami siap membantu kebutuhan Anda selama menginap di *Hotel Uji*.",
      "[room service conversation takes over]",
    ]);
  });

  it("explains itself instead of going silent when the stay has just ended", async () => {
    // The gate passed at selection time but the guest checked out before the
    // action ran. Without the fall-through node this is silence.
    (actions.startRoomService as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const flow = stored(findTemplate("request_tamu")!);

    await runFlow({ flow, vars: VARS, input: "menu", ctx: ctx() });

    expect(sent[sent.length - 1]).toContain("khusus untuk tamu yang sedang menginap");
    expect(sent[sent.length - 1]).toContain("*booking*");
  });
});

// ─── Transcript: the main menu, all three branches ───────────────────────────

describe("90 Sapaan & Menu Utama — the guest transcript", () => {
  const flow = () => stored(findTemplate("sapaan")!);

  it("offers a numbered menu and waits", async () => {
    const r = await runFlow({ flow: flow(), vars: VARS, input: "halo", ctx: ctx() });

    expect(sent).toEqual([
      "*Hotel Uji*\nHalo! Ada yang bisa kami bantu?\n\n" +
        "1. Pesan kamar\n2. Lihat kamar & harga\n3. Bicara dengan staf",
    ]);
    expect(r.status).toBe("waiting");
    expect(r.nodeId).toBe("ask");
  });

  it('"1" goes to booking', async () => {
    await runFlow({ flow: flow(), resumeAt: "ask", vars: VARS, input: "1", ctx: ctx() });
    expect(sent).toEqual(["[booking conversation takes over]"]);
  });

  it('"2" shows rooms, sends the portal link, and closes politely', async () => {
    const r = await runFlow({ flow: flow(), resumeAt: "ask", vars: VARS, input: "2", ctx: ctx() });

    expect(sent).toEqual([
      "Pilihan kamar & tarif per malam di *Hotel Uji*:\n\n*Deluxe*\n    Rp 500.000 / malam",
      "Pantau & kelola pesanan Anda di portal tamu:\nhttps://app.gostay.id/portal?hotel=hotel-uji",
      "Bila ingin memesan, ketik *booking* ya. Terima kasih! 🙏",
    ]);
    expect(r.status).toBe("done");
  });

  it('"3" hands off to a human', async () => {
    const r = await runFlow({ flow: flow(), resumeAt: "ask", vars: VARS, input: "3", ctx: ctx() });

    expect(sent).toEqual([
      "Baik, kami sambungkan dengan staf *Hotel Uji*. Mohon tunggu sebentar ya 🙏",
    ]);
    expect(r.status).toBe("handoff");
  });

  it("accepts the option's words, not just its number", async () => {
    await runFlow({ flow: flow(), resumeAt: "ask", vars: VARS, input: "bicara dengan staf", ctx: ctx() });
    expect(sent[0]).toContain("kami sambungkan dengan staf");
  });

  it("re-asks on an answer it cannot read", async () => {
    const r = await runFlow({ flow: flow(), resumeAt: "ask", vars: VARS, input: "hmm apa ya", ctx: ctx() });

    expect(sent[0]).toContain("belum kami kenali");
    expect(r.nodeId).toBe("ask"); // still parked, not dropped
  });

  it("renders no stray punctuation when the guest name is unknown", async () => {
    // {{guest_name}} is empty for a first-contact number. The greeting must not
    // read "Halo ," — the interpolator collapses the hole.
    const rs = stored(findTemplate("request_tamu")!);
    await runFlow({ flow: rs, vars: { hotel_name: "Hotel Uji", guest_name: "" }, input: "menu", ctx: ctx() });

    expect(sent[0]).toBe("Halo 👋\nKami siap membantu kebutuhan Anda selama menginap di *Hotel Uji*.");
  });
});
