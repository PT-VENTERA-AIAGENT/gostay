import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

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
 * The hotel (tenant) the signed-in user belongs to. RLS restricts `tenants` to
 * the caller's own row (`id = get_my_tenant()`), so a bare select returns just
 * that hotel. Used to brand the shell and drive the Hotel Profile editor.
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
        .select(TENANT_COLUMNS)
        .maybeSingle();
      if (error) throw error;
      return (data as Tenant) ?? null;
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
