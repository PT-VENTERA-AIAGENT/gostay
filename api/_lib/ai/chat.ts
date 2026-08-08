// One chat-completions client for every model GoStay talks to.
//
// ─── Why this exists ─────────────────────────────────────────────────────────
// Every AI feature used to hardcode `api.openai.com` and read OPENAI_API_KEY
// directly. When that account ran out of credit the bot did not degrade — it
// stopped, everywhere at once, and the only way back was a code change. Which
// vendor serves a request is an operational decision, so it belongs in env:
//
//   AI_CHAT_PROVIDER=openai        → OpenAI only (default, previous behaviour)
//   AI_CHAT_PROVIDER=nous          → Nous Portal only
//   AI_CHAT_PROVIDER=nous,openai   → try Nous first, fall back to OpenAI
//
// The list is an ordered failover chain: each provider is tried in turn and the
// first one that answers wins. A provider whose key is unset is skipped, so the
// key of an inactive vendor can stay in env and the chain flips back with one
// variable.
//
// Both vendors speak the OpenAI chat-completions wire format — Nous Portal is a
// multi-vendor gateway — so one `fetch` serves all of them, tool calls and JSON
// mode included. It does NOT cover the Realtime API used by Voice AI
// (api/_lib/voice/handlers.ts): that endpoint is OpenAI-only and stays there.
//
// House pattern (mirrors api/_lib/wa/ai.ts and exchange.ts): env is read lazily
// inside config(), never at module scope, because the Vite dev middleware only
// populates process.env after import time. No VITE_ prefix anywhere here — none
// of these keys may ever reach the browser bundle.

export type ProviderId = "nous" | "openai";

interface ProviderSpec {
  /** Env var holding the API key. The provider is skipped when it is empty. */
  apiKeyEnv: string;
  /** Env var overriding the model. */
  modelEnv: string;
  /** Env var overriding the full endpoint URL (the test suite points this at a mock). */
  endpointEnv: string;
  defaultEndpoint: string;
  defaultModel: string;
}

const PROVIDERS: Record<ProviderId, ProviderSpec> = {
  nous: {
    apiKeyEnv: "NOUS_API_KEY",
    modelEnv: "NOUS_CHAT_MODEL",
    endpointEnv: "NOUS_API_URL",
    defaultEndpoint: "https://inference-api.nousresearch.com/v1/chat/completions",
    // Nous' own model — the fastest on the gateway and it supports tool calling,
    // which the concierge depends on entirely.
    defaultModel: "nousresearch/hermes-4-70b",
  },
  openai: {
    apiKeyEnv: "OPENAI_API_KEY",
    modelEnv: "OPENAI_CHAT_MODEL",
    // Pre-existing name, kept so the test suite's mock-server override keeps working.
    endpointEnv: "OPENAI_API_URL",
    defaultEndpoint: "https://api.openai.com/v1/chat/completions",
    defaultModel: "gpt-4o-mini",
  },
};

const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

/**
 * Model map for the outbound sales writer (api/_lib/outbound/*).
 *
 * That copy used to be written by `claude-sonnet-4-6` through the Anthropic
 * SDK; Nous Portal fronts the same family, so the vendor moves but the writing
 * model does not. No OpenAI entry: if the chain falls through to OpenAI it uses
 * that provider's default (gpt-4o-mini) — weaker prose, but a draft an admin
 * reviews anyway beats no draft at all.
 */
export const OUTBOUND_MODELS: Partial<Record<ProviderId, string>> = {
  nous: "~anthropic/claude-sonnet-latest",
};

/** Order used when AI_CHAT_PROVIDER is unset — preserves the old behaviour. */
const DEFAULT_ORDER: ProviderId[] = ["openai"];

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ChatToolCall {
  id: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}

export interface ChatMessage {
  role?: string;
  content?: string | null;
  tool_calls?: ChatToolCall[];
}

export interface ChatParams {
  /** Conversation so far, in OpenAI wire format (system/user/assistant/tool). */
  messages: Array<Record<string, unknown>>;
  /** Tool definitions, passed through untouched. Readonly so a caller's
   *  `as const` tool table (concierge.ts) needs no cast. */
  tools?: readonly unknown[];
  temperature?: number;
  maxTokens?: number;
  /** Force a strict JSON-object response. */
  jsonObject?: boolean;
  /**
   * Per-provider model override. Keyed by provider because a model id is
   * vendor-specific: the outbound writer wants a Claude-class model, which is
   * `~anthropic/claude-sonnet-latest` on Nous but has no equivalent id at
   * OpenAI. Providers with no entry fall back to their default model.
   */
  models?: Partial<Record<ProviderId, string>>;
}

