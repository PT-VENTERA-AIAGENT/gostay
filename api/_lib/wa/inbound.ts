// Testable WhatsApp inbound helpers, kept separate from the HTTP route.
//
// Mirrors the split in api/_lib/exchange.ts: all logic that can be unit-tested
// lives here with no HTTP concerns, while api/wa/inbound.ts stays a thin Vercel
// handler. The wire contract is wa-ventera's forwardIncoming():
//   POST { sessionId, receivedAt, messages: WAMessage[] }, header x-webhook-secret
// See plans/whatsapp-ai-booking.md, Fase 0.

import { timingSafeEqual } from "node:crypto";
import { serviceConfig, serviceGet, serviceHeaders, serviceInsert } from "./client";

// ─── Secret verification ─────────────────────────────────────────────────────

/**
 * Constant-time compare of the `x-webhook-secret` header against
 * WA_WEBHOOK_SECRET.
 *
 * Fails closed: a missing/empty configured secret, or a missing/length-
 * mismatched header, returns false rather than letting an unauthenticated
 * caller through. timingSafeEqual requires equal-length buffers, so the length
 * check both guards the call and avoids leaking length via early return timing
 * (the header length is attacker-controlled either way).
 */
export function verifySecret(headerValue: string | undefined): boolean {
  const expected = serviceConfig().webhookSecret;
  if (!expected) return false;
  if (typeof headerValue !== "string" || headerValue.length === 0) return false;

  const a = Buffer.from(headerValue);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ─── Parsing ─────────────────────────────────────────────────────────────────

export interface ParsedMessage {
  /** Baileys message id — the idempotency key (unique in wa_inbound_messages). */
  waMessageId: string;
  /** Sender JID, e.g. "628123...@s.whatsapp.net". Empty when absent. */
  phoneJid: string;
  /** Extracted text; "" for non-text or empty messages. */
  text: string;
  /** True for our own outbound echo — callers MUST skip these (feedback loop). */
  fromMe: boolean;
  /** The sender's WhatsApp display name (pushName), when the gateway sends it. */
  pushName?: string;
  /**
   * When WhatsApp says the message was sent, in epoch milliseconds. Undefined
   * when the gateway omits it. Drives the history-sync guard (see shouldAutoReply):
   * on a freshly-linked session Baileys replays the guest's whole backlog, and
   * these carry OLD timestamps — that's how we tell them from a live message.
   */
  timestamp?: number;
  /** The original message object, stored verbatim in wa_inbound_messages.raw. */
  raw: unknown;
}

interface WAMessageKey {
  remoteJid?: string;
  fromMe?: boolean;
  id?: string;
}

interface WAMessage {
  key?: WAMessageKey;
  pushName?: string;
  /** Baileys sends epoch SECONDS — as a number, a numeric string, or a Long. */
  messageTimestamp?: number | string | { low?: number };
  message?: {
    conversation?: string;
    extendedTextMessage?: { text?: string };
  };
}

interface InboundBody {
  sessionId?: string;
  receivedAt?: string;
  messages?: WAMessage[];
}

/**
 * True only for a one-to-one guest chat.
 *
 * WhatsApp group (`@g.us`), broadcast/status (`@broadcast`) and channel
 * (`@newsletter`) JIDs must never be auto-answered: the booking bot replying
 * inside a group posts its welcome/room-list to everyone in it — the "kok spam
 * grup" report. Individual chats use `@s.whatsapp.net`, the legacy `@c.us`, or
 * WhatsApp's privacy alias `@lid`. We whitelist those rather than blacklist the
 * group suffixes so any unfamiliar multi-recipient JID also stays silent.
 */
export function isDirectChat(jid: string): boolean {
  const at = jid.lastIndexOf("@");
  if (at < 0) return false;
  const server = jid.slice(at + 1).toLowerCase();
  return server === "s.whatsapp.net" || server === "c.us" || server === "lid";
}

/** The session id (hotel selector) from the request body, "" when absent. */
export function sessionIdOf(body: unknown): string {
  const b = (body ?? {}) as InboundBody;
  return typeof b.sessionId === "string" ? b.sessionId : "";
}

/** The gateway's receivedAt timestamp, when present. */
export function receivedAtOf(body: unknown): string | undefined {
  const b = (body ?? {}) as InboundBody;
  return typeof b.receivedAt === "string" ? b.receivedAt : undefined;
}

/**
 * Flattens the inbound payload into ParsedMessage[].
 *
 * Text comes from `message.conversation`, falling back to
 * `message.extendedTextMessage.text`, per the wa-ventera contract. The `fromMe`
 * flag is carried through rather than filtered here: the route skips it, and
 * keeping it makes the skip visible and testable.
 */
export function parseMessages(body: unknown): ParsedMessage[] {
  const b = (body ?? {}) as InboundBody;
  const messages = Array.isArray(b.messages) ? b.messages : [];

  return messages.map((m) => {
    const key = m?.key ?? {};
    const text =
      m?.message?.conversation ?? m?.message?.extendedTextMessage?.text ?? "";
    return {
      waMessageId: typeof key.id === "string" ? key.id : "",
      phoneJid: typeof key.remoteJid === "string" ? key.remoteJid : "",
      text,
      fromMe: key.fromMe === true,
      pushName: typeof m?.pushName === "string" ? m.pushName : undefined,
      timestamp: toEpochMs(m?.messageTimestamp),
      raw: m,
    };
  });
}

// ─── History-sync guard ──────────────────────────────────────────────────────

/**
 * Messages older than this (relative to the gateway's receivedAt, or our clock
 * when it's absent) are treated as backlog and are NEVER auto-answered.
 *
 * On a freshly-linked WhatsApp session Baileys replays the guest's whole message
 * history to the gateway, which forwards it here. Answering that backlog fired
 * the greeting once per old message — the burst of identical "Asisten Reservasi"
 * replies that risks a WhatsApp ban. Live messages arrive within seconds of being
 * sent, so a few-minute window keeps genuine (even slightly delayed) traffic while
 * silencing history. Overridable via WA_MAX_AUTO_REPLY_AGE_MS for tuning.
 */
const DEFAULT_MAX_AUTO_REPLY_AGE_MS = 5 * 60 * 1000;

export function maxAutoReplyAgeMs(): number {
  const raw = Number(process.env.WA_MAX_AUTO_REPLY_AGE_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_AUTO_REPLY_AGE_MS;
}

/**
 * Normalise a Baileys `messageTimestamp` to epoch milliseconds.
 *
 * Baileys sends epoch SECONDS as a number, a numeric string, or a protobuf Long
 * (`{ low, high }` — real timestamps fit in `low`). Values already large enough
 * to be milliseconds are passed through so a gateway that pre-converts still works.
 * Returns undefined for anything unparseable.
 */
export function toEpochMs(v: unknown): number | undefined {
  let seconds: number | undefined;
  if (typeof v === "number" && Number.isFinite(v)) seconds = v;
  else if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) {
    seconds = Number(v);
  } else if (v && typeof v === "object" && typeof (v as { low?: unknown }).low === "number") {
    seconds = (v as { low: number }).low;
  }
  if (seconds === undefined || seconds <= 0) return undefined;
  // >1e12 is already milliseconds (seconds since 1970 won't reach that until ~33000 AD).
  return seconds > 1e12 ? seconds : seconds * 1000;
}

/**
 * Should we auto-answer this message, or is it replayed history?
 *
 * Compares the message's own send time against the gateway's `receivedAt` (its
 * forward time), falling back to `nowMs` when receivedAt is absent/unparseable.
 * A message forwarded live has an age near zero; a backlog message replayed at
 * link-time is minutes-to-days old.
 *
 * Fails OPEN: with no timestamp we answer (never silence a working bot over a
 * field the gateway might not send). Future-dated messages (clock skew) count as
 * fresh. `nowMs` is injectable so the route and tests stay deterministic.
 */
export function shouldAutoReply(
  timestamp: number | undefined,
  receivedAt: string | undefined,
  nowMs: number,
): boolean {
  if (timestamp === undefined) return true; // fail open — see doc comment.
  const refParsed = receivedAt ? Date.parse(receivedAt) : NaN;
  const reference = Number.isFinite(refParsed) ? refParsed : nowMs;
  const age = reference - timestamp;
  if (age <= 0) return true; // sent now or (skew) in the future.
  return age <= maxAutoReplyAgeMs();
}

// ─── Per-number reply throttle ───────────────────────────────────────────────

/**
 * Second line of defence behind the history-sync guard: cap how many auto-replies
 * one number can pull in a short window. If a backlog ever slips past the freshness
 * check (e.g. a gateway that strips messageTimestamp), this bounds the blast radius
 * to a handful of replies instead of a full-history spam burst — the thing that
 * risks a WhatsApp ban. Generous enough that a real guest typing quickly is never
 * throttled. Both overridable via env for tuning without a redeploy.
 */
const DEFAULT_REPLY_MAX = 8;
const DEFAULT_REPLY_WINDOW = "1 minute";

function replyMax(): number {
  const raw = Number(process.env.WA_REPLY_MAX);
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_REPLY_MAX;
}

function replyWindow(): string {
  const raw = process.env.WA_REPLY_WINDOW;
  return typeof raw === "string" && raw.trim() !== "" ? raw : DEFAULT_REPLY_WINDOW;
}

/**
 * True if we're still under this number's reply budget (and records the reply).
 *
 * Reuses the check_wa_rate_limit RPC but under a `reply:` namespace so it keeps a
 * SEPARATE counter from guest provisioning (which keys on the bare JID) — a chatty
 * booking must not eat into the once-per-guest provisioning budget, or vice-versa.
 *
 * FAILS OPEN: an unconfigured service or a limiter error returns true. This is a
 * safety net, not a gate — never wedge a working bot because the throttle hiccuped
 * (the freshness guard is the primary protection). Errors are logged by the caller.
 */
export async function checkReplyRateLimit(phoneJid: string): Promise<boolean> {
  const { url, serviceKey } = serviceConfig();
  if (!url || !serviceKey) return true;

  let res: Response;
  try {
    res = await fetch(`${url}/rest/v1/rpc/check_wa_rate_limit`, {
      method: "POST",
      headers: serviceHeaders(serviceKey),
      body: JSON.stringify({
        p_phone: `reply:${phoneJid}`,
        p_max: replyMax(),
        p_window: replyWindow(),
      }),
    });
  } catch {
    return true; // network error → fail open.
  }
  if (!res.ok) return true; // limiter error → fail open.
  // A scalar-returning RPC comes back as a bare JSON boolean.
  return (await res.json().catch(() => true)) === true;
}

// ─── Greeting cooldown ───────────────────────────────────────────────────────

/**
 * Allow at most ONE welcome greeting per number per window.
 *
 * The greeting is the fallback for a non-booking message, and it sets no pending
 * state — so absent this guard, a burst (offline-queue replay, or a number that
 * echoes our messages back into a loop — "spam ke nomor sendiri") fires one
 * greeting per message. Returns true only the first time in the window, false
 * after. Separate `greet:` namespace so it never shares the reply/provisioning
 * counters. Window overridable via WA_GREET_COOLDOWN.
 *
 * FAILS OPEN (returns true) when unconfigured or the limiter errors — a hiccup
 * must never permanently mute the hotel's first hello.
 */
const DEFAULT_GREET_COOLDOWN = "1 hour";

function greetCooldown(): string {
  const raw = process.env.WA_GREET_COOLDOWN;
  return typeof raw === "string" && raw.trim() !== "" ? raw : DEFAULT_GREET_COOLDOWN;
}

export async function checkGreetCooldown(phoneJid: string): Promise<boolean> {
  const { url, serviceKey } = serviceConfig();
  if (!url || !serviceKey) return true;

  let res: Response;
  try {
    res = await fetch(`${url}/rest/v1/rpc/check_wa_rate_limit`, {
      method: "POST",
      headers: serviceHeaders(serviceKey),
      body: JSON.stringify({
        p_phone: `greet:${phoneJid}`,
        p_max: 1,
        p_window: greetCooldown(),
      }),
    });
  } catch {
    return true;
  }
  if (!res.ok) return true;
  return (await res.json().catch(() => true)) === true;
}

// ─── Tenant resolution ───────────────────────────────────────────────────────

/**
 * Maps a wa-ventera sessionId to its hotel's tenant_id.
 *
 * The tenant is derived ONLY from the sessionId (the destination number), never
 * from the sender — see the anti-patterns in Fase 0. Returns null for an
 * unknown or inactive session; the caller then stays silent (anti-spam) but
 * still answers the gateway 200.
 */
export async function resolveTenant(sessionId: string): Promise<string | null> {
  if (!sessionId) return null;
  const res = await serviceGet(
    `wa_hotel_sessions?session_id=eq.${encodeURIComponent(sessionId)}` +
      `&is_active=eq.true&select=tenant_id`,
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ tenant_id?: string }>;
  return rows[0]?.tenant_id ?? null;
}

// ─── Idempotency ─────────────────────────────────────────────────────────────

export interface InboundRecord {
  waMessageId: string;
  sessionId: string;
  phoneJid: string;
  receivedAt?: string;
  raw?: unknown;
}

/**
 * Records an inbound message, using the unique `wa_message_id` as an
 * idempotency key.
 *
 * A retried delivery hits the unique constraint (Postgres 23505), which
 * PostgREST surfaces as HTTP 409 — reported as 'duplicate' so the caller skips
 * re-processing rather than treating it as an error. Any other non-OK status is
 * a genuine failure and throws; the route swallows it and still answers 200 so
 * the gateway does not retry-storm.
 */
export async function recordInbound(
  msg: InboundRecord,
): Promise<"recorded" | "duplicate"> {
  const res = await serviceInsert("wa_inbound_messages", {
    wa_message_id: msg.waMessageId,
    session_id: msg.sessionId,
    phone_jid: msg.phoneJid,
    ...(msg.receivedAt ? { received_at: msg.receivedAt } : {}),
    ...(msg.raw !== undefined ? { raw: msg.raw } : {}),
  });

  if (res.ok) return "recorded";
  if (res.status === 409) return "duplicate";

  // Some PostgREST configurations may not map 23505 to 409; check the body too.
  const code = await safeErrorCode(res);
  if (code === "23505") return "duplicate";

  throw new Error(`wa_inbound_insert_failed_${res.status}`);
}

/** The Postgres error `code` from a PostgREST error body, when parseable. */
async function safeErrorCode(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as { code?: unknown };
    return typeof body.code === "string" ? body.code : null;
  } catch {
    return null;
  }
}
