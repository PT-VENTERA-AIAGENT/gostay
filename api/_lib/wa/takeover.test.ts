// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { client } = vi.hoisted(() => ({
  client: { serviceGet: vi.fn(), serviceUpdate: vi.fn() },
}));
vi.mock("./client", () => client);

import { isBotPaused, pauseBot, resumeBot } from "./takeover";

const ok = (rows: unknown) => ({ ok: true, json: async () => rows }) as unknown as Response;

beforeEach(() => {
  vi.clearAllMocks();
  client.serviceUpdate.mockResolvedValue({ ok: true } as Response);
});

afterEach(() => {
  delete process.env.WA_TAKEOVER_HOURS;
});

describe("isBotPaused", () => {
  it("is quiet while a takeover is still running", async () => {
    client.serviceGet.mockResolvedValue(ok([{ bot_paused_until: new Date(Date.now() + 60_000).toISOString() }]));
    expect(await isBotPaused("t-1")).toBe(true);
  });

  it("speaks again once the takeover has lapsed", async () => {
    // The reason it expires at all: a forgotten takeover would otherwise mute
    // that guest forever, and nobody notices because the symptom is silence.
    client.serviceGet.mockResolvedValue(ok([{ bot_paused_until: new Date(Date.now() - 60_000).toISOString() }]));
    expect(await isBotPaused("t-1")).toBe(false);
  });

  it("speaks when no takeover was ever set", async () => {
    client.serviceGet.mockResolvedValue(ok([{ bot_paused_until: null }]));
    expect(await isBotPaused("t-1")).toBe(false);
    client.serviceGet.mockResolvedValue(ok([]));
    expect(await isBotPaused("t-1")).toBe(false);
  });

  it("FAILS OPEN on a read error", async () => {
    // A database hiccup must not silently mute a hotel. An extra bot reply is
    // visible and recoverable; silence is neither.
    client.serviceGet.mockResolvedValue({ ok: false, status: 500 } as Response);
    expect(await isBotPaused("t-1")).toBe(false);

    client.serviceGet.mockRejectedValue(new Error("ECONNRESET"));
    expect(await isBotPaused("t-1")).toBe(false);
  });
});

describe("pauseBot / resumeBot", () => {
  it("pauses for the default window", async () => {
    await pauseBot("t-1");
    const [, patch] = client.serviceUpdate.mock.calls[0];
    const until = new Date((patch as { bot_paused_until: string }).bot_paused_until).getTime();
    const hours = (until - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(3.9);
    expect(hours).toBeLessThan(4.1);
  });

  it("honours WA_TAKEOVER_HOURS", async () => {
    process.env.WA_TAKEOVER_HOURS = "1";
    await pauseBot("t-1");
    const [, patch] = client.serviceUpdate.mock.calls[0];
    const hours = (new Date((patch as { bot_paused_until: string }).bot_paused_until).getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeLessThan(1.1);
  });

  it("clears the takeover on resume", async () => {
    await resumeBot("t-1");
    expect(client.serviceUpdate).toHaveBeenCalledWith(expect.stringContaining("t-1"), { bot_paused_until: null });
  });

  it("never throws — a failed pause must not break the reply in flight", async () => {
    client.serviceUpdate.mockRejectedValue(new Error("db down"));
    await expect(pauseBot("t-1")).resolves.toBeUndefined();
    await expect(resumeBot("t-1")).resolves.toBeUndefined();
  });
});