export interface ChatResult {
  /** The assistant turn verbatim — content and/or tool_calls. */
  message: ChatMessage;
  /** Which provider actually served it. */
  provider: ProviderId;
  /** The concrete model that was asked for. */
  model: string;
}

interface ResolvedProvider {
  id: ProviderId;
  endpoint: string;
  apiKey: string;
  model: string;
}

// ─── Configuration ───────────────────────────────────────────────────────────

/** Parse AI_CHAT_PROVIDER into an ordered, de-duplicated provider list. */
export function providerOrder(): ProviderId[] {
  const raw = process.env.AI_CHAT_PROVIDER?.trim();
  if (!raw) return DEFAULT_ORDER;

  const ids = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .filter((id): id is ProviderId => PROVIDER_IDS.includes(id as ProviderId));

  // An all-typo value would otherwise silently disable the AI; fall back to the
  // default chain instead, matching this codebase's "never throw" AI contract.
  return ids.length > 0 ? [...new Set(ids)] : DEFAULT_ORDER;
}

/** Providers that are configured AND have a key, in the order to try them. */
export function resolveProviders(models?: ChatParams["models"]): ResolvedProvider[] {
  const out: ResolvedProvider[] = [];

  for (const id of providerOrder()) {
    const spec = PROVIDERS[id];
    const apiKey = process.env[spec.apiKeyEnv]?.trim();
    if (!apiKey) continue;
    out.push({
      id,
      apiKey,
      endpoint: process.env[spec.endpointEnv]?.trim() || spec.defaultEndpoint,
      model: models?.[id]?.trim() || process.env[spec.modelEnv]?.trim() || spec.defaultModel,
    });
  }

  return out;
}

/**
 * True when at least one provider can serve a request.
 *
 * Callers use this for the early "no key → degrade gracefully" branch they
 * already had, so the AI modules keep their never-throw contract.
 */
export function hasChatProvider(): boolean {
  return resolveProviders().length > 0;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Send a chat completion and return the assistant turn.
 *
 * Providers are tried in AI_CHAT_PROVIDER order; a provider that errors (no
 * credit, rate limit, outage) is logged and the next one is tried.
 *
 * @throws Error when nothing is configured or every provider failed. Callers in
 *   this codebase already wrap their model calls in try/catch and degrade to a
 *   deterministic answer, so the throw stays inside that contract.
 */
export async function chatCompletion(params: ChatParams): Promise<ChatResult> {
  const providers = resolveProviders(params.models);
  if (providers.length === 0) throw new Error("ai_chat_not_configured");

  const failures: string[] = [];

  for (const provider of providers) {
    try {
      return {
        message: await callProvider(provider, params),
        provider: provider.id,
        model: provider.model,
      };
    } catch (e) {
      const reason = (e as Error).message;
      failures.push(`${provider.id}: ${reason}`);
      // Not fatal on its own — the next provider in the chain may answer.
      console.error(`[ai/chat] provider "${provider.id}" failed: ${reason}`);
    }
  }

  throw new Error(`ai_chat_all_providers_failed — ${failures.join(" | ")}`);
}

// ─── Internal ────────────────────────────────────────────────────────────────

async function callProvider(
  provider: ResolvedProvider,
  params: ChatParams,
): Promise<ChatMessage> {
  const body: Record<string, unknown> = {
    model: provider.model,
    messages: params.messages,
  };
  if (params.tools) body.tools = params.tools;
  if (typeof params.temperature === "number") body.temperature = params.temperature;
  if (typeof params.maxTokens === "number") body.max_tokens = params.maxTokens;
  if (params.jsonObject) body.response_format = { type: "json_object" };

  const res = await fetch(provider.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = (await res.json()) as { choices?: Array<{ message?: ChatMessage }> };
  const message = data.choices?.[0]?.message;
  if (!message) throw new Error("malformed response: no choices[0].message");

  return message;
}
