// Reset the WhatsApp conversation state for a staff-selected chat.
//
// This deliberately does not delete the thread, messages, guest identity, or
// bookings. It only clears the short-lived automation state that can make the
// bot stay quiet: the pending booking action and the per-number rate-limit
// counters (including the one-hour greeting cooldown).

import { requireTenantMember } from "../_lib/admin/tenant-auth";
import { authHeader, readJson, type VercelReq, type VercelRes } from "../_lib/admin/http";
import { serviceConfig, serviceGet, serviceHeaders } from "../_lib/wa/client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ThreadRow = { customer_id?: string };
type CustomerRow = { tenant_id?: string };
type IdentityRow = { phone_jid?: string };

async function getOne<T>(path: string): Promise<T | null> {
  const response = await serviceGet(path);
  if (!response.ok) throw new Error(`lookup_${response.status}`);
  const rows = (await response.json()) as T[];
  return rows[0] ?? null;
}

async function deleteRows(table: string, filters: Record<string, string>): Promise<void> {
  const { url, serviceKey } = serviceConfig();
  if (!url || !serviceKey) throw new Error("wa_service_not_configured");
  const query = Object.entries(filters)
    .map(([key, value]) => `${key}=eq.${encodeURIComponent(value)}`)
    .join("&");
  const response = await fetch(`${url}/rest/v1/${table}?${query}`, {
    method: "DELETE",
    headers: { ...serviceHeaders(serviceKey), Prefer: "return=minimal" },
  });
  if (!response.ok) throw new Error(`delete_${table}_${response.status}`);
}

export default async function handler(req: VercelReq, res: VercelRes) {
  res.setHeader("Cache-Control", "no-store");
  if ((req.method ?? "GET") !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const threadId = readJson(req).threadId;
  if (typeof threadId !== "string" || !UUID_RE.test(threadId)) {
    res.status(400).json({ ok: false, error: "thread_id_required" });
    return;
  }

  try {
    const thread = await getOne<ThreadRow>(
      `chat_threads?id=eq.${encodeURIComponent(threadId)}&select=customer_id&limit=1`,
    );
    if (!thread?.customer_id) {
      res.status(404).json({ ok: false, error: "thread_not_found" });
      return;
    }

    const customer = await getOne<CustomerRow>(
      `customers?id=eq.${encodeURIComponent(thread.customer_id)}&select=tenant_id&limit=1`,
    );
    if (!customer?.tenant_id) {
      res.status(404).json({ ok: false, error: "customer_not_found" });
      return;
    }

    // The requested tenant is taken from the thread, while the guard ensures
    // staff can only reset chats belonging to their own hotel.
    const guard = await requireTenantMember(authHeader(req), customer.tenant_id);
    if (guard.ok === false) {
      res.status(guard.status).json({ ok: false, error: guard.error });
      return;
    }

    const identitiesResponse = await serviceGet(
      `wa_guest_identities?tenant_id=eq.${encodeURIComponent(customer.tenant_id)}` +
        `&customer_id=eq.${encodeURIComponent(thread.customer_id)}&select=phone_jid`,
    );
    if (!identitiesResponse.ok) throw new Error(`identity_lookup_${identitiesResponse.status}`);
    const identities = (await identitiesResponse.json()) as IdentityRow[];
    const phoneJids = [...new Set(identities.map((row) => row.phone_jid).filter((v): v is string => Boolean(v)))];

    // A customer may have more than one historical WA identity. Reset all of
    // them so the selected thread cannot remain stuck on an older JID.
    for (const phoneJid of phoneJids) {
      await deleteRows("wa_pending_actions", { tenant_id: customer.tenant_id, phone_jid: phoneJid });
      for (const key of [phoneJid, `greet:${phoneJid}`, `reply:${phoneJid}`]) {
        await deleteRows("wa_rate_limits", { phone_jid: key });
      }
    }

    res.status(200).json({ ok: true, phoneJids, resetCount: phoneJids.length });
  } catch (error) {
    console.error("[wa/reset-chat]", error);
    res.status(500).json({ ok: false, error: "reset_failed" });
  }
}
