// Admin-level session management against the wa-ventera gateway.
//
// Lives under api/_lib so Vercel treats it as a helper, not a route (paths
// beginning with "_" are not deployed as functions). The hotel-onboarding
// wizard calls these to spin up a WhatsApp session for a new tenant: create the
// session, poll the QR so the operator can scan it, watch for the connection to
// go live, and delete the session on rollback.
//
// Every request authenticates with WA_VENTERA_INT_KEY — an admin-level `int_*`
// key sent as `Authorization: Bearer`. It is read without a VITE_ prefix so Vite
// can never inline it into the browser bundle.
//
// Like send.ts, nothing here ever throws: each failure resolves to a result
// object so the wizard's server route can always answer the client cleanly.

// Read env lazily, never at module scope: the Vite dev middleware only copies
// .env into process.env after this module has already been imported, so reading
// at load time would capture blanks (same reasoning as send.ts / exchange.ts).
function config() {
  return {
    baseUrl: (process.env.WA_VENTERA_BASE_URL ?? "").replace(/\/$/, ""),
    intKey: process.env.WA_VENTERA_INT_KEY,
  };
}

/** The auth header every gateway call needs. */
function authHeaders(intKey: string): Record<string, string> {
  return { Authorization: `Bearer ${intKey}` };
}

/** True for any status string the gateway uses to mean "session is live". */
function isConnectedStatus(status: string): boolean {
  return /\b(ready|connected|open)\b/i.test(status);
}

/**
 * Create a WhatsApp session for a hotel.
 *
 * `slug` becomes the gateway-side session id; `label` is a human-friendly name
 * shown in the gateway UI. POSTs `{ id: slug, label }` to `<base>/api/sessions`.
 *
 * Never throws. Error codes:
 *   - "gateway_not_configured" — WA_VENTERA_BASE_URL or WA_VENTERA_INT_KEY unset.
 *   - "create_failed_<status>" — gateway answered non-2xx.
 *   - "network_error"          — the request never got an HTTP response.
 */
