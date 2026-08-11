// Which hotel a portal visit is for.
//
// One deployment serves every hotel's guest portal, so the tenant cannot come
// from the build. A WhatsApp guest arrives on a link that names their hotel —
// `?hotel={slug}` — which we resolve at runtime, remember for the rest of the
// visit (and future visits), and hand to Supabase as the `x-tenant-slug` hint
// (scopes anonymous public reads) and to SSO provisioning (a brand-new guest who
// signs up here joins that hotel). None of this decides private data: the
// signed-in caller's tenant comes from their profile (`get_my_tenant()`), with
// one guarded exception for a platform admin explicitly previewing a portal —
// see migration 052.

const STORAGE_KEY = "gostay_tenant_slug";
const PORTAL_SESSION_KEY = "gostay_portal_tenant_slug";

function validSlug(raw: string | null): string | null {
  const slug = raw?.trim().toLowerCase();
  // Only accept a well-formed slug so a junk query can't poison the header.
  return slug && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug) ? slug : null;
}

/** The explicit hotel named by the current URL, without any browser fallback. */
export function tenantSlugFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return validSlug(new URLSearchParams(window.location.search).get("hotel"));
  } catch {
    return null;
  }
}

/**
 * The portal hotel for the current tab, when it was explicitly selected.
 *
 * Internal portal links do not carry the `?hotel=` query forward. Remembering
 * this value in sessionStorage keeps the selected hotel through that visit,
 * while avoiding a stale localStorage value accidentally turning a dashboard
 * into a preview of some hotel visited earlier.
 */
export function portalTenantSlug(): string | null {
  if (typeof window === "undefined" || !window.location.pathname.startsWith("/portal")) {
    return null;
  }

  const fromUrl = tenantSlugFromUrl();
  if (fromUrl) {
    try {
      sessionStorage.setItem(PORTAL_SESSION_KEY, fromUrl);
    } catch {
      /* private mode / storage disabled — the URL value still applies */
    }
    return fromUrl;
  }

  try {
    return validSlug(sessionStorage.getItem(PORTAL_SESSION_KEY));
  } catch {
    return null;
  }
}

/**
 * The hotel slug for this visit, in priority order:
 *   1. `?hotel={slug}` in the URL — the WhatsApp link. Remembered on sight.
 *   2. The slug remembered from an earlier visit (localStorage).
 *   3. The build-time default (VITE_TENANT_SLUG) for a single-hotel deployment.
 * Null when nothing is known — the DB then falls back to the sole tenant while
 * exactly one exists, and to "no hotel" once several do.
 */
export function currentTenantSlug(): string | null {
  const fromUrl = tenantSlugFromUrl();
  if (fromUrl) {
    try {
      localStorage.setItem(STORAGE_KEY, fromUrl);
    } catch {
      /* private mode / storage disabled — the URL value still applies this load */
    }
    return fromUrl;
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
  } catch {
    /* ignore */
  }
  const env = (import.meta.env.VITE_TENANT_SLUG as string | undefined)?.trim();
  return env || null;
}
