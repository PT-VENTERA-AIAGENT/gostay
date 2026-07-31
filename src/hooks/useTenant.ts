import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { currentTenantSlug } from "@/lib/tenant";
import type { UserRole } from "@/types/database.types";

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

/** Bentuk minimal yang dibutuhkan aturan pemilihan hotel — cukup untuk diuji. */
export interface TenantChoice {
  id: string;
  slug: string;
  name: string;
}

/**
 * Hotel mana yang dimaksud halaman ini, di antara baris yang boleh dibaca.
 *
 * Urutannya: slug kunjungan ini lebih dulu, baru hotel profilnya, baru baris apa
 * adanya. Dipisahkan dari hook supaya aturannya bisa diuji sendiri — inilah yang
 * dulu tidak ada, dan ketiadaannya membuat tamu melihat hotel yang salah.
 */
export function pickTenant<T extends TenantChoice>(
  rows: readonly T[],
  slug: string | null,
  profileTenantId: string | null | undefined,
): T | null {
  if (rows.length === 0) return null;
  return (
    (slug ? rows.find((t) => t.slug === slug) : undefined) ??
    rows.find((t) => t.id === profileTenantId) ??
    rows[0]
  );
}

/**
 * Tautan ini meminta hotel A, tapi yang terbuka hotel B.
 *
 * Terjadi bila slug-nya tidak dikenal, hotelnya nonaktif, atau barisnya tak
 * terbaca. Dulu keadaan ini tidak punya nama: portal diam-diam menampilkan hotel
 * lain, dan tamu membaca nama, kamar, serta tarif yang bukan tujuannya tanpa satu
 * pun tanda bahwa ia salah tempat — lalu memesan di sana.
 */
export function isWrongHotel(slug: string | null, picked: TenantChoice | null): boolean {
  return Boolean(slug && picked && picked.slug !== slug);
}

/**
 * Petunjuk slug yang boleh dipakai untuk peran ini.
 *
 * Slug kunjungan datang dari browser — URL `?hotel=`, localStorage bekas
 * kunjungan lama, atau `VITE_TENANT_SLUG` yang ter-bake di build. Semuanya
 * konteks TAMU. Bagi staf/admin, petunjuk itu harus mati: migration 046 sudah
 * mengunci bacaan data mereka ke hotelnya sendiri, tapi shell UI masih mengikuti
 * slug — dan sejak 045 seorang admin yang juga pernah jadi tamu di hotel lain
 * BISA membaca baris tenants hotel itu. Gabungan keduanya membuat admin Lor Kali
 * membuka dashboard berkop "Kopi Rintik" hanya karena browsernya membawa slug
 * default build. Nama hotel yang salah di atas data hotel yang benar lebih
 * berbahaya daripada keduanya salah: QR WhatsApp pun di-scan atas nama hotel
 * yang keliru.
 */
export function slugHintFor(role: UserRole | null, slug: string | null): string | null {
  return role === "admin" || role === "staff" ? null : slug;
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
 *      the guest arrived through a specific hotel's door — GUESTS ONLY;
 *   2. the profile's own hotel, for staff and for a guest with no hint;
 *   3. whatever single row came back, which is the staff case anyway.
 */
export function useTenant() {
  const { session, role } = useAuth();
  const slug = slugHintFor(role, currentTenantSlug());

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

      return pickTenant((data ?? []) as Tenant[], slug, session?.tenant_id);
    },
  });

  const name = query.data?.name ?? FALLBACK_NAME;
  const initial = name.trim().charAt(0).toUpperCase() || "G";

  const wrongHotel = isWrongHotel(slug, query.data ?? null);

  return {
    ...query,
    tenant: query.data ?? null,
    name,
    initial,
    /** Slug yang diminta tautan ini, bila ada. */
    requestedSlug: slug,
    wrongHotel,
  };
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
