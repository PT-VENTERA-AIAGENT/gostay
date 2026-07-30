// Resolve — or, for a first-time number, provision — the GoStay identity behind
// an inbound WhatsApp message (plan: whatsapp-ai-booking, Fase 4, "opsi B").
//
// A guest chats a hotel's WA number. Before a booking can be written we need a
// real GoStay identity for them: a Ventera SSO account (so the same person is
// consistent across web + WA), a `profiles` row, and a `customers` row — all
// filed under the hotel that owns the sessionId (passed in as tenantId; NEVER
// derived from the sender, who could be spoofed).
//
// This runs entirely service-role (see api/_lib/wa/client.ts on why we use the
// raw PostgREST path, not @supabase/supabase-js) and passes tenant_id
// explicitly on every write. It FAILS CLOSED: if the rate limit trips or
// Ventera is unreachable, it throws and the caller must NOT create a booking —
// far better a "please try again" than an orphaned booking with no owner.

import { profileIdFor } from "../identity";
import { provisionProfileWithTenant } from "../provision";
import { serviceConfig, serviceGet, serviceHeaders, serviceInsert, serviceUpdate } from "./client";

/**
 * Thrown when this number has provisioned too often in the window — the
 * check_wa_rate_limit RPC denied it. The caller should stay quiet / ask the
 * guest to slow down rather than mint another account.
 */
export class WaRateLimitError extends Error {
  constructor(message = "wa_rate_limited") {
    super(message);
    this.name = "WaRateLimitError";
  }
}

/**
 * Thrown when the guest could not be provisioned — Ventera down or refused, or
 * a service-role write failed. Fail-closed: the caller must not book on this.
 */
export class WaProvisionError extends Error {
  constructor(message = "wa_provision_failed") {
    super(message);
    this.name = "WaProvisionError";
  }
}

/**
 * The bare digits of a WhatsApp JID.
 *
 * Baileys addresses look like `628123456789@s.whatsapp.net`; Ventera's provision
 * endpoint and our `customers.phone` want just the E.164-ish digits. Strips the
 * server suffix and anything non-numeric (a `:device` part, `+`, spaces).
 */
/**
 * A number staff can actually dial, or null when we do not have one.
 *
 * Returns the alternate's digits for a LID-addressed chat, and the chat's own
 * digits otherwise. Null when neither is usable, so callers can tell "no phone"
 * apart from "a plausible-looking string that reaches nobody" — the failure this
 * exists to end.
 */
/**
 * A pushName worth showing to staff, or null.
 *
 * WhatsApp sometimes sends a placeholder rather than a name — "~" is the one
 * seen in production, and it landed in CRM as the guest's name. Anything with
 * no letter or digit in it is decoration, not a name, and the phone number is a
 * more useful thing to show than a tilde.
 */
export function usableName(pushName?: string): string | null {
  const n = (pushName ?? "").trim();
  if (!n) return null;
  return /[\p{L}\p{N}]/u.test(n) ? n : null;
}

export function callablePhone(phoneJid: string, replyJid?: string): string | null {
  const isLid = phoneJid.toLowerCase().includes("@lid");
  const candidate = isLid ? (replyJid ?? "") : phoneJid;
  const digits = phoneDigits(candidate);
  // A LID with no alternate yields nothing rather than its own digits: storing
  // those is precisely the bug.
  return digits.length >= 8 ? digits : null;
}

/**
 * Apakah angka ini benar-benar nomor telepon, jadi layak dikirim ke Ventera?
 *
 * Yang harus disingkirkan adalah angka sebuah LID: `callablePhone` mengembalikan
 * angka LID itu sendiri sebagai cadangan ketika WhatsApp tidak memberi nomor
 * pendamping, dan angka itu TERLIHAT seperti nomor (15 digit) padahal bukan.
 * Membandingkannya dengan angka LID-nya adalah satu-satunya cara membedakan.
 *
 * Panjang 8–15 mengikuti E.164; sebuah LID biasanya 15 digit, jadi panjang saja
 * tidak cukup — pembandingan dengan LID-nya lah yang menentukan.
 */
