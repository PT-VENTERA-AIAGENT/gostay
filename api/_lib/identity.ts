import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Bridges a Ventera SSO identity to a Supabase-compatible one.
 *
 * Supabase's `auth.uid()` reads the `sub` claim of the presented JWT and casts
 * it to uuid, and `profiles.id` is a uuid. The SSO subject is an opaque string
 * that may not be a uuid at all, so we derive one deterministically: the same
 * subject always yields the same uuid, without needing a lookup table.
 */

// RFC 4122 §4.3 namespace for GoStay's SSO subjects.
//
// CHANGING THIS REMAPS EVERY USER: profiles.id is derived from it, so a new
// namespace orphans every existing profile row along with its bookings, chat
// threads and audit entries. It is overridable only to support a deliberate,
// planned migration.
const DEFAULT_NAMESPACE = "b9c1a7d4-3e52-4f68-9a0b-7d2c5e814f36";

function uuidToBytes(uuid: string): Buffer {
  const hex = uuid.replace(/-/g, "");
  if (hex.length !== 32 || /[^0-9a-f]/i.test(hex)) {
    throw new Error(`invalid namespace uuid: ${uuid}`);
  }
  return Buffer.from(hex, "hex");
}

function bytesToUuid(b: Buffer): string {
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** RFC 4122 v5 (SHA-1, name-based). Deterministic for a given namespace+name. */
export function uuidV5(name: string, namespace: string): string {
  const hash = createHash("sha1")
    .update(Buffer.concat([uuidToBytes(namespace), Buffer.from(name, "utf8")]))
    .digest();

  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  return bytesToUuid(bytes);
}

/** The Supabase `profiles.id` / `auth.uid()` value for an SSO subject. */
export function profileIdFor(ssoSub: string): string {
  const ns = process.env.SSO_UUID_NAMESPACE ?? DEFAULT_NAMESPACE;
  return uuidV5(ssoSub, ns);
}

/**
 * Roles are not derived from anything in the SSO token.
 *
 * `profiles.role` is the only source of truth: it is what get_my_role() reads,
 * and therefore what every RLS policy enforces. A new profile is created as
 * 'customer' by default (least privilege) — never from anything in the token.
 * Hotel staff are not born here: they come from the onboarding wizard or, in the
 * target self-serve flow, from a new tenant created for the signer (PRD §2.2).
 * Changing a role afterwards is a database change, made through User Management
 * or the Supabase SQL editor.
 *
 * Mapping the SSO realm to a role as well would create a second source of
 * truth that could silently disagree with the database — and it would mean
 * every role change had to go through the SSO admin surface rather than this
 * application.
 */
export type AppRole = "admin" | "staff" | "customer";

// ─── Supabase JWT ────────────────────────────────────────────────────────────

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

export interface SupabaseTokenInput {
  profileId: string;
  email?: string;
  /** Seconds since epoch; the Supabase token expires with the SSO session. */
  expiresAt: number;
  issuedAt: number;
}

/**
 * Mints the HS256 JWT that PostgREST validates with the project's JWT secret.
 *
 * `role` is the Postgres role PostgREST switches to — "authenticated", not the
 * application role. The app role lives in profiles.role and is read by RLS via
 * get_my_role(); putting it in the token would let anyone holding a stale token
 * keep a privilege after it was revoked.
 */
export function mintSupabaseToken(input: SupabaseTokenInput): string | null {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) return null;

  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    sub: input.profileId,
    aud: "authenticated",
    role: "authenticated",
    iat: input.issuedAt,
    exp: input.expiresAt,
    ...(input.email ? { email: input.email } : {}),
  };

  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = b64url(createHmac("sha256", secret).update(signingInput).digest());
  return `${signingInput}.${signature}`;
}

/** Verification helper — used by the tests, not on the request path. */
export function verifySupabaseToken(token: string, secret: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const expected = b64url(createHmac("sha256", secret).update(`${parts[0]}.${parts[1]}`).digest());
  const a = Buffer.from(parts[2]);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
}
