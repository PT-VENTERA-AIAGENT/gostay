// Outbound WhatsApp reply through the wa-ventera gateway.
//
// Lives under api/_lib so Vercel treats it as a helper, not a route (paths
// beginning with "_" are not deployed as functions). The webhook route
// (api/wa/inbound.ts) calls sendText() to answer a guest; this file is the only
// place that knows the gateway's send contract.
//
// The integration key is read from WA_VENTERA_INT_KEY — deliberately without a
// VITE_ prefix, so Vite can never inline it into the browser bundle. It is an
// `int_*` key whose owner must be an owner/admin of the target session.

// Read lazily, never at module scope: the Vite dev middleware populates
// process.env from .env only after this module has already been imported (same
// reasoning as exchange.ts).
function config() {
  return {
    baseUrl: (process.env.WA_VENTERA_BASE_URL ?? "").replace(/\/$/, ""),
    intKey: process.env.WA_VENTERA_INT_KEY,
  };
}

/**
 * Send a plain-text WhatsApp message back through the gateway.
 *
 * `to` may be a JID (`628123...@s.whatsapp.net`) or bare digits (`628123...`);
 * it is passed through as-is because the gateway auto-builds the JID from
 * digits per the wa-ventera contract.
 *
 * Never throws — every failure path resolves to `{ ok:false, error }` so the
 * webhook handler can always answer the gateway with a 200 and avoid a retry
 * storm. Error codes:
 *   - "send_not_configured"  — WA_VENTERA_BASE_URL or WA_VENTERA_INT_KEY unset.
 *   - "send_failed_<status>" — gateway answered non-200 (e.g. send_failed_409).
 *       429 additionally carries the Retry-After hint: "send_failed_429_retry_<n>".
 *   - "network_error"        — the request never got an HTTP response.
 */
export async function sendText(
  sessionId: string,
  to: string,
  text: string,
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const { baseUrl, intKey } = config();
  if (!baseUrl || !intKey) {
    // Fail soft: a missing gateway config must not crash inbound handling.
    return { ok: false, error: "send_not_configured" };
  }

  const url = `${baseUrl}/api/sessions/${encodeURIComponent(sessionId)}/send`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${intKey}`,
      },
      body: JSON.stringify({ to, type: "text", text }),
    });
  } catch {
    // DNS failure, connection refused, timeout — no HTTP response at all.
    return { ok: false, error: "network_error" };
  }

  if (!res.ok) {
    if (res.status === 429) {
      // Rate limited. Surface the Retry-After hint when the gateway sends one
      // so the caller can decide how long to back off.
      const retryAfter = res.headers.get("retry-after");
      return {
        ok: false,
        error: retryAfter ? `send_failed_429_retry_${retryAfter}` : "send_failed_429",
      };
    }
    return { ok: false, error: `send_failed_${res.status}` };
  }

  const body = (await res.json().catch(() => ({}))) as { messageId?: unknown };
  const messageId = typeof body.messageId === "string" ? body.messageId : undefined;
  return { ok: true, messageId };
}
