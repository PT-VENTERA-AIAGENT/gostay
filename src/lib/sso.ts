// Issuer and client id are public by nature — they travel in the authorize URL.
// The client secret is deliberately absent: every VITE_* value is inlined into
// the browser bundle, so the secret lives only on the server and the token
// exchange happens in api/sso/token.ts.
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

export interface SsoSession {
  claims: SsoClaims;
  access_token: string;
  expires_at: number;
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
  // it cannot be pointed elsewhere by a caller.
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, code_verifier: verifier }),
  });

  if (!res.ok) return null;

  const tokens = await res.json();
  const claims = parseJwtPayload(tokens.id_token as string);

  const session: SsoSession = {
    claims,
    access_token: tokens.access_token as string,
    expires_at: Date.now() + Number(tokens.expires_in ?? 3600) * 1000,
  };

  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));

  return { claims, returnTo: tx.returnTo };
}

export function getSession(): SsoSession | null {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  const session = JSON.parse(raw) as SsoSession;
  if (Date.now() > session.expires_at) {
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
  return session;
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

export function logout() {
  clearSession();
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    post_logout_redirect_uri: `${window.location.origin}/`,
  });
  window.location.assign(`${SSO_ISSUER}/oidc/session/end?${params}`);
}
