// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { extractBookingIntent, type BookingIntent } from "./ai";

// The fallback assumes the running year when a phrase omits one ("20-22 juli").
const YEAR = new Date().getFullYear();

/** Stands in for OpenAI's chat/completions endpoint. */
interface MockState {
  requests: Array<Record<string, unknown>>;
  status: number;
  // What the mocked model puts in choices[0].message.content.
  content: string;
}

let server: Server;
let state: MockState;

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => resolve(raw));
  });
}

beforeAll(async () => {
  server = createServer(async (req, res) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const body = await readBody(req);

    if (url.pathname === "/v1/chat/completions") {
      state.requests.push(JSON.parse(body));
      if (state.status !== 200) {
        res.writeHead(state.status, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "boom" } }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({ choices: [{ message: { content: state.content } }] }),
      );
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  process.env.OPENAI_API_URL = `http://127.0.0.1:${port}/v1/chat/completions`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

beforeEach(() => {
  state = { requests: [], status: 200, content: "" };
  process.env.OPENAI_API_KEY = "test-openai-key";
});

describe("extractBookingIntent — model leg (mocked OpenAI)", () => {
  it("parses a well-formed JSON booking intent from the model", async () => {
    state.content = JSON.stringify({
      intent: "book",
      check_in: "2026-07-20",
      check_out: "2026-07-22",
      guests: 2,
      room_type_hint: "deluxe",
      confidence: 0.9,
    });

    const r = await extractBookingIntent("mau nginap 20-22 juli 2 orang deluxe");

    expect(r).toEqual<BookingIntent>({
      intent: "book",
      check_in: "2026-07-20",
      check_out: "2026-07-22",
      guests: 2,
      room_type_hint: "deluxe",
      guest_name: null,
      confidence: 0.9,
    });
  });

  it("calls gpt-4o-mini with low temperature and json_object response_format", async () => {
    state.content = JSON.stringify({ intent: "chat", confidence: 0.5 });
    await extractBookingIntent("halo");

    const sent = state.requests[0];
    expect(sent.model).toBe("gpt-4o-mini");
    expect(sent.temperature).toBe(0.1);
    expect(sent.response_format).toEqual({ type: "json_object" });
    const messages = sent.messages as Array<{ role: string; content: string }>;
    expect(messages[0].role).toBe("system");
    expect(messages[1]).toEqual({ role: "user", content: "halo" });
  });

  it("strips code fences before parsing the model output", async () => {
    state.content = "```json\n" + JSON.stringify({ intent: "book", guests: 3, confidence: 0.8 }) + "\n```";
    const r = await extractBookingIntent("buat 3 orang");
    expect(r.intent).toBe("book");
    expect(r.guests).toBe(3);
  });

  it("falls back — never throws — on malformed model output", async () => {
    state.content = "totally not json {{{";
    const r = await extractBookingIntent("mau nginap 20-22 juli 2 orang deluxe");
    // Fell through to the deterministic extractor.
    expect(r.confidence).toBe(0.3);
    expect(r.check_in).toBe(`${YEAR}-07-20`);
    expect(r.room_type_hint).toBe("deluxe");
  });

  it("falls back when the API returns a non-2xx status", async () => {
    state.status = 500;
    const r = await extractBookingIntent("mau booking deluxe");
    expect(r.confidence).toBe(0.3);
    expect(r.room_type_hint).toBe("deluxe");
    expect(r.intent).toBe("book");
  });

  it("merges already-known slots the model leaves out", async () => {
    // The guest previously gave dates; this turn only names a room type.
    state.content = JSON.stringify({ intent: "book", room_type_hint: "suite", confidence: 0.7 });
    const r = await extractBookingIntent("suite aja", {
      check_in: "2026-08-01",
      check_out: "2026-08-03",
      guests: 2,
    });
    expect(r).toMatchObject({
      intent: "book",
      check_in: "2026-08-01",
      check_out: "2026-08-03",
      guests: 2,
      room_type_hint: "suite",
    });
  });

  it("lets a fresh slot override a previously-known one", async () => {
    state.content = JSON.stringify({ intent: "book", guests: 4, confidence: 0.8 });
    const r = await extractBookingIntent("eh jadi 4 orang", { guests: 2 });
    expect(r.guests).toBe(4);
  });
});

describe("extractBookingIntent — deterministic fallback (no OPENAI_API_KEY)", () => {
  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  it("does not call the network when the key is unset", async () => {
    await extractBookingIntent("mau nginap 20-22 juli 2 orang deluxe");
    expect(state.requests).toHaveLength(0);
  });

  it("extracts a valid BookingIntent from an Indonesian phrase", async () => {
    const r = await extractBookingIntent("mau nginap 20-22 juli 2 orang deluxe");
    expect(r.intent).toBe("book");
    expect(r.check_in).toBe(`${YEAR}-07-20`);
    expect(r.check_out).toBe(`${YEAR}-07-22`);
    expect(r.guests).toBe(2);
    expect(r.room_type_hint).toBe("deluxe");
    expect(r.confidence).toBe(0.3);
  });

  it("reads ISO date ranges directly", async () => {
    const r = await extractBookingIntent("booking 2026-09-10 sampai 2026-09-12 suite");
    expect(r.check_in).toBe("2026-09-10");
    expect(r.check_out).toBe("2026-09-12");
    expect(r.room_type_hint).toBe("suite");
  });

  it("treats a plain greeting as chat, not book", async () => {
    const r = await extractBookingIntent("halo selamat pagi");
    expect(r.intent).toBe("chat");
    expect(r.check_in).toBeNull();
    expect(r.room_type_hint).toBeNull();
  });

  it("still resolves — never throws — on empty input", async () => {
    const r = await extractBookingIntent("");
    expect(r.intent).toBe("chat");
    expect(r.confidence).toBe(0.3);
  });

  it("preserves known slots through the fallback path", async () => {
    const r = await extractBookingIntent("deluxe ya", {
      check_in: "2026-07-20",
      check_out: "2026-07-22",
      guests: 2,
    });
    expect(r.check_in).toBe("2026-07-20");
    expect(r.check_out).toBe("2026-07-22");
    expect(r.guests).toBe(2);
    expect(r.room_type_hint).toBe("deluxe");
  });

  it("normalises the Indonesian 'standar' spelling to 'standard'", async () => {
    const r = await extractBookingIntent("kamar standar buat 1 orang");
    expect(r.room_type_hint).toBe("standard");
    expect(r.guests).toBe(1);
  });

  it("extracts the booker name from 'atas nama' / 'a/n' phrases", async () => {
    expect((await extractBookingIntent("atas nama Budi Santoso")).guest_name).toBe("Budi Santoso");
    expect((await extractBookingIntent("deluxe a/n Andi")).guest_name).toBe("Andi");
    expect((await extractBookingIntent("2 orang deluxe")).guest_name).toBeNull();
  });
});
