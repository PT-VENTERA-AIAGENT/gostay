import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { getSession } from "@/lib/sso";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase environment variables are not set. See .env.example.");
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  // Supabase's third-party auth hook. Identity comes from Ventera SSO, so
  // /api/sso/token mints a Supabase-compatible JWT and we present it here on
  // every request. Without it the client is anon, auth.uid() is NULL and every
  // RLS policy denies — which is what happened before this was wired up.
  //
  // Read from storage per call rather than captured once: the session appears
  // after this module is first imported, and again after each fresh login.
  accessToken: async () => getSession()?.supabase_token ?? null,
});
