// Webhook receiver for WA replies FROM leads (hotel owners) TO GoStay sales bot.
// This is separate from api/wa/inbound.ts (hotel guest → hotel bot).
// wa-ventera POSTs here when the GoStay sales session receives a message.
//
// Config in wa-ventera: WEBHOOK_ROUTES[WA_OUTBOUND_SESSION_ID] = this URL.
// Secret: WA_OUTBOUND_WEBHOOK_SECRET (separate from the booking bot secret).

import { timingSafeEqual } from "node:crypto";
import { serviceConfig, serviceGet, serviceInsert } from "../../_lib/wa/client";
import {
  parseMessages,
  isDirectChat,
  sessionIdOf,
  receivedAtOf,
} from "../../_lib/wa/inbound";
import { handleLeadConversation } from "./converse";

function outboundSession() {
  return (process.env.WA_OUTBOUND_SESSION_ID ?? "").trim();
}

function verifyOutboundSecret(header: string | undefined): boolean {
  const expected = process.env.WA_OUTBOUND_WEBHOOK_SECRET;
  if (!expected) return false;
  if (typeof header !== "string" || header.length === 0) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function normalizePhone(jid: string): string {
  // "628123456789@s.whatsapp.net" → "628123456789"
  return jid.split("@")[0].replace(/\D/g, "");
}

async function resolveLead(phoneJid: string): Promise<{
  id: string; business_name: string; city?: string; category?: string;
  rating?: number; booking_price_min?: number; status: string;
} | null> {
  const phone = normalizePhone(phoneJid);
  if (!phone) return null;

  const res = await serviceGet(
    `outbound_leads?phone_wa=eq.${encodeURIComponent(phone)}&select=*&limit=1`,
  );
  if (!res.ok) return null;
  const rows = await res.json() as Array<{
    id: string; business_name: string; city?: string; category?: string;
    rating?: number; booking_price_min?: number; status: string;
  }>;
  return rows[0] ?? null;
}

export default async function handler(
  req: { method?: string; headers: Record<string, string | string[] | undefined>; body?: unknown },
  res: { status: (n: number) => { json: (b: unknown) => void; end: () => void }; json?: never },
) {
  // Always 200 — wa-ventera will retry on anything else, causing message storms.
  const ok = () => res.status(200).end();

  if (req.method !== "POST") return ok();

  const secret = Array.isArray(req.headers["x-webhook-secret"])
    ? req.headers["x-webhook-secret"][0]
    : req.headers["x-webhook-secret"];

  if (!verifyOutboundSecret(secret)) return ok();

  const { url: sbUrl, serviceKey } = serviceConfig();
  if (!sbUrl || !serviceKey) return ok();

  const expectedSession = outboundSession();
  const sessionId = sessionIdOf(req.body);
  if (!sessionId || sessionId !== expectedSession) return ok();

  const messages = parseMessages(req.body);

  for (const msg of messages) {
    if (msg.fromMe) continue;
    if (!isDirectChat(msg.phoneJid)) continue;
    if (!msg.text) continue;

    // Resolve which lead this phone belongs to first (need lead_id for idempotency row)
    const lead = await resolveLead(msg.phoneJid);
    if (!lead) continue; // unknown number — ignore

    // Idempotency: skip already-processed inbound messages using wa_message_id unique constraint
    if (msg.waMessageId) {
      const dedup = await serviceInsert("outbound_wa_conversations", {
        lead_id: lead.id,
        phone_jid: msg.phoneJid,
        direction: "inbound",
        message: msg.text,
        wa_message_id: msg.waMessageId,
        sent_at: receivedAtOf(req.body) ?? new Date().toISOString(),
      }).catch((e: { status?: number }) => e as { status: number });

      if ((dedup as { status: number }).status === 409) continue;
    }

    // Ignore leads we've already closed or that are paying customers
    if (lead.status === "not_interested" || lead.status === "paying") continue;

    // Let Claude handle the conversation (logs conversation internally)
    await handleLeadConversation(lead, msg.phoneJid, msg.text, sessionId).catch(() => {});
  }

  return ok();
}
