import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { getSession } from "@/lib/sso";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase environment variables are not set. See .env.example.");
}

// Which hotel this deployment's portal belongs to. current_tenant() (011) reads
// it from the x-tenant-slug header to scope the PUBLIC, anonymous reads — room
// types, rates, published reviews. It is intentionally only a hint: a signed-in
// caller's tenant comes from their profile, never this header, and the header
// can only ever surface another hotel's already-public brochure. Set per
// deployment; when unset the DB falls back to the sole tenant (single-hotel).
const tenantSlug = (import.meta.env.VITE_TENANT_SLUG as string | undefined)?.trim();

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
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
