// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { availability, knowledge, booking } = vi.hoisted(() => ({
  availability: {
    checkAvailability: vi.fn(),
    renderAvailability: vi.fn(),
    todayJakarta: vi.fn(() => "2026-07-28"),
  },
  knowledge: { findKnowledge: vi.fn() },
  booking: { listRoomTypes: vi.fn() },
}));
vi.mock("./availability", () => availability);
vi.mock("./knowledge", () => knowledge);
vi.mock("./booking", () => booking);

import { askConcierge, violatesGuardrail } from "./concierge";

/** Queue of OpenAI responses; each fetch shifts one. */
let responses: unknown[];
let requests: Array<Record<string, unknown>>;

/** A plain answer with no tool calls. */
const says = (content: string) => ({ choices: [{ message: { role: "assistant", content } }] });

/** An assistant turn that calls one tool. */
const callsTool = (name: string, args: Record<string, unknown> = {}) => ({
  choices: [{
    message: {
      role: "assistant", content: null,
      tool_calls: [{ id: `c-${name}`, type: "function", function: { name, arguments: JSON.stringify(args) } }],
    },
  }],
});

beforeEach(() => {
  vi.clearAllMocks();
  responses = [];
  requests = [];
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_API_URL = "https://fake.local/v1/chat/completions";

  availability.checkAvailability.mockResolvedValue({ types: [], checkIn: "2026-08-05", checkOut: "2026-08-06", nights: 1, narrowed: false });
  availability.renderAvailability.mockReturnValue("Deluxe: 2 kamar tersedia dari 3");
  knowledge.findKnowledge.mockResolvedValue([]);
  booking.listRoomTypes.mockResolvedValue([{ id: "rt-1", name: "Deluxe", base_rate: 185000, max_occupancy: 2 }]);

  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    requests.push(JSON.parse(init.body as string));
    const next = responses.shift();
    if (next === undefined) throw new Error("no queued response");
    if (next === "http-500") return { ok: false, status: 500 } as Response;
    return { ok: true, json: async () => next } as unknown as Response;
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_URL;
});

describe("askConcierge — grounding", () => {
  it("calls the availability tool and answers from what it returned", async () => {
    responses = [callsTool("cek_ketersediaan", { check_in: "2026-08-05", check_out: "2026-08-06" }),
                 says("Untuk 5 Agustus, tersedia *2 kamar Deluxe*.")];

    const r = await askConcierge({ tenantId: "t", brand: "Lor Kali", question: "ada kamar kosong 5 agustus?" });

    expect(availability.checkAvailability).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "t", checkIn: "2026-08-05", checkOut: "2026-08-06" }),
    );
    expect(r.text).toContain("2 kamar Deluxe");
    expect(r.grounded).toBe(true);
    expect(r.toolsUsed).toEqual(["cek_ketersediaan"]);
  });

  it("is NOT grounded when the model answers without looking anything up", async () => {
    // The failure this module exists to prevent: a confident answer from memory.
    responses = [says("Tentu, kami masih ada banyak kamar kosong!")];

    const r = await askConcierge({ tenantId: "t", brand: "X", question: "ada kamar kosong besok?" });

    expect(r.grounded).toBe(false);
    expect(r.toolsUsed).toEqual([]);
  });

  it("ignores a date that is not a real ISO date rather than passing it through", async () => {
    responses = [callsTool("cek_ketersediaan", { check_in: "besok", check_out: "" }), says("ok")];

    await askConcierge({ tenantId: "t", brand: "X", question: "besok kosong?" });

    expect(availability.checkAvailability).toHaveBeenCalledWith(
      expect.objectContaining({ checkIn: null, checkOut: null }),
    );
  });

  it("tells the model to admit ignorance when the knowledge base has nothing", async () => {
    knowledge.findKnowledge.mockResolvedValue([]);
    responses = [callsTool("cari_informasi_hotel", { pertanyaan: "boleh bawa hewan?" }),
                 says("Mohon maaf, saya belum memiliki informasinya. Boleh saya hubungkan dengan staf?")];

    const r = await askConcierge({ tenantId: "t", brand: "X", question: "boleh bawa hewan?" });

    const toolMsg = (requests[1].messages as Array<{ role: string; content: string }>)
      .find((m) => m.role === "tool");
    expect(toolMsg?.content).toContain("TIDAK DITEMUKAN");
    expect(r.text).toContain("belum memiliki informasinya");
  });

  it("quotes the hotel's own words when the knowledge base does cover it", async () => {
    knowledge.findKnowledge.mockResolvedValue([
      { id: "k1", topic: "Sarapan", content: "Sarapan pukul 07.00–10.00 di lantai 1.", keywords: [], score: 3 },
    ]);
    responses = [callsTool("cari_informasi_hotel", { pertanyaan: "sarapan jam berapa" }),
                 says("Sarapan tersedia pukul *07.00–10.00* di lantai 1.")];

    const r = await askConcierge({ tenantId: "t", brand: "X", question: "sarapan jam berapa?" });

    const toolMsg = (requests[1].messages as Array<{ role: string; content: string }>)
      .find((m) => m.role === "tool");
    expect(toolMsg?.content).toContain("07.00–10.00");
    expect(r.grounded).toBe(true);
  });

  it("survives a tool that throws, and steers the model to offer staff", async () => {
    availability.checkAvailability.mockRejectedValue(new Error("db down"));
    responses = [callsTool("cek_ketersediaan", {}), says("Mohon maaf, saya belum bisa memastikan.")];

    const r = await askConcierge({ tenantId: "t", brand: "X", question: "kosong?" });

    const toolMsg = (requests[1].messages as Array<{ role: string; content: string }>)
      .find((m) => m.role === "tool");
    expect(toolMsg?.content).toContain("tidak dapat diambil");
    expect(r.text).toContain("belum bisa memastikan");
  });

  it("runs every tool the model asks for in one turn", async () => {
    responses = [
      {
        choices: [{
          message: {
            role: "assistant", content: null,
            tool_calls: [
              { id: "a", type: "function", function: { name: "daftar_tipe_kamar", arguments: "{}" } },
              { id: "b", type: "function", function: { name: "cek_ketersediaan", arguments: "{}" } },
            ],
          },
        }],
      },
      says("Deluxe Rp 185.000, tersedia 2 kamar."),
    ];

    const r = await askConcierge({ tenantId: "t", brand: "X", question: "harga dan ketersediaan?" });

    expect(r.toolsUsed).toEqual(["daftar_tipe_kamar", "cek_ketersediaan"]);
  });
});

