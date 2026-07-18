// Confirm-before-write state for the WhatsApp booking flow (plan:
// whatsapp-ai-booking, Fase 5). One pending action per (tenant, phone) — the
// UNIQUE(tenant_id, phone_jid) constraint on wa_pending_actions enforces it — so
// a guest only ever has a single conversation-in-progress with a hotel.
//
// Two kinds live here:
//   - "collecting"      — slots gathered so far, while we still need more
//                         (check-in/out, guests) before we can quote.
//   - "confirm_booking" — a fully-priced quote awaiting the guest's "YA".
//
// Service-role only, same raw-PostgREST path as the rest of api/_lib/wa (see
// client.ts on why not @supabase/supabase-js). Rows carry an expires_at so an
// abandoned conversation cannot be resurrected days later with a stale price.

import { serviceConfig, serviceGet, serviceHeaders } from "./client";

export interface PendingAction {
  kind: "collecting" | "confirm_booking";
  payload: Record<string, unknown>;
}

const DEFAULT_TTL_MINUTES = 30;

/**
 * The live pending action for a (tenant, phone), or null.
 *
 * An expired row is treated as absent AND deleted opportunistically, so the DB
 * does not accumulate dead conversations and the guest starts fresh.
 */
export async function getPending(
  tenantId: string,
  phoneJid: string,
): Promise<PendingAction | null> {
  const res = await serviceGet(
    `wa_pending_actions?tenant_id=eq.${encodeURIComponent(tenantId)}` +
      `&phone_jid=eq.${encodeURIComponent(phoneJid)}` +
      `&select=kind,payload,expires_at&limit=1`,
  );
  if (!res.ok) throw new Error(`wa_pending_lookup_${res.status}`);
  const rows = (await res.json()) as Array<{
    kind: PendingAction["kind"];
    payload: Record<string, unknown> | null;
    expires_at: string | null;
  }>;
  const row = rows[0];
  if (!row) return null;

  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    // Stale: drop it and behave as if there were nothing pending.
    await clearPending(tenantId, phoneJid);
    return null;
  }
  return { kind: row.kind, payload: row.payload ?? {} };
}

/**
 * Upsert the pending action for a (tenant, phone). Overwrites any prior one —
 * the newest turn always wins — and stamps a fresh expiry.
 *
 * Uses a PostgREST upsert (POST + on_conflict + resolution=merge-duplicates)
 * keyed on the table's (tenant_id, phone_jid) unique index.
 */
export async function setPending(
  tenantId: string,
  phoneJid: string,
  kind: PendingAction["kind"],
  payload: Record<string, unknown>,
  ttlMinutes = DEFAULT_TTL_MINUTES,
): Promise<void> {
  const { url, serviceKey } = serviceConfig();
  if (!url || !serviceKey) throw new Error("wa_service_not_configured");

  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();
  const res = await fetch(
    `${url}/rest/v1/wa_pending_actions?on_conflict=tenant_id,phone_jid`,
    {
      method: "POST",
      headers: { ...serviceHeaders(serviceKey), Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        tenant_id: tenantId,
        phone_jid: phoneJid,
        kind,
        payload,
        expires_at: expiresAt,
      }),
    },
  );
  if (!res.ok) throw new Error(`wa_pending_upsert_${res.status}`);
}

/** Delete the pending action for a (tenant, phone). Idempotent. */
export async function clearPending(tenantId: string, phoneJid: string): Promise<void> {
  const { url, serviceKey } = serviceConfig();
  if (!url || !serviceKey) throw new Error("wa_service_not_configured");

  const res = await fetch(
    `${url}/rest/v1/wa_pending_actions?tenant_id=eq.${encodeURIComponent(tenantId)}` +
      `&phone_jid=eq.${encodeURIComponent(phoneJid)}`,
    { method: "DELETE", headers: serviceHeaders(serviceKey) },
  );
  // 404/no-match is fine; only a real error is worth surfacing.
  if (!res.ok && res.status !== 404) throw new Error(`wa_pending_delete_${res.status}`);
}