export function isProvisionablePhone(digits: string, phoneJid: string): boolean {
  if (digits.length < 8 || digits.length > 15) return false;
  if (phoneJid.toLowerCase().includes("@lid") && digits === phoneDigits(phoneJid)) {
    return false; // angka LID, bukan nomor telepon
  }
  return true;
}

export function phoneDigits(jid: string): string {
  // Strip ANY server suffix — @s.whatsapp.net, and also @lid (WhatsApp's privacy
  // "Linked ID" address, which is not a real phone number) — then keep digits.
  return jid.replace(/@.*$/i, "").replace(/\D/g, "");
}

// How many provisions one number may trigger before it's throttled. Generous
// enough for a normal guest (who provisions once), tight enough that a flood
// from one number can't mint accounts or burn Ventera quota.
const PROVISION_MAX = 5;
const PROVISION_WINDOW = "1 hour";

/** Read the Ventera provisioning endpoint lazily — same reasoning as config() in provision.ts. */
function venteraConfig(): { provisionUrl: string; provisionKey: string | undefined } {
  return {
    provisionUrl: (process.env.SSO_VENTERA_PROVISION_URL ?? "").replace(/\/$/, ""),
    provisionKey: process.env.PROVISION_API_KEY,
  };
}

interface IdentityRow {
  id: string;
  sso_sub: string | null;
  profile_id: string | null;
  customer_id: string | null;
}

/**
 * The GoStay identity for a WhatsApp number within one hotel, provisioning it on
 * first contact.
 *
 * @param phoneJid   the sender's Baileys JID, e.g. `628123@s.whatsapp.net`
 * @param tenantId   the hotel that owns the sessionId — resolved by the caller,
 *                   never from the sender
 * @param displayName the WhatsApp pushName, if any, used for the profile/customer
 * @throws WaRateLimitError  when this number has provisioned too often
 * @throws WaProvisionError  when Ventera or a service-role write fails (fail-closed)
 */
