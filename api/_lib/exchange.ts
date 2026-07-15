// Shared OIDC token-exchange logic.
//
// Lives under api/_lib so Vercel treats it as a helper, not a route (paths
// beginning with "_" are not deployed as functions). It is imported by both the
// Vercel function (api/sso/token.ts) and the Vite dev middleware, so local dev
// and production run the exact same exchange.
//
// The client secret is read from SSO_CLIENT_SECRET — deliberately without a
// VITE_ prefix, so Vite can never inline it into the browser bundle.

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

  // Only the fields the client actually needs. The refresh_token, if the issuer
  // sends one, stays server-side.
  return {
    status: 200,
    body: {
      id_token: tokens.id_token,
      access_token: tokens.access_token,
      expires_in: tokens.expires_in,
      token_type: tokens.token_type,
    },
  };
}
