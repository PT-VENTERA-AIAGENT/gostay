import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { currentTenantSlug } from "@/lib/tenant";

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  description: string | null;
  logo_url: string | null;
}

/** Fields a hotel's staff may edit (slug/is_active stay operator-controlled). */
export interface HotelProfileInput {
  name?: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  description?: string | null;
  logo_url?: string | null;
}

// Shown before the tenant loads, and for anonymous visitors — who cannot read
// the tenants table (RLS seals it; see migration 013). The product name is the
// only safe generic here; a signed-in member's real hotel name replaces it.
const FALLBACK_NAME = "GoStay";

const TENANT_COLUMNS = "id, name, slug, address, phone, email, description, logo_url";

/**
 * Upload a hotel logo to the public `hotel-logos` bucket and return its URL.
 * Storage RLS (023) only lets a hotel's own staff write into a folder named
 * after their tenant id, so the path leads with tenantId. Returns a public URL
 * ready to store in tenants.logo_url.
 */
export async function uploadHotelLogo(tenantId: string, file: File): Promise<string> {
  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${tenantId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("hotel-logos")
    .upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw error;
  return supabase.storage.from("hotel-logos").getPublicUrl(path).data.publicUrl;
}

/**
 * The hotel (tenant) this page is about.
 *
 * Staff read exactly one row — their own hotel — so the choice is trivial for
 * them. A GUEST is different: one person can be a guest at several hotels, and
 * since migration 045 they may read each of those rows. `profiles.tenant_id`
 * cannot express that: it holds the hotel where the person first appeared, so
 * relying on it showed a guest who arrived on Lor Kali's link the branding of
 * Kopi Rintik — the first hotel they ever messaged.
 *
 * So the hotel is chosen, in order:
 *   1. the slug this visit is for (`?hotel=`, remembered for the visit) —
 *      the guest arrived through a specific hotel's door;
 *   2. the profile's own hotel, for staff and for a guest with no hint;
 *   3. whatever single row came back, which is the staff case anyway.
 */
export function useTenant() {
  const { session } = useAuth();
  const slug = currentTenantSlug();

  const query = useQuery({
    queryKey: ["tenant", session?.profile_id ?? "anon", slug ?? "-"],
    enabled: !!session,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Tenant | null> => {
      // No `.maybeSingle()`: a guest of several hotels legitimately reads
      // several rows, and maybeSingle turns that into an error rather than a
      // choice. RLS still bounds the set to hotels this person belongs to.
      const { data, error } = await supabase.from("tenants").select(TENANT_COLUMNS);
      if (error) throw error;

      const rows = (data ?? []) as Tenant[];
      if (rows.length === 0) return null;
      return (
        (slug ? rows.find((t) => t.slug === slug) : undefined) ??
        rows.find((t) => t.id === session?.tenant_id) ??
        rows[0]
      );
    },
  });

  const name = query.data?.name ?? FALLBACK_NAME;
  const initial = name.trim().charAt(0).toUpperCase() || "G";

  return { ...query, tenant: query.data ?? null, name, initial };
}

/**
 * Update the caller's own hotel profile. RLS (022) allows only staff/admin of
 * this tenant, and a guard trigger blocks slug/is_active — so the worst a bad
 * payload can do is fail. Refreshes every useTenant reader (shell brand, footer).
 */
export function useUpdateHotelProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: HotelProfileInput }) => {
      const { data, error } = await supabase
        .from("tenants")
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select(TENANT_COLUMNS)
        .single();
      if (error) throw error;
      return data as Tenant;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenant"] }),
  });
}