export async function resolveOrProvisionGuest(
  phoneJid: string,
  tenantId: string,
  displayName?: string,
  /**
   * The guest's REAL phone JID, when the chat is LID-addressed.
   *
   * A WhatsApp LID (`1812…@lid`) is a privacy alias, not a number — dialling its
   * digits reaches nobody. It is the right key for IDENTITY (it is stable), and
   * the wrong thing to store as a contact number, which is exactly what used to
   * happen: staff opened a guest in CRM and found an unreachable 15-digit
   * string. WhatsApp sends the real number alongside as `remoteJidAlt`, and the
   * webhook already parses it — it simply never reached this far.
   */
  replyJid?: string,
): Promise<{ profileId: string; customerId: string; ssoSub: string }> {
  const { url, serviceKey } = serviceConfig();
  if (!url || !serviceKey) throw new WaProvisionError("wa_service_not_configured");

  // Identity still keys on phoneJid; only the stored contact number prefers the
  // real one.
  const digits = phoneDigits(phoneJid);
  const contactDigits = callablePhone(phoneJid, replyJid) ?? digits;
  // The WhatsApp account label, kept apart from the name a booking is filed
  // under. Null when WhatsApp sent nothing usable — the digits fallback below is
  // fine as a display name but would be a lie as a "WhatsApp name".
  const pushName = usableName(displayName);
  const fullName = pushName ?? contactDigits;

  // 1. Already provisioned? A complete identity row short-circuits everything —
  //    no rate-limit consult, no Ventera call, no duplicate profile/customer.
  const existing = await lookupIdentity(tenantId, phoneJid);
  if (existing && existing.profile_id && existing.customer_id) {
    // An interrupted cleanup can leave the identity row pointing at deleted
    // profile/customer rows. Validate both references before short-circuiting;
    // otherwise CRM thread creation fails and the guest receives a generic
    // WhatsApp apology instead of being repaired automatically.
    if (await identityReferencesExist(tenantId, existing)) {
      // Self-heal the contact number. Guests provisioned before this stored a
      // LID's digits as their phone — a 15-digit string that reaches nobody —
      // and there is no way to derive the real number from a LID after the
      // fact. But WhatsApp sends it alongside every message, so the next one
      // repairs the record. That is cheaper and more reliable than a backfill
      // that could only guess.
      await repairContactPhone(existing.customer_id, contactDigits);
      await rememberPushName(existing.customer_id, pushName);
      return {
        profileId: existing.profile_id,
        customerId: existing.customer_id,
        ssoSub: existing.sso_sub ?? "",
      };
    }
  }

  // 2. New (or incomplete) number: throttle before minting a new identity. If
  //    an incomplete row already has an SSO subject, reuse it while repairing
  //    the missing child rows instead of creating another account.
  let sub = existing?.sso_sub?.trim() ?? "";
  if (!sub) {
    const allowed = await checkRateLimit(phoneJid);
    if (!allowed) throw new WaRateLimitError();

  // 3. Identity for this guest. Prefer a real Ventera SSO account (a returning
  //    guest is then the same person on web + WA), because that account is the
  //    ONLY thing that lets them sign in to the portal later and see the booking
  //    they made over WhatsApp.
  //
  //    Provision on `contactDigits`, NOT `digits`. For a guest whose chat is
  //    LID-addressed, `digits` is the LID's own 15 digits — not a phone number
  //    at all — and Ventera rightly rejects it, so EVERY LID guest fell through
  //    to the local fallback and ended up unable to log in. WhatsApp sends the
  //    real number alongside the message (`remoteJidAlt`), and `contactDigits`
  //    is exactly that number; using it is the difference between a guest who
  //    can sign in and one who cannot.
  //
  //    The fallback stays for the case that genuinely has no number: a LID with
  //    no companion. It keeps booking and chat working (profiles.id derives from
  //    the subject either way) — such a guest simply cannot sign in to the web
  //    portal until a message of theirs carries the number.
    const provisionable = isProvisionablePhone(contactDigits, phoneJid);
    try {
      if (!provisionable) throw new WaProvisionError("no_real_phone_yet");
      sub = await provisionVentera(contactDigits, displayName);
    } catch (e) {
      console.error(`[wa/guest] Ventera provision → local fallback: ${(e as Error).message}`);
      sub = `wa:${phoneJid}`;
    }
  }

  // 4. profileId is derived from the SSO subject, exactly as the web flow does
  //    (identity.ts) — so the same person is one profile across web and WA.
  const profileId = profileIdFor(sub);

  // A WhatsApp guest has no email, but profiles.email / customers.email are NOT
  // NULL. Use a deterministic, non-routable placeholder keyed on the number so
  // the row is valid and stable across re-provisions.
  const email = `${digits}@wa.guest.gostay.local`;
  const now = new Date().toISOString();

  // 5. profiles row (service-role, tenant explicit, role left to the DB default).
  const prof = await provisionProfileWithTenant({ profileId, ssoSub: sub, tenantId, email, fullName, now });
  if (!prof.ok) throw new WaProvisionError(prof.error ?? "profile_provision_failed");

  // 6. customers row — getOrCreateOwnCustomer's logic ported to service-role:
  //    find by profile_id first, else insert. profile_id is what ties a booking
  //    back to this person for every "own bookings" RLS policy.
  const customerId = await getOrCreateCustomer(profileId, tenantId, fullName, contactDigits, email, pushName);
  // An existing row (this profile already had a customer at this hotel) keeps its
  // full_name but still deserves a current WhatsApp label.
  await rememberPushName(customerId, pushName);

  // 7. Persist the resolution so the next message skips all of the above.
  await writeIdentity(tenantId, phoneJid, sub, profileId, customerId, existing);

  return { profileId, customerId, ssoSub: sub };
}

// ─── PostgREST helpers (service-role) ────────────────────────────────────────

async function lookupIdentity(tenantId: string, phoneJid: string): Promise<IdentityRow | null> {
  const q =
    `wa_guest_identities?tenant_id=eq.${encodeURIComponent(tenantId)}` +
    `&phone_jid=eq.${encodeURIComponent(phoneJid)}` +
    `&select=id,sso_sub,profile_id,customer_id&limit=1`;
  const res = await serviceGet(q);
  if (!res.ok) throw new WaProvisionError(`identity_lookup_${res.status}`);
  const rows = (await res.json()) as IdentityRow[];
  return rows[0] ?? null;
}

