// Shared OIDC token-exchange logic.
//
// Lives under api/_lib so Vercel treats it as a helper, not a route (paths
// beginning with "_" are not deployed as functions). It is imported by both the
// Vercel function (api/sso/token.ts) and the Vite dev middleware, so local dev
// and production run the exact same exchange.
//
// The client secret is read from SSO_CLIENT_SECRET — deliberately without a
// VITE_ prefix, so Vite can never inline it into the browser bundle.

import { mintSupabaseToken, profileIdFor, roleForRealm, type AppRole } from "./identity";
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
  if (clientSecret) params.set("client_secret", clientSecret);

  const res = await fetch(`${issuer}/oidc/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });

  if (!res.ok) {
    // Upstream errors can quote the client_secret back; never forward the body.
    return { status: 502, body: { error: "token_exchange_failed" } };
  }

  const tokens = (await res.json()) as Record<string, unknown>;
  const claims = decodeIdToken(tokens.id_token as string | undefined);

  // Bridge the SSO identity into Supabase. Without this the browser talks to
  // PostgREST as anon, auth.uid() is NULL, and every RLS policy denies.
  const supabase = claims?.sub
    ? await buildSupabaseSession(claims, Number(tokens.expires_in ?? 3600))
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

async function buildSupabaseSession(claims: IdTokenClaims, expiresInSeconds: number) {
  // The bridge is all-or-nothing on the signing secret: without it we cannot
  // mint a usable token, so provisioning a row would be a pointless write to
  // the live database on every single login.
  if (!process.env.SUPABASE_JWT_SECRET) return null;

  const sub = claims.sub as string;
  const profileId = profileIdFor(sub);
  const initialRole = roleForRealm(claims.realm);

  let role: AppRole = initialRole;

  if (provisioningEnabled()) {
    const result = await provisionProfile({
      profileId,
      ssoSub: sub,
      email: claims.email ?? "",
      fullName: claims.name ?? claims.email ?? "",
      initialRole,
    });
    if (!result.ok) {
      // Sign-in still succeeds; the user simply sees empty data rather than a
      // dead login. Surfacing it here beats failing silently at query time.
      console.error(`[sso] profile provisioning failed: ${result.error}`);
    } else if (result.role) {
      // The stored role wins — an admin may have changed it since first login.
      role = result.role;
    }
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const token = mintSupabaseToken({
    profileId,
    email: claims.email,
    issuedAt,
    expiresAt: issuedAt + expiresInSeconds,
  });

  return { token, role, profileId };
}
