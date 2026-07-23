// Access control for the payment module — gateway (Ventera) model.
//
// GoStay talks to the central Ventera payment gateway, which holds the Xendit
// keys and fans invoice callbacks out to each project's confirm endpoint. Auth
// is a shared internal token per environment, exactly like Storo's
// storo-payment-confirm: the gateway sends `x-internal-token` = the production
// OR the sandbox token, and we accept either (and learn which environment the
// call is for from which one matched).
//
// All gates are fail-closed and constant-time (modelled on
// api/_lib/wa/inbound.ts verifySecret).

import { timingSafeEqual } from "node:crypto";

export type TokenEnv = "production" | "sandbox";

/** Constant-time string equality that fails closed on empty/missing/length-mismatch. */
export function safeEqual(got: string | undefined, expected: string | undefined): boolean {
  if (!expected) return false;                         // not configured => deny
  if (typeof got !== "string" || got.length === 0) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;             // timingSafeEqual throws on unequal lengths
  return timingSafeEqual(a, b);
}

/**
 * Match an incoming `x-internal-token` against the two environment tokens and
 * return which environment it belongs to (or null when it matches neither).
 *
 * The gateway authenticates every call with the production or the sandbox
 * token; this both authorises the call AND tells us the environment, so a
 * sandbox invoice can never be mistaken for a live one. Reads env lazily.
 */
export function matchGatewayToken(header: string | undefined): TokenEnv | null {
  if (safeEqual(header, process.env.INTERNAL_TOKEN_PRODUCTION)) return "production";
  if (safeEqual(header, process.env.INTERNAL_TOKEN_SANDBOX)) return "sandbox";
  return null;
}

/** The internal token to present to the gateway for a given environment. */
export function tokenForEnv(env: TokenEnv): string | undefined {
  return env === "production" ? process.env.INTERNAL_TOKEN_PRODUCTION : process.env.INTERNAL_TOKEN_SANDBOX;
}