export async function createSession(
  slug: string,
  label?: string,
): Promise<{ ok: boolean; error?: string }> {
  const { baseUrl, intKey } = config();
  if (!baseUrl || !intKey) {
    return { ok: false, error: "gateway_not_configured" };
  }

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/sessions`, {
      method: "POST",
      headers: { ...authHeaders(intKey), "Content-Type": "application/json" },
      body: JSON.stringify({ id: slug, label }),
    });
  } catch {
    return { ok: false, error: "network_error" };
  }

  if (!res.ok) return { ok: false, error: `create_failed_${res.status}` };
  return { ok: true };
}

/**
 * Briefly consume the QR SSE stream and return the latest QR data-url + status.
 *
 * `<base>/api/sessions/{slug}/qr` is a Server-Sent Events stream that emits
 * `qr` events (data = a `data:` image URL) and `status`/`ready` events. This is
 * a serverless-friendly one-shot: it reads events until the first QR (or a
 * ready/connected status) arrives, or for up to ~8s, then aborts the stream so
 * the request can never hang.
 *
 * Never throws. On `gateway_not_configured` / non-2xx / network failure it
 * returns a status + error and no qr.
 */
export async function getSessionQr(
  slug: string,
): Promise<{ status: string; qr?: string; error?: string }> {
  const { baseUrl, intKey } = config();
  if (!baseUrl || !intKey) {
    return { status: "not_configured", error: "gateway_not_configured" };
  }

  const controller = new AbortController();
  // Hard ceiling so the stream can never hang the serverless invocation.
  const timeout = setTimeout(() => controller.abort(), 8000);

  const latest: { qr?: string; status: string } = { status: "pending" };

  try {
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/api/sessions/${encodeURIComponent(slug)}/qr`, {
        headers: { ...authHeaders(intKey), Accept: "text/event-stream" },
        signal: controller.signal,
      });
    } catch {
      return { status: "error", error: "network_error" };
    }

    if (!res.ok) return { status: "error", error: `qr_failed_${res.status}` };
    if (!res.body) return { status: latest.status };

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    // Read SSE frames (separated by a blank line) until we have what we need.
    // Returns true once the caller-visible goal is met so we can stop reading.
    const absorb = (frame: string): boolean => {
      let eventType = "message";
      const dataLines: string[] = [];
      for (const rawLine of frame.split("\n")) {
        const line = rawLine.replace(/\r$/, "");
        if (line.startsWith("event:")) {
          eventType = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          // SSE strips a single leading space after the colon.
          dataLines.push(line.slice(5).replace(/^ /, ""));
        }
      }
      if (dataLines.length === 0) return false;
      const data = dataLines.join("\n");

      // A QR arrives either as an explicit `qr` event or as a `data:` image URL.
      if (eventType === "qr" || data.startsWith("data:")) {
        latest.qr = data;
        if (latest.status === "pending") latest.status = "qr";
        return true; // first QR is enough.
      }

      // Otherwise it's a status/ready signal.
      latest.status = data || eventType;
      return isConnectedStatus(latest.status);
    };

    try {
      readLoop: for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sep: number;
        // Normalise CRLF frame separators to LF before splitting.
        buffer = buffer.replace(/\r\n/g, "\n");
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          if (absorb(frame)) break readLoop;
        }
      }
    } catch {
      // Aborted by the timeout, or the stream broke mid-read. Return whatever
      // we managed to collect rather than failing outright.
    } finally {
      controller.abort();
      reader.releaseLock?.();
    }

    return latest.qr ? { status: latest.status, qr: latest.qr } : { status: latest.status };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetch a session's current connection state.
 *
 * GETs `<base>/api/sessions/{slug}` and maps any "ready"/"connected"/"open"
 * status string (or a truthy `connected` flag) to `connected: true`. The exact
 * status field name varies, so this parses defensively across a few shapes.
 *
 * Never throws. Error codes mirror createSession.
 */
export async function getSessionStatus(
  slug: string,
): Promise<{ status: string; connected: boolean; error?: string }> {
  const { baseUrl, intKey } = config();
  if (!baseUrl || !intKey) {
    return { status: "not_configured", connected: false, error: "gateway_not_configured" };
  }

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/sessions/${encodeURIComponent(slug)}`, {
      headers: authHeaders(intKey),
    });
  } catch {
    return { status: "error", connected: false, error: "network_error" };
  }

  if (!res.ok) {
    return { status: "error", connected: false, error: `status_failed_${res.status}` };
  }

  const body = (await res.json().catch(() => ({}))) as {
    status?: unknown;
    state?: unknown;
    connection?: unknown;
    connected?: unknown;
  };

  // Prefer an explicit status string; fall back through the common field names.
  const raw =
    (typeof body.status === "string" && body.status) ||
    (typeof body.state === "string" && body.state) ||
    (typeof body.connection === "string" && body.connection) ||
    "";
  const status = raw || "unknown";
  const connected = body.connected === true || (raw !== "" && isConnectedStatus(raw));

  return { status, connected };
}

/**
 * Delete a session — used to roll back a half-finished onboarding.
 *
 * DELETEs `<base>/api/sessions/{slug}`. Never throws. Error codes mirror
 * createSession, with "delete_failed_<status>" for a non-2xx answer.
 */
export async function deleteSession(
  slug: string,
): Promise<{ ok: boolean; error?: string }> {
  const { baseUrl, intKey } = config();
  if (!baseUrl || !intKey) {
    return { ok: false, error: "gateway_not_configured" };
  }

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/sessions/${encodeURIComponent(slug)}`, {
      method: "DELETE",
      headers: authHeaders(intKey),
    });
  } catch {
    return { ok: false, error: "network_error" };
  }

  if (!res.ok) return { ok: false, error: `delete_failed_${res.status}` };
  return { ok: true };
}
