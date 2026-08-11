import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { getSession } from "@/lib/sso";
import { currentTenantSlug, portalTenantSlug } from "@/lib/tenant";

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || "";
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || "";

// createClient THROWS ("supabaseUrl is required.") when the URL is empty — and
// because this module is imported at bundle-init, that throw happens before
// React mounts, white-screening the ENTIRE app (public landing included) with
// no error boundary able to catch it. A build that shipped without
// VITE_SUPABASE_URL set is exactly how gostay.id went blank. Fall back to a
// syntactically valid placeholder so the app always boots: public pages render,
// and any data call fails loudly (caught by query error states / ErrorBoundary)
// instead of blanking everything.
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
if (!isSupabaseConfigured) {
  console.error(
    "[supabase] Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY at build time — " +
      "data features are disabled. Set them in the deployment's environment and redeploy.",
  );
}
const effectiveUrl = supabaseUrl || "https://placeholder.supabase.co";
const effectiveAnonKey = supabaseAnonKey || "placeholder-anon-key";

// Which hotel this portal visit belongs to. current_tenant() (011) reads it from
// the x-tenant-slug header to scope the PUBLIC, anonymous reads — room types,
// rates, published reviews. Resolved at runtime (src/lib/tenant.ts) so one
// deployment can serve many hotels: a WhatsApp guest's `?hotel={slug}` link wins,
// then a remembered slug, then the build-time default. It is intentionally only a
// hint: a signed-in caller's tenant comes from their profile, except for the
// guarded platform-admin portal preview; the header only surfaces public hotel
// data and never grants access by itself.
/**
 * Keep tenant context current after client-side navigation. A static
 * `global.headers` value is captured once at module load, which is especially
 * easy to get wrong when a portal link is opened in an already-running app.
 * The preview marker is only sent while the tab is inside `/portal`; the
 * database also requires the caller to be a whitelisted platform admin.
 */
const tenantFetch: typeof fetch = (input, init) => {
  const headers = new Headers(
    typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
  );
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));

  const tenantSlug = currentTenantSlug();
  if (tenantSlug) headers.set("x-tenant-slug", tenantSlug);
  else headers.delete("x-tenant-slug");

  const previewSlug = portalTenantSlug();
  const inPortal = typeof window !== "undefined" && window.location.pathname.startsWith("/portal");
  if (previewSlug && inPortal) {
    headers.set("x-portal-preview", "true");
  } else {
    headers.delete("x-portal-preview");
  }

  return globalThis.fetch(input, { ...init, headers });
};

export const supabase = createClient<Database>(effectiveUrl, effectiveAnonKey, {
  // The fetch wrapper refreshes this per request so portal navigation cannot
  // retain a stale hotel header or preview scope.
  global: { fetch: tenantFetch },

  // Supabase's third-party auth hook. Identity comes from Ventera SSO, so
  // /api/sso/token mints a Supabase-compatible JWT and we present it here on
  // every request. Without it the client is anon, auth.uid() is NULL and every
  // RLS policy denies — which is what happened before this was wired up.
  //
  // Read from storage per call rather than captured once: the session appears
  // after this module is first imported, and again after each fresh login.
  accessToken: async () => getSession()?.supabase_token ?? null,
});

/**
 * The client for the Ventera platform console — and ONLY for it.
 *
 * Cross-hotel reads are gated by `platform_admin_scope()` (035), which is
 * `is_platform_admin() AND` this `x-platform-scope: all` header. `supabase`
 * above never sends it, so every hotel-facing page is tenant-scoped for
 * everyone, an operator included: opening Pesan or Reservasi shows their own
 * hotel, not all of them. That mixing is what made two accounts show an
 * identical inbox.
 *
 * The header cannot grant anything — the policies AND it with the allowlist —
 * it only decides which world a request belongs to. Use `platformDb` in
 * platformService.ts; use `supabase` everywhere else.
 */
export const platformDb = createClient<Database>(effectiveUrl, effectiveAnonKey, {
  global: { headers: { "x-platform-scope": "all" } },
  accessToken: async () => getSession()?.supabase_token ?? null,
});
