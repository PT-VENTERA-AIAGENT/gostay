import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { chatCompletion, hasChatProvider, providerOrder, resolveProviders } from "./chat";

// Every env var this module reads, reset between tests so one case cannot leak
// configuration into the next.
const AI_ENV = [
  "AI_CHAT_PROVIDER",
  "OPENAI_API_KEY",
  "OPENAI_CHAT_MODEL",
  "OPENAI_API_URL",
  "NOUS_API_KEY",
  "NOUS_CHAT_MODEL",
  "NOUS_API_URL",
] as const;

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of AI_ENV) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of AI_ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function ok(message: Record<string, unknown>) {
  return { ok: true, status: 200, json: async () => ({ choices: [{ message }] }) } as Response;
}
function fail(status: number) {
  return { ok: false, status, json: async () => ({}) } as Response;
}

function stubFetch(...responses: Response[]) {
  const f = vi.fn();
  for (const r of responses) f.mockResolvedValueOnce(r);
  vi.stubGlobal("fetch", f);
  return f;
}

const messages = [{ role: "user", content: "kamar kosong?" }];

describe("providerOrder", () => {
  it("defaults to openai, preserving the behaviour from before the chain existed", () => {
    expect(providerOrder()).toEqual(["openai"]);
  });

  it("parses a comma-separated chain, trimming and de-duplicating", () => {
    process.env.AI_CHAT_PROVIDER = " nous , OPENAI ,nous ";
    expect(providerOrder()).toEqual(["nous", "openai"]);
  });

  it("falls back to the default rather than disabling the AI on a typo", () => {
    process.env.AI_CHAT_PROVIDER = "gemini";
    expect(providerOrder()).toEqual(["openai"]);
  });
});

describe("resolveProviders", () => {
  it("skips a provider whose key is unset, keeping the rest in order", () => {
    process.env.AI_CHAT_PROVIDER = "nous,openai";
    process.env.OPENAI_API_KEY = "sk-openai";
    expect(resolveProviders().map((p) => p.id)).toEqual(["openai"]);
  });

  it("uses each provider's default endpoint and model", () => {
    process.env.AI_CHAT_PROVIDER = "nous,openai";
    process.env.NOUS_API_KEY = "sk-nous";
    process.env.OPENAI_API_KEY = "sk-openai";
    expect(resolveProviders()).toEqual([
      {
        id: "nous",
        apiKey: "sk-nous",
        model: "nousresearch/hermes-4-70b",
        endpoint: "https://inference-api.nousresearch.com/v1/chat/completions",
      },
      {
        id: "openai",
        apiKey: "sk-openai",
        model: "gpt-4o-mini",
        endpoint: "https://api.openai.com/v1/chat/completions",
      },
    ]);
  });

  it("honours the per-call model map over the provider default", () => {
    process.env.AI_CHAT_PROVIDER = "nous";
    process.env.NOUS_API_KEY = "sk-nous";
    const [p] = resolveProviders({ nous: "~anthropic/claude-sonnet-latest" });
    expect(p.model).toBe("~anthropic/claude-sonnet-latest");
  });

  it("keeps OPENAI_API_URL working — the test suite's mock-server hook", () => {
    process.env.OPENAI_API_KEY = "sk-openai";
    process.env.OPENAI_API_URL = "http://127.0.0.1:9999/v1/chat/completions";
    expect(resolveProviders()[0].endpoint).toBe("http://127.0.0.1:9999/v1/chat/completions");
  });
});

describe("hasChatProvider", () => {
  it("is false with no key at all, so callers degrade instead of calling out", () => {
    expect(hasChatProvider()).toBe(false);
  });

  it("is true once a key in the chain is set", () => {
    process.env.OPENAI_API_KEY = "sk-openai";
    expect(hasChatProvider()).toBe(true);
  });
});

describe("chatCompletion", () => {
  it("returns the first provider's message with the provider that served it", async () => {
    process.env.AI_CHAT_PROVIDER = "nous,openai";
    process.env.NOUS_API_KEY = "sk-nous";
    process.env.OPENAI_API_KEY = "sk-openai";
    const f = stubFetch(ok({ role: "assistant", content: "Ada kak" }));

    const res = await chatCompletion({ messages });

    expect(res).toMatchObject({
      provider: "nous",
      model: "nousresearch/hermes-4-70b",
      message: { content: "Ada kak" },
    });
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0]).toBe("https://inference-api.nousresearch.com/v1/chat/completions");
  });

  it("hands over to the next provider when the first one fails", async () => {
    process.env.AI_CHAT_PROVIDER = "nous,openai";
    process.env.NOUS_API_KEY = "sk-nous";
    process.env.OPENAI_API_KEY = "sk-openai";
    vi.spyOn(console, "error").mockImplementation(() => {});
    // 429 is what an exhausted credit balance looks like.
    const f = stubFetch(fail(429), ok({ content: "Dari OpenAI" }));

    const res = await chatCompletion({ messages });

    expect(res.provider).toBe("openai");
    expect(f).toHaveBeenCalledTimes(2);
    expect(f.mock.calls[1][0]).toBe("https://api.openai.com/v1/chat/completions");
  });

  it("passes tool calls straight back to the caller", async () => {
    process.env.OPENAI_API_KEY = "sk-openai";
    const toolCalls = [
      { id: "call_1", type: "function", function: { name: "cek_ketersediaan", arguments: "{}" } },
    ];
    stubFetch(ok({ role: "assistant", content: null, tool_calls: toolCalls }));

    const res = await chatCompletion({ messages, tools: [{ type: "function" }] });

    expect(res.message.tool_calls).toEqual(toolCalls);
  });

  it("sends tools, temperature, max_tokens and response_format only when asked", async () => {
    process.env.OPENAI_API_KEY = "sk-openai";
    const f = stubFetch(ok({ content: "{}" }), ok({ content: "hai" }));

    await chatCompletion({ messages, jsonObject: true, temperature: 0.1, maxTokens: 42 });
    await chatCompletion({ messages });

    const first = JSON.parse(f.mock.calls[0][1].body as string);
    const second = JSON.parse(f.mock.calls[1][1].body as string);
    expect(first).toMatchObject({
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 42,
    });
    expect(second.response_format).toBeUndefined();
    expect(second.temperature).toBeUndefined();
    expect(second.tools).toBeUndefined();
  });

  it("throws a distinct error when nothing is configured", async () => {
    await expect(chatCompletion({ messages })).rejects.toThrow("ai_chat_not_configured");
  });

  it("throws once every provider in the chain has failed", async () => {
    process.env.AI_CHAT_PROVIDER = "nous,openai";
    process.env.NOUS_API_KEY = "sk-nous";
    process.env.OPENAI_API_KEY = "sk-openai";
    vi.spyOn(console, "error").mockImplementation(() => {});
    stubFetch(fail(401), fail(429));

    await expect(chatCompletion({ messages })).rejects.toThrow(
      /all_providers_failed.*nous: HTTP 401.*openai: HTTP 429/,
    );
  });
});
