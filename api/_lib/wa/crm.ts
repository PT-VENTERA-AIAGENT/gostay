// Surface a WhatsApp conversation in GoStay's native Messages + CRM.
//
// GoStay's chat has no channel column: a message is "from the guest" when its
// chat_messages.sender_id equals the thread's customers.profile_id, and "from
// staff/bot" otherwise. So a WA conversation needs:
//   - the guest as a real customers row with a profile_id (done by guest.ts), so
//     they show in CRM Tamu and their messages render on the guest side;
//   - a chat_threads row for that customer;
//   - one chat_messages row per WA message — inbound as the guest's profile_id
//     (is_read=false → lights the unread badge), outbound (bot replies) as a
//     dedicated per-tenant bot profile.
// Everything is service-role with tenant_id passed explicitly (the trg_set_tenant_id
// trigger can't resolve auth.uid() under the service role — see 016_wa_booking.sql).

import { profileIdFor } from "../identity";
import { serviceConfig, serviceHeaders, serviceGet, serviceInsert } from "./client";

/** A deterministic per-tenant "Asisten WhatsApp" profile that owns bot replies. */
export async function getOrCreateBotProfile(tenantId: string): Promise<string> {
  const sub = `wa-bot:${tenantId}`;
  const id = profileIdFor(sub);
  const found = await serviceGet(`profiles?id=eq.${encodeURIComponent(id)}&select=id`);
  if (found.ok && ((await found.json()) as unknown[]).length > 0) return id;
  // role 'staff' so replies render on the hotel side; it never logs in (Ventera
  // has no account for this synthetic sub).
  const ins = await serviceInsert("profiles", {
    id,
    sso_sub: sub,
    email: `wa-bot-${tenantId}@bot.gostay.local`,
    full_name: "Asisten WhatsApp",
    role: "staff",
    tenant_id: tenantId,
    is_active: true,
  });
  // 409 = a concurrent message created it first; fine.
  if (!ins.ok && ins.status !== 409) throw new Error(`wa_bot_profile_${ins.status}`);
  return id;
}

/** Reuse the customer's newest active thread, else open one. */
export async function getOrCreateThread(tenantId: string, customerId: string): Promise<string> {
  const found = await serviceGet(
    `chat_threads?customer_id=eq.${encodeURIComponent(customerId)}&status=eq.active` +
      `&order=updated_at.desc&limit=1&select=id`,
  );
  if (found.ok) {
    const rows = (await found.json()) as Array<{ id: string }>;
    if (rows[0]) return rows[0].id;
  }
  const ins = await serviceInsert(
    "chat_threads",
    { customer_id: customerId, tenant_id: tenantId, status: "active" },
    "return=representation",
  );
  if (!ins.ok) throw new Error(`wa_thread_${ins.status}`);
  const created = (await ins.json()) as Array<{ id: string }>;
  const id = created[0]?.id;
  if (!id) throw new Error("wa_thread_no_id");
  return id;
}

async function bumpThread(threadId: string): Promise<void> {
  const { url, serviceKey } = serviceConfig();
  if (!url || !serviceKey) return;
  await fetch(`${url}/rest/v1/chat_threads?id=eq.${encodeURIComponent(threadId)}`, {
    method: "PATCH",
    headers: serviceHeaders(serviceKey),
    body: JSON.stringify({ updated_at: new Date().toISOString() }),
  }).catch(() => {});
}

/**
 * Log a WA message into the thread. `fromGuest` decides the side:
 * inbound (guest) → sender_id = guest profile, is_read=false; outbound (bot) →
 * sender_id = bot profile, is_read=true. Bumps the thread so it sorts to the top.
 * Best-effort: a logging failure must never break the reply pipeline.
 */
export async function logMessage(
  tenantId: string,
  threadId: string,
  senderId: string,
  content: string,
  fromGuest: boolean,
): Promise<void> {
  try {
    const body = (content ?? "").trim();
    if (!body) return;
    await serviceInsert("chat_messages", {
      thread_id: threadId,
      sender_id: senderId,
      content: body,
      tenant_id: tenantId,
      is_read: !fromGuest,
    });
    await bumpThread(threadId);
  } catch (e) {
    console.error("[wa/crm] logMessage:", (e as Error).message);
  }
}
