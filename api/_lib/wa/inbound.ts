// Testable WhatsApp inbound helpers, kept separate from the HTTP route.
//
// Mirrors the split in api/_lib/exchange.ts: all logic that can be unit-tested
// lives here with no HTTP concerns, while api/wa/inbound.ts stays a thin Vercel
// handler. The wire contract is wa-ventera's forwardIncoming():
//   POST { sessionId, receivedAt, messages: WAMessage[] }, header x-webhook-secret
// See plans/whatsapp-ai-booking.md, Fase 0.

import { timingSafeEqual } from "node:crypto";
import { serviceConfig, serviceGet, serviceInsert } from "./client";

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
      raw: m,
    };
  });
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