describe("askConcierge — never leaves the guest unanswered", () => {
  it("falls back safely with no API key", async () => {
    delete process.env.OPENAI_API_KEY;
    const r = await askConcierge({ tenantId: "t", brand: "X", question: "apa saja?" });
    expect(r.grounded).toBe(false);
    expect(r.text).toContain("hubungkan dengan staf");
  });

  it("falls back on a non-2xx from the model", async () => {
    responses = ["http-500"];
    const r = await askConcierge({ tenantId: "t", brand: "X", question: "apa saja?" });
    expect(r.text).toContain("hubungkan dengan staf");
  });

  it("falls back when the network throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNRESET"); }));
    const r = await askConcierge({ tenantId: "t", brand: "X", question: "apa saja?" });
    expect(r.text).toContain("hubungkan dengan staf");
  });

  it("falls back rather than sending an empty reply", async () => {
    responses = [says("   ")];
    const r = await askConcierge({ tenantId: "t", brand: "X", question: "apa saja?" });
    expect(r.text).toContain("hubungkan dengan staf");
  });

  it("stops after the tool-round cap instead of looping the webhook", async () => {
    responses = [callsTool("cek_ketersediaan"), callsTool("cek_ketersediaan"), callsTool("cek_ketersediaan")];
    const r = await askConcierge({ tenantId: "t", brand: "X", question: "kosong?" });
    expect(r.grounded).toBe(false);
    expect(r.text).toContain("hubungkan dengan staf");
  });

  it("tolerates malformed tool arguments", async () => {
    responses = [
      { choices: [{ message: { role: "assistant", content: null,
        tool_calls: [{ id: "a", type: "function", function: { name: "cek_ketersediaan", arguments: "{not json" } }] } }] },
      says("Tersedia 2 kamar."),
    ];
    const r = await askConcierge({ tenantId: "t", brand: "X", question: "kosong?" });
    expect(r.text).toContain("2 kamar");
  });
});

describe("output guardrail", () => {
  it("catches the shapes that must never reach a guest", () => {
    expect(violatesGuardrail("Hubungi Budi di 081234567890")).toBe(true);
    expect(violatesGuardrail("Hubungi +6281234567890 ya")).toBe(true);
    expect(violatesGuardrail("Email tamu: budi@example.com")).toBe(true);
    expect(violatesGuardrail("Pesanan BK-20260728-5CA3 atas nama Budi")).toBe(true);
  });

  it("leaves an ordinary answer alone", () => {
    expect(violatesGuardrail("Tersedia *2 kamar Deluxe* seharga Rp 185.000 per malam.")).toBe(false);
    expect(violatesGuardrail("Check-in pukul 14.00, check-out pukul 12.00.")).toBe(false);
  });

  it("replaces the whole reply rather than sending a scrubbed one", async () => {
    // A partially-redacted answer still carries the claim it was making.
    responses = [callsTool("cari_informasi_hotel", { pertanyaan: "x" }),
                 says("Kamar 201 ditempati Budi, hubungi 081234567890.")];

    const r = await askConcierge({ tenantId: "t", brand: "X", question: "siapa di kamar 201?" });

    expect(r.text).not.toContain("081234567890");
    expect(r.text).not.toContain("Budi");
    expect(r.grounded).toBe(false);
  });
});
