// Issuer and client id are public by nature — they travel in the authorize URL.
// The client secret is deliberately absent: every VITE_* value is inlined into
// the browser bundle, so the secret lives only on the server and the token
// exchange happens in api/sso/token.ts.
import { currentTenantSlug } from "@/lib/tenant";

const SSO_ISSUER =
  (import.meta.env.VITE_SSO_ISSUER as string) ?? "https://sso.ventera.ai";
const CLIENT_ID = (import.meta.env.VITE_SSO_CLIENT_ID as string) ?? "gostay";
const TOKEN_ENDPOINT = "/api/sso/token";

function getRedirectUri() {
  return `${window.location.origin}/auth/callback`;
}

function randomBase64Url(byteLength: number): string {
  const arr = new Uint8Array(byteLength);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

async function sha256Base64Url(plain: string): Promise<string> {
  const data = new TextEncoder().encode(plain);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function parseJwtPayload(token: string): SsoClaims {
  const part = token.split(".")[1];
  return JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
}

const SESSION_KEY = "gostay_sso_session";
const TX_VERIFIER_KEY = "gostay_sso_verifier";
const TX_STATE_KEY = "gostay_sso_state";

export interface SsoClaims {
  sub: string;
  name?: string;
  email?: string;
  email_verified?: boolean;
  phone_number?: string;
  phone_number_verified?: boolean;
  realm?: string;
  iat?: number;
  exp?: number;
}

export type SsoRole = "admin" | "staff" | "customer";

export interface SsoSession {
  claims: SsoClaims;
  access_token: string;
  /**
   * The raw OIDC id_token, kept solely to hand back as `id_token_hint` on
   * RP-initiated logout (/oidc/session/end). Without it the issuer cannot tell
   * which session to end, and logout can only clear our local copy — leaving the
   * SSO session alive so the next "Masuk" silently reuses the previous account.
   */
  id_token?: string;
  expires_at: number;
  /**
   * Supabase-compatible JWT minted by /api/sso/token. supabase-js presents it
   * via the `accessToken` hook, which is what makes auth.uid() resolve and RLS
   * work. Null when SUPABASE_JWT_SECRET is not configured — the app then falls
   * back to anon and reads only public data.
   */
  supabase_token?: string | null;
  /** The role the database will enforce. Authoritative; decided server-side. */
  role?: SsoRole | null;
  /** profiles.id — a uuid derived from the SSO subject. */
  profile_id?: string | null;
  /** Authoritative profiles.tenant_id; null means this user still needs a hotel. */
  tenant_id?: string | null;
}

export type SignupContext = "owner" | "guest";

/**
 * Only public-portal deep links are guest sign-ins. The app's normal /login
 * entrance is owner onboarding and must ignore any stale hotel slug remembered
 * from an earlier portal visit.
 */
export function signupContextFor(returnTo: string): SignupContext {
  return returnTo === "/portal" || returnTo.startsWith("/portal/") ? "guest" : "owner";
}

export async function startLogin(returnTo = "/") {
  const verifier = randomBase64Url(32);
  const challenge = await sha256Base64Url(verifier);
  const state = randomBase64Url(16);

  sessionStorage.setItem(TX_VERIFIER_KEY, verifier);
  sessionStorage.setItem(TX_STATE_KEY, JSON.stringify({ state, returnTo }));

  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: getRedirectUri(),
    scope: "openid profile email phone realm",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  window.location.assign(`${SSO_ISSUER}/oidc/auth?${params}`);
}

export async function handleCallback(
  code: string,
  returnedState: string,
): Promise<{ claims: SsoClaims; returnTo: string } | null> {
  const verifier = sessionStorage.getItem(TX_VERIFIER_KEY);
  const txRaw = sessionStorage.getItem(TX_STATE_KEY);
  if (!verifier || !txRaw) return null;

  const tx = JSON.parse(txRaw) as { state: string; returnTo: string };
  if (tx.state !== returnedState) return null;

  sessionStorage.removeItem(TX_VERIFIER_KEY);
  sessionStorage.removeItem(TX_STATE_KEY);

  // redirect_uri is not sent: the server derives it from the request origin so
  // it cannot be pointed elsewhere by a caller. A tenant slug is sent ONLY for
  // a portal deep-link login. The main app login is owner onboarding and must
  // ignore a remembered/default hotel, otherwise a new owner is filed as that
  // hotel's guest.
  const signupContext = signupContextFor(tx.returnTo);
  const tenantSlug = signupContext === "guest" ? currentTenantSlug() : null;
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      code_verifier: verifier,
      signup_context: signupContext,
      ...(tenantSlug ? { tenant_slug: tenantSlug } : {}),
    }),
  });

  if (!res.ok) return null;

  const tokens = await res.json();
  const claims = parseJwtPayload(tokens.id_token as string);

  const session: SsoSession = {
    claims,
    access_token: tokens.access_token as string,
    id_token: tokens.id_token as string,
    expires_at: Date.now() + Number(tokens.expires_in ?? 3600) * 1000,
    supabase_token: (tokens.supabase_token as string | null) ?? null,
    role: (tokens.role as SsoRole | null) ?? null,
    profile_id: (tokens.profile_id as string | null) ?? null,
    tenant_id: (tokens.tenant_id as string | null) ?? null,
  };

  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));

  return { claims, returnTo: tx.returnTo };
}

