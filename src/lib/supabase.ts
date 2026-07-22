import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { getSession } from "@/lib/sso";

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

// Which hotel this deployment's portal belongs to. current_tenant() (011) reads
// it from the x-tenant-slug header to scope the PUBLIC, anonymous reads — room
// types, rates, published reviews. It is intentionally only a hint: a signed-in
// caller's tenant comes from their profile, never this header, and the header
// can only ever surface another hotel's already-public brochure. Set per
// deployment; when unset the DB falls back to the sole tenant (single-hotel).
const tenantSlug = (import.meta.env.VITE_TENANT_SLUG as string | undefined)?.trim();

export const supabase = createClient<Database>(effectiveUrl, effectiveAnonKey, {
  // Sending it on every request (not just anon ones) is harmless: when signed
  // in, current_tenant() prefers the profile and ignores the header.
  ...(tenantSlug ? { global: { headers: { "x-tenant-slug": tenantSlug } } } : {}),

  // Supabase's third-party auth hook. Identity comes from Ventera SSO, so
  // /api/sso/token mints a Supabase-compatible JWT and we present it here on
  // every request. Without it the client is anon, auth.uid() is NULL and every
  // RLS policy denies — which is what happened before this was wired up.
  //
  // Read from storage per call rather than captured once: the session appears
  // after this module is first imported, and again after each fresh login.
  accessToken: async () => getSession()?.supabase_token ?? null,
});
