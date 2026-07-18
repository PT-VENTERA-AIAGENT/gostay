// Service-role Supabase REST helpers for the WhatsApp webhook.
//
// GoStay's *server* code talks to Supabase through PostgREST with raw `fetch`
// and the service_role key (apikey + Authorization: Bearer) — see
// api/_lib/provision.ts. It deliberately does NOT use @supabase/supabase-js:
// that dependency is the *browser* client (src/lib/supabase.ts), bound to the
// anon key and RLS. The webhook must bypass RLS and pass tenant_id explicitly,
// so it reuses the same service-role fetch path as provision.ts.

export interface ServiceConfig {
  /** Supabase project URL, trailing slash stripped. Empty when unconfigured. */
  url: string;
  /** service_role key — bypasses RLS. Undefined when unconfigured. */
  serviceKey: string | undefined;
  /** Shared secret wa-ventera sends in the `x-webhook-secret` header. */
  webhookSecret: string | undefined;
}

/**
 * Read env lazily, never at module scope.
 *
 * The Vite dev middleware only copies .env into process.env after this module
 * has already been imported, so reading at module load would capture blanks
 * (same reasoning as provision.ts / exchange.ts `config()`).
 */
export function serviceConfig(): ServiceConfig {
  return {
    url: (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, ""),
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    webhookSecret: process.env.WA_WEBHOOK_SECRET,
  };
}

/** The header set every service-role PostgREST call needs. */
export function serviceHeaders(serviceKey: string): Record<string, string> {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };
}

/** True once both the URL and the service_role key are present. */
export function isConfigured(): boolean {
  const { url, serviceKey } = serviceConfig();
  return Boolean(url && serviceKey);
}

/**
 * A service-role GET against `/rest/v1/<pathAndQuery>`.
 *
 * `pathAndQuery` is the table plus its PostgREST query string, already encoded
 * by the caller, e.g. `wa_hotel_sessions?session_id=eq.foo&select=tenant_id`.
 */
export async function serviceGet(pathAndQuery: string): Promise<Response> {
  const { url, serviceKey } = serviceConfig();
  if (!url || !serviceKey) throw new Error("wa_service_not_configured");
  return fetch(`${url}/rest/v1/${pathAndQuery}`, {
    headers: serviceHeaders(serviceKey),
  });
}

/**
 * A service-role INSERT into `/rest/v1/<table>`.
 *
 * Defaults to `Prefer: return=minimal` — callers that need the inserted row
 * back pass `return=representation`.
 */
export async function serviceInsert(
  table: string,
  row: Record<string, unknown>,
  prefer = "return=minimal",
): Promise<Response> {
  const { url, serviceKey } = serviceConfig();
  if (!url || !serviceKey) throw new Error("wa_service_not_configured");
  return fetch(`${url}/rest/v1/${encodeURIComponent(table)}`, {
    method: "POST",
    headers: { ...serviceHeaders(serviceKey), Prefer: prefer },
    body: JSON.stringify(row),
  });
}