/** Epoch ms at which a JWT expires, or null if it carries no parseable exp. */
function jwtExpiryMs(token?: string | null): number | null {
  if (!token) return null;
  try {
    const payload = token.split(".")[1];
    const { exp } = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof exp === "number" ? exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * When the session effectively dies. The Supabase token can expire before the
 * SSO session's own expires_at, and once it does every RLS-gated query silently
 * returns empty — the "sesi habis tapi malah kosongin data" symptom. So the
 * session is only good until the EARLIER of the two clocks.
 */
export function sessionExpiryMs(session: SsoSession): number {
  const tokenExp = jwtExpiryMs(session.supabase_token);
  return tokenExp ? Math.min(session.expires_at, tokenExp) : session.expires_at;
}

const VALID_ROLES: SsoRole[] = ["admin", "staff", "customer"];

export function getSession(): SsoSession | null {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;

  // Storage is user-writable, so treat everything in it as untrusted input:
  // malformed JSON, a missing subject, an unknown role, or a lapsed clock all
  // collapse to "no session" (and the bad value is cleared) rather than being
  // handed to the app. RLS on auth.uid() is still the real boundary — this just
  // stops a tampered blob from steering what the browser renders or from
  // throwing on parse.
  let session: SsoSession;
  try {
    session = JSON.parse(raw) as SsoSession;
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }

  if (!session || typeof session !== "object" || typeof session.claims?.sub !== "string") {
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }

  // Never carry a role the database wouldn't recognise; unknown → null, which
  // denies every gated route.
  if (session.role != null && !VALID_ROLES.includes(session.role)) {
    session.role = null;
  }

  if (Date.now() >= sessionExpiryMs(session)) {
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
  return session;
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

/**
 * Origins whose `${origin}/` is registered as a post_logout_redirect_uri for the
 * `gostay` client at Ventera. The issuer rejects any unregistered value with
 * "post_logout_redirect_uri not registered" and strands the user on its error
 * page, so we only ever send one from this list. Anywhere else (Vercel preview
 * URLs, say) falls back to a local-only sign-out.
 *
 * Keep in lockstep with the client's Post-logout redirect URIs in SSO admin.
 */
const REGISTERED_POST_LOGOUT_ORIGINS = new Set([
  "https://app.gostay.id",
  "http://localhost:8080",
]);

/**
 * Whether `${origin}/` is safe to send as a post_logout_redirect_uri — i.e. it
 * is registered on the `gostay` client. Production hosts are enumerated above;
 * for local dev we allow any localhost port (whatever the developer registered
 * for their vite port), since dev ports shift (8080/8081/8082…) and stranding on
 * the issuer's error page is a dev-only annoyance they can fix by registering it.
 */
function canSingleLogout(origin: string): boolean {
  if (REGISTERED_POST_LOGOUT_ORIGINS.has(origin)) return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

export function logout() {
  // Single logout: end the Ventera SSO session too, not just our local copy.
  //
  // Clearing only sessionStorage left the issuer's session alive, so the next
  // "Masuk" silently reused the previous account with no prompt ("logout tapi
  // masih masuk akun lama"). RP-initiated logout at /oidc/session/end ends the
  // session at the source; Ventera auto-confirms it, so there's no extra click.
  //
  // id_token_hint tells the issuer which session to end. Without a stored token
  // (e.g. Supabase unconfigured) there's nothing to hint with, so fall back to a
  // local-only sign-out rather than a bare, ambiguous end-session request.
  const idToken = getSession()?.id_token;
  clearSession();

  const origin = window.location.origin;
  if (idToken && canSingleLogout(origin)) {
    const params = new URLSearchParams({
      id_token_hint: idToken,
      post_logout_redirect_uri: `${origin}/`,
    });
    window.location.assign(`${SSO_ISSUER}/oidc/session/end?${params}`);
    return;
  }

  // No token to hint with, or an origin we haven't registered a redirect for:
  // clearing our own session is still a valid local sign-out.
  window.location.assign("/");
}
