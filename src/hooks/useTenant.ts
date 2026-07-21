import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

export interface Tenant {
  id: string;
  name: string;
  slug: string;
}

// Shown before the tenant loads, and for anonymous visitors — who cannot read
// the tenants table (RLS seals it; see migration 013). The product name is the
// only safe generic here; a signed-in member's real hotel name replaces it.
const FALLBACK_NAME = "GoStay";

/**
 * The hotel (tenant) the signed-in user belongs to. RLS restricts `tenants` to
 * the caller's own row (`id = get_my_tenant()`), so a bare select returns just
 * that hotel — no id needed. Used to brand the shell so every page refers to
 * the correct hotel instead of a hardcoded "GoStay".
 */
export function useTenant() {
  const { session } = useAuth();

  const query = useQuery({
    queryKey: ["tenant", session?.profile_id ?? "anon"],
    enabled: !!session,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Tenant | null> => {
      const { data, error } = await supabase
        .from("tenants")
        .select("id, name, slug")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const name = query.data?.name ?? FALLBACK_NAME;
  const initial = name.trim().charAt(0).toUpperCase() || "G";

  return { ...query, tenant: query.data ?? null, name, initial };
}
