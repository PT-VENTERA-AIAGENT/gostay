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
import { pickFlow } from "./select";
import { FLOW_TEMPLATES, findTemplate, type FlowTemplate } from "./templates";
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
    showRoomTypes: vi.fn().mockImplementation(async () => {
      sent.push("Pilihan kamar & tarif per malam di *Hotel Uji*:\n\n*Deluxe*\n    Rp 500.000 / malam");
    }),
    showMenu: vi.fn().mockResolvedValue(undefined),
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

describe("routing across the installed templates", () => {
  const pick = (input: string, isInhouse: boolean) => pickFlow(ALL, input, { isInhouse })?.id ?? null;

  it('"menu" reaches Request Tamu for a guest who is checked in', () => {
    expect(pick("menu", true)).toBe("request_tamu");
  });

  it('"menu" reaches Sapaan for a guest who is not', () => {
    expect(pick("menu", false)).toBe("sapaan");
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