async function identityReferencesExist(
  tenantId: string,
  identity: IdentityRow,
): Promise<boolean> {
  if (!identity.profile_id || !identity.customer_id) return false;

  const [profile, customer] = await Promise.all([
    serviceGet(
      `profiles?id=eq.${encodeURIComponent(identity.profile_id)}` +
        `&tenant_id=eq.${encodeURIComponent(tenantId)}&select=id&limit=1`,
    ),
    serviceGet(
      `customers?id=eq.${encodeURIComponent(identity.customer_id)}` +
        `&tenant_id=eq.${encodeURIComponent(tenantId)}&select=id&limit=1`,
    ),
  ]);
  if (!profile.ok) throw new WaProvisionError(`profile_reference_lookup_${profile.status}`);
  if (!customer.ok) throw new WaProvisionError(`customer_reference_lookup_${customer.status}`);

  const profileRows = (await profile.json()) as unknown[];
  const customerRows = (await customer.json()) as unknown[];
  return profileRows.length > 0 && customerRows.length > 0;
}

async function checkRateLimit(phoneJid: string): Promise<boolean> {
  const { url, serviceKey } = serviceConfig();
  if (!url || !serviceKey) throw new WaProvisionError("wa_service_not_configured");
  const res = await fetch(`${url}/rest/v1/rpc/check_wa_rate_limit`, {
    method: "POST",
    headers: serviceHeaders(serviceKey),
    body: JSON.stringify({ p_phone: phoneJid, p_max: PROVISION_MAX, p_window: PROVISION_WINDOW }),
  });
  if (!res.ok) throw new WaProvisionError(`rate_limit_${res.status}`);
  // A scalar-returning RPC comes back as a bare JSON boolean.
  return (await res.json()) === true;
}

async function provisionVentera(digits: string, displayName?: string): Promise<string> {
  const { provisionUrl, provisionKey } = venteraConfig();
  if (!provisionUrl || !provisionKey) throw new WaProvisionError("wa_provision_not_configured");

  let res: Response;
  try {
    res = await fetch(`${provisionUrl}/api/admin/users/provision`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provisionKey}`,
        "Content-Type": "application/json",
      },
      // realm is omitted on purpose — Ventera defaults to ventera-shop.
      body: JSON.stringify({ phone: digits, ...(displayName ? { displayName } : {}) }),
    });
  } catch (e) {
    // DNS failure / refused connection / timeout — Ventera unreachable.
    throw new WaProvisionError(`ventera_network_${(e as Error).message}`);
  }

  if (!res.ok) throw new WaProvisionError(`ventera_${res.status}`);

  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; sub?: string };
  if (!data.sub) throw new WaProvisionError("ventera_no_sub");
  return data.sub;
}

/**
 * Correct a customer's stored phone, but only when we have a real one and it
 * differs from what is there.
 *
 * The `phone=neq.` filter does the comparison in the database, so the common
 * case — already correct — is one write that touches no rows, rather than a
 * read followed by a conditional write on the hot path of every message.
 *
 * Best-effort: never throws. A guest's conversation must not fail over a
 * contact-detail tidy-up.
 */
async function repairContactPhone(customerId: string, phone: string): Promise<void> {
  if (!phone || phone.length < 8) return;
  try {
    await serviceUpdate(
      `customers?id=eq.${encodeURIComponent(customerId)}&phone=neq.${encodeURIComponent(phone)}`,
      { phone },
    );
  } catch (e) {
    console.error("[wa/guest] phone repair failed:", (e as Error).message);
  }
}

/**
 * Keep the contact's WhatsApp display name current, without touching full_name.
 *
 * full_name is the RESERVATION name: once a guest books, the bot overwrites it
 * with the name they gave ("atas nama Ridho"), which is what CRM, the folio and
 * check-in need. That used to erase every trace of which WhatsApp account the
 * number belongs to. Storing the pushName separately keeps both, and refreshing
 * it here means contacts created before this column existed pick it up on their
 * next message rather than needing a backfill that could only guess.
 *
 * Best-effort: never throws. A guest's conversation must not fail over a label.
 */
async function rememberPushName(customerId: string, pushName: string | null): Promise<void> {
  if (!pushName) return;
  try {
    // Only write when it is missing or has actually changed, so a chatty guest
    // does not rewrite the same row on every message. A bare `neq` would skip
    // NULL rows (NULL <> 'x' is NULL, not true), hence the OR. The value is
    // double-quoted because a pushName may contain a comma or parenthesis, which
    // would otherwise terminate the filter.
    const quoted = `"${pushName.replace(/"/g, '\\"')}"`;
    await serviceUpdate(
      `customers?id=eq.${encodeURIComponent(customerId)}` +
        `&or=(wa_push_name.is.null,wa_push_name.neq.${encodeURIComponent(quoted)})`,
      { wa_push_name: pushName },
    );
  } catch (e) {
    console.error("[wa/guest] push-name update failed:", (e as Error).message);
  }
}

