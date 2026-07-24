// Vercel Node function: WhatsApp inbound webhook from wa-ventera.
//
// Thin HTTP shell over api/_lib/wa/inbound.ts (same split as api/sso/token.ts
// over api/_lib/exchange.ts). This is Fase 3 — the skeleton: receive → auth →
// idempotency → resolve tenant → parse. Guest provisioning, AI intent and
// booking creation are Fase 4/5 and hook in where marked below.
//
// Retry policy: this handler answers 200 to the gateway for everything except
// an auth failure (401). A 5xx would make wa-ventera retry-storm the same
// payload; the unique wa_message_id (idempotency) covers the retries we cannot
// avoid.

import {
  verifySecret,
  parseMessages,
  resolveTenant,
  recordInbound,
  sessionIdOf,
  receivedAtOf,
  isDirectChat,
  shouldAutoReply,
  checkReplyRateLimit,
} from "../_lib/wa/inbound";
import { handleGuestMessage } from "../_lib/wa/converse";

interface VercelRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface VercelResponse {
  status: (code: number) => VercelResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
}

function headerValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  // Auth is the ONLY thing that answers non-200: reject an unauthenticated
  // caller with 401. Everything past this point returns 200 (see file header).
  if (!verifySecret(headerValue(req.headers["x-webhook-secret"]))) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const body = typeof req.body === "string" ? safeJson(req.body) : req.body;
  const sessionId = sessionIdOf(body);
  const receivedAt = receivedAtOf(body);
  const messages = parseMessages(body);

  try {
    for (const msg of messages) {
      // Never react to our own outbound echo — that would feedback-loop.
      if (msg.fromMe) continue;
      // A message with no id or sender is unusable (and cannot be deduped).
      if (!msg.waMessageId || !msg.phoneJid) continue;
      // Only ever answer one-to-one guest chats. Group/broadcast/channel JIDs
      // are dropped here — answering them spams every member ("kok spam grup").
      // Dropped before recordInbound so group traffic leaves no inbound rows.
      if (!isDirectChat(msg.phoneJid)) continue;

      // Idempotency first: a duplicate delivery is dropped before any work.
      const seen = await recordInbound({
        waMessageId: msg.waMessageId,
        sessionId,
        phoneJid: msg.phoneJid,
        receivedAt,
        raw: msg.raw,
      });
      if (seen === "duplicate") continue;

      // History-sync guard: a freshly-linked session replays the guest's whole
      // backlog. We RECORD those (above, for idempotency/audit) but must NOT
      // auto-answer them — replying to old messages spams the greeting and risks
      // a WhatsApp ban. Only messages that arrived in real time get a reply.
      if (!shouldAutoReply(msg.timestamp, receivedAt, Date.now())) continue;

      // Tenant comes ONLY from the sessionId (destination), never the sender.
      const tenantId = await resolveTenant(sessionId);
      if (!tenantId) continue; // unknown/inactive session → stay silent (anti-spam)

      // Second anti-spam layer: cap replies per number in a short window. If a
      // backlog ever slips past the freshness guard, this bounds it to a few
      // replies instead of a ban-inducing burst. Fails open — never wedges the bot.
      if (!(await checkReplyRateLimit(msg.phoneJid))) continue;

      // Hand the message to the booking conversation (Fase 5). It runs the whole
      // state machine — intent → collect → quote → confirm → provision + book —
      // and answers the guest itself. It never throws to us; any failure is
      // logged and softly apologised for inside, so the 200 below is safe.
      await handleGuestMessage({
        tenantId,
        sessionId,
        phoneJid: msg.phoneJid,
        replyJid: msg.replyJid,
        text: msg.text,
        displayName: msg.pushName,
      });
    }
  } catch (err) {
    // Deliberately swallowed: log and still answer 200 so the gateway does not
    // retry-storm. Idempotency makes a later retry safe if we do want one.
    console.error("[wa/inbound] processing error:", (err as Error).message);
  }

  res.status(200).json({ ok: true });
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
