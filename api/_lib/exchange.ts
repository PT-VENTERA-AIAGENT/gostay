// Shared OIDC token-exchange logic.
//
// Lives under api/_lib so Vercel treats it as a helper, not a route (paths
// beginning with "_" are not deployed as functions). It is imported by both the
// Vercel function (api/sso/token.ts) and the Vite dev middleware, so local dev
// and production run the exact same exchange.
//
// The client secret is read from SSO_CLIENT_SECRET — deliberately without a
// VITE_ prefix, so Vite can never inline it into the browser bundle.

import { mintSupabaseToken, profileIdFor, type AppRole } from "./identity";
import { provisionProfile, provisioningEnabled } from "./provision";

// Read lazily, never at module scope: the Vite dev middleware populates
// process.env from .env only after this module has already been imported.
function config() {
  return {
    issuer: process.env.SSO_ISSUER ?? "https://sso.ventera.ai",
    clientId: process.env.SSO_CLIENT_ID ?? "gostay",
    clientSecret: process.env.SSO_CLIENT_SECRET,
    extraOrigins: (process.env.SSO_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),
  };
}

export interface ExchangeRequest {
  code: string;
  code_verifier: string;
  origin: string;
  /**
   * The hotel a NEW guest is signing up on (their `?hotel={slug}` portal link).
   * Files a first-ever profile under that tenant as a customer; ignored for a
   * returning user (their profile already has a tenant) and it can never confer
   * staff/admin. Client-supplied and validated against active tenants server-side
   * — the same spoof-safe, public-scope-only hint x-tenant-slug already is (011).
   */
  tenantSlug?: string;
}

export interface ExchangeResult {
  status: number;
  body: Record<string, unknown>;
}

function isAllowedOrigin(origin: string, extraOrigins: string[]): boolean {
  if (extraOrigins.includes(origin)) return true;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  // Local development.
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return true;
  // Vercel production and preview deployments.
  if (url.protocol === "https:" && url.hostname.endsWith(".vercel.app")) return true;
  return false;
}