async function getOrCreateCustomer(
  profileId: string,
  tenantId: string,
  fullName: string,
  phone: string,
  email: string,
  pushName: string | null,
): Promise<string> {
  // Scoped to the tenant, not just the profile. The same phone is ONE profile
  // across every hotel (profileIdFor derives it from the Ventera subject), so a
  // profile-only lookup handed hotel B the customer row hotel A owns — 016's
  // "the same number may be a guest at more than one hotel" broken in one query.
  // Everything downstream inherits that row's tenant: the thread, the booking's
  // customer_id, and setCustomerName, which would rewrite hotel A's CRM entry
  // with the name a guest gave hotel B.
  //
  // limit(1) ordered oldest-first, mirroring getOrCreateOwnCustomer: if a
  // profile somehow has more than one customer row in this tenant, take the
  // oldest rather than erroring.
  const lookup = await serviceGet(
    `customers?profile_id=eq.${encodeURIComponent(profileId)}` +
      `&tenant_id=eq.${encodeURIComponent(tenantId)}` +
      `&select=id&order=created_at.asc&limit=1`,
  );
  if (!lookup.ok) throw new WaProvisionError(`customer_lookup_${lookup.status}`);
  const rows = (await lookup.json()) as Array<{ id: string }>;
  if (rows[0]) return rows[0].id;

  const insert = await serviceInsert(
    "customers",
    { profile_id: profileId, tenant_id: tenantId, full_name: fullName, phone, email, wa_push_name: pushName },
    "return=representation",
  );
  if (!insert.ok) throw new WaProvisionError(`customer_insert_${insert.status}`);
  const created = (await insert.json()) as Array<{ id: string }>;
  const id = created[0]?.id;
  if (!id) throw new WaProvisionError("customer_no_id");
  return id;
}

async function writeIdentity(
  tenantId: string,
  phoneJid: string,
  ssoSub: string,
  profileId: string,
  customerId: string,
  existing: IdentityRow | null,
): Promise<void> {
  const fields = { sso_sub: ssoSub, profile_id: profileId, customer_id: customerId };

  if (existing) {
    // A half-provisioned row already exists — fill in its ids.
    await patchIdentity(tenantId, phoneJid, fields);
    return;
  }

  const insert = await serviceInsert("wa_guest_identities", {
    tenant_id: tenantId,
    phone_jid: phoneJid,
    ...fields,
  });
  // A concurrent message may have inserted the row first (unique tenant_id,
  // phone_jid). Treat that as "already there" and patch instead of failing.
  if (insert.status === 409) {
    await patchIdentity(tenantId, phoneJid, fields);
    return;
  }
  if (!insert.ok) throw new WaProvisionError(`identity_insert_${insert.status}`);
}

async function patchIdentity(
  tenantId: string,
  phoneJid: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const { url, serviceKey } = serviceConfig();
  if (!url || !serviceKey) throw new WaProvisionError("wa_service_not_configured");
  const res = await fetch(
    `${url}/rest/v1/wa_guest_identities?tenant_id=eq.${encodeURIComponent(tenantId)}` +
      `&phone_jid=eq.${encodeURIComponent(phoneJid)}`,
    {
      method: "PATCH",
      headers: serviceHeaders(serviceKey),
      body: JSON.stringify(fields),
    },
  );
  if (!res.ok) throw new WaProvisionError(`identity_patch_${res.status}`);
}
