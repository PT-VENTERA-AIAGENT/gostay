// Delivering a staff reply to WhatsApp.
//
// The inbox looked like it worked. Staff typed, the message appeared in the
// thread, and the tick marks rendered — but sendMessage only ever inserted a
// row into chat_messages. Nothing carried it to the gateway, so the guest never
// received a word of it. Staff had no way to tell: the console showed their
// message sitting there exactly as if it had been delivered.
//
// This is the missing half. It also takes the conversation off the bot, because
// a human typing into a thread IS the handoff — expecting them to find and flip
// a separate switch first is expecting them to remember something the software
// can infer.

import { serviceGet } from "./client";
import { sendText } from "./send";
import { pauseBot } from "./takeover";

export interface StaffReplyResult {
  ok: boolean;
  error?: string;
  /** The JID the message went to, for logging. */
  jid?: string;
}

interface ThreadRow {
  id: string;
  tenant_id: string;
  customer_id: string | null;
  customers: { phone: string | null } | null;
}

/**
 * The WhatsApp address for a thread's guest, and the hotel's session.
 *
 * Prefers the JID the guest actually messaged from (wa_guest_identities), and
 * falls back to the phone on the customer record. The two differ when WhatsApp
 * addressed the chat by LID — a privacy alias that is not a phone number — and
 * replying to the wrong one silently goes nowhere.
 */
async function resolveDestination(
  tenantId: string,
  customerId: string,
): Promise<{ jid: string; sessionId: string } | null> {
  const [identityRes, sessionRes] = await Promise.all([
    serviceGet(
      `wa_guest_identities?tenant_id=eq.${encodeURIComponent(tenantId)}` +
        `&customer_id=eq.${encodeURIComponent(customerId)}&select=phone_jid&limit=1`,
    ),
    serviceGet(
      `wa_hotel_sessions?tenant_id=eq.${encodeURIComponent(tenantId)}` +
        `&is_active=eq.true&select=session_id&limit=1`,
    ),
  ]);

  if (!sessionRes.ok) return null;
  const sessions = (await sessionRes.json()) as Array<{ session_id: string }>;
  const sessionId = sessions[0]?.session_id;
  if (!sessionId) return null;

  if (identityRes.ok) {
    const rows = (await identityRes.json()) as Array<{ phone_jid: string }>;
    if (rows[0]?.phone_jid) return { jid: rows[0].phone_jid, sessionId };
  }

  // No WhatsApp identity: this guest reached the hotel some other way (the web
  // portal), so there is nothing to deliver to.
  return null;
}

/**
 * Send a staff message to the guest over WhatsApp.
 *
 * Returns ok:false with a reason rather than throwing — the message is already
 * saved, and the caller's job is to tell staff whether it actually left the
 * building, not to undo the insert.
 */
export async function deliverStaffReply(params: {
  threadId: string;
  text: string;
  /** Pause the bot so it does not talk over the human. Default true. */
  takeover?: boolean;
}): Promise<StaffReplyResult> {
  const body = (params.text ?? "").trim();
  if (!body) return { ok: false, error: "empty_message" };

  try {
    const res = await serviceGet(
      `chat_threads?id=eq.${encodeURIComponent(params.threadId)}` +
        `&select=id,tenant_id,customer_id,customers(phone)&limit=1`,
    );
    if (!res.ok) return { ok: false, error: `thread_lookup_${res.status}` };

    const rows = (await res.json()) as ThreadRow[];
    const thread = rows[0];
    if (!thread) return { ok: false, error: "thread_not_found" };
    if (!thread.customer_id) return { ok: false, error: "thread_has_no_guest" };

    const dest = await resolveDestination(thread.tenant_id, thread.customer_id);
    if (!dest) return { ok: false, error: "guest_not_on_whatsapp" };

    const sent = await sendText(dest.sessionId, dest.jid, body);
    if (!sent.ok) return { ok: false, error: sent.error ?? "send_failed", jid: dest.jid };

    // A human just spoke. Silence the bot so it does not answer the guest's
    // next message over them. Best-effort: the reply is already delivered, and
    // failing to pause is not a reason to report the send as failed.
    if (params.takeover !== false) await pauseBot(params.threadId);

    return { ok: true, jid: dest.jid };
  } catch (e) {
    return { ok: false, error: `exception: ${(e as Error).message}` };
  }
}