export async function exchangeCode({
  code,
  code_verifier,
  origin,
  tenantSlug,
}: ExchangeRequest): Promise<ExchangeResult> {
  const { issuer, clientId, clientSecret, extraOrigins } = config();

  if (!code || !code_verifier) {
    return { status: 400, body: { error: "missing_parameters" } };
  }
  if (!origin || !isAllowedOrigin(origin, extraOrigins)) {
    return { status: 403, body: { error: "origin_not_allowed" } };
  }

  // Derived server-side rather than taken from the request body: a caller must
  // not be able to point our client credentials at an arbitrary redirect_uri.
  const redirect_uri = `${origin}/auth/callback`;

  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    redirect_uri,
    code,
    code_verifier,
  });
  if (clientSecret) {
    params.set("client_secret", clientSecret);
  } else {
    // Not fatal on its own — the issuer advertises `none` as an auth method, so
    // a public client is legal. But `gostay` is registered confidential, so in
    // practice this means SSO_CLIENT_SECRET is missing from the environment and
    // the issuer is about to answer invalid_client. Say so once, loudly: the
    // symptom otherwise surfaces as a bare 502 with nothing to go on.
    console.error(
      "[sso] SSO_CLIENT_SECRET is not set — sending no client authentication. " +
        "If the token exchange fails with invalid_client, that is why. See .env.example.",
    );
  }

  const res = await fetch(`${issuer}/oidc/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });

  if (!res.ok) {
    // The body is not forwarded wholesale: an issuer can echo the request back
    // in error_description, client_secret included. But answering with a bare
    // 502 leaves the operator with a dead login and no way to tell a missing
    // secret from a bad code, so the OAuth error *code* is passed through —
    // it is a fixed vocabulary from RFC 6749 §5.2 and carries no credentials.
    const reason = await safeErrorCode(res);
    console.error(
      `[sso] token exchange failed: HTTP ${res.status}` +
        (reason ? ` (${reason})` : "") +
        (reason === "invalid_client" ? " — check SSO_CLIENT_SECRET / SSO_CLIENT_ID" : "") +
        (reason === "invalid_grant" ? " — code expired, reused, or redirect_uri mismatch" : ""),
    );
    return {
      status: 502,
      body: reason
        ? { error: "token_exchange_failed", reason }
        : { error: "token_exchange_failed" },
    };
  }

  const tokens = (await res.json()) as Record<string, unknown>;
  const claims = decodeIdToken(tokens.id_token as string | undefined);

  // Bridge the SSO identity into Supabase. Without this the browser talks to
  // PostgREST as anon, auth.uid() is NULL, and every RLS policy denies.
  const supabase = claims?.sub
    ? await buildSupabaseSession(claims, Number(tokens.expires_in ?? 3600), tenantSlug)
    : null;

  // Only the fields the client actually needs. The refresh_token, if the issuer
  // sends one, stays server-side.
  return {
    status: 200,
    body: {
      id_token: tokens.id_token,
      access_token: tokens.access_token,
      expires_in: tokens.expires_in,
      token_type: tokens.token_type,
      supabase_token: supabase?.token ?? null,
      // What the database will actually enforce, as opposed to what the client
      // infers from the realm for display purposes.
      role: supabase?.role ?? null,
      profile_id: supabase?.profileId ?? null,
    },
  };
}

/**
 * The upstream OAuth error code, and nothing else.
 *
 * Allowlisted rather than passed through: `error` is a closed vocabulary in
 * RFC 6749 §5.2, so matching against it cannot smuggle out anything the issuer
 * put in the body — an arbitrary string could. error_description is dropped for
 * exactly that reason; it is free text and may quote the request back.
 */
const OAUTH_ERROR_CODES = new Set([
  "invalid_request",
  "invalid_client",
  "invalid_grant",
  "unauthorized_client",
  "unsupported_grant_type",
  "invalid_scope",
]);

async function safeErrorCode(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as { error?: unknown };
    const code = typeof body.error === "string" ? body.error : null;
    return code && OAUTH_ERROR_CODES.has(code) ? code : null;
  } catch {
    return null;
  }
}

interface IdTokenClaims {
  sub?: string;
  email?: string;
  name?: string;
  realm?: string;
}

function decodeIdToken(idToken?: string): IdTokenClaims | null {
  if (!idToken) return null;
  const part = idToken.split(".")[1];
  if (!part) return null;
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as IdTokenClaims;
  } catch {
    return null;
  }
}

async function buildSupabaseSession(
  claims: IdTokenClaims,
  expiresInSeconds: number,
  tenantSlug?: string,
) {
  // The bridge is all-or-nothing on the signing secret: without it we cannot
  // mint a usable token, so provisioning a row would be a pointless write to
  // the live database on every single login.
  if (!process.env.SUPABASE_JWT_SECRET) return null;

  const sub = claims.sub as string;
  const profileId = profileIdFor(sub);
  const issuedAt = Math.floor(Date.now() / 1000);

  // Null until the database says otherwise. Nothing in the SSO token can grant
  // a role: profiles.role is the only source of truth, and a null role means
  // the UI denies every gated route.
  let role: AppRole | null = null;

  if (provisioningEnabled()) {
    const result = await provisionProfile({
      profileId,
      ssoSub: sub,
      email: claims.email ?? "",
      fullName: claims.name ?? claims.email ?? "",
      now: new Date(issuedAt * 1000).toISOString(),
      tenantSlug,
    });
    if (!result.ok) {
      // Sign-in still succeeds; the user simply sees empty data rather than a
      // dead login. Surfacing it here beats failing silently at query time.
      console.error(`[sso] profile provisioning failed: ${result.error}`);
    } else if (!result.isActive) {
      // Deactivated by an admin: hand back no token at all, so the client falls
      // to anon and reads only public data. get_my_role() also excludes inactive
      // users, which covers anyone deactivated mid-session who still holds a
      // valid token — this check only stops them getting a fresh one.
      return { token: null, role: null, profileId };
    } else {
      role = result.role;
    }
  }

  const token = mintSupabaseToken({
    profileId,
    email: claims.email,
    issuedAt,
    expiresAt: issuedAt + expiresInSeconds,
  });

  return { token, role, profileId };
}
