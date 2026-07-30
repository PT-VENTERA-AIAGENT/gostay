// Menukar token tautan portal menjadi sesi tamu.
//
// Pasangan dari portal-token.ts: di sana tokennya dibuat dan dikirim lewat
// WhatsApp, di sini ia ditukar menjadi sesi yang sama bentuknya dengan hasil
// login SSO — supaya frontend tidak perlu tahu bedanya.
//
// ─── Yang membuat ini aman ───────────────────────────────────────────────────
// Tanda tangan token membuktikan SIAPA, tapi tidak membuktikan apa yang boleh.
// Kewenangan tetap dibaca dari database, dan dibatasi berlapis:
//
//   1. Tamu itu harus benar-benar ada DI HOTEL yang disebut token. Baris
//      `customers` dicari dengan kedua id sekaligus, jadi token hotel A tidak
//      pernah membuka apa pun di hotel B.
//   2. Profilnya harus BERPERAN 'customer'. Ini yang menutup kemungkinan paling
//      merugikan: sebuah tautan yang bocor tidak boleh menjadi pintu masuk ke
//      dashboard staf, bahkan bila suatu hari seorang staf punya baris customer.
//   3. Profilnya harus aktif. Penonaktifan oleh admin harus berlaku di sini juga.
//
// Sesinya sendiri berumur pendek (sama dengan sesi SSO), sehingga token yang
// tinggal di riwayat chat tidak berubah menjadi sesi yang hidup selamanya.

import { mintSupabaseToken } from "../identity";
import { serviceGet } from "./client";
import { readPortalToken } from "./portal-token";

/** Seumur sesi SSO — token tautan boleh panjang umur, sesinya tidak. */
const SESSION_SECONDS = 60 * 60;

export interface PortalSessionResult {
  status: number;
  body: Record<string, unknown>;
}

interface CustomerRow {
  id: string;
  tenant_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  profiles: { id: string; role: string; is_active: boolean } | null;
}

/**
 * Tukar token menjadi sesi tamu.
 *
 * Setiap penolakan menjawab hal yang sama (`invalid_token`): membedakan
 * "kedaluwarsa" dari "tidak ada" hanya berguna bagi orang yang sedang menebak.
 */
export async function exchangePortalToken(
  token: string | undefined,
  nowMs: number = Date.now(),
): Promise<PortalSessionResult> {
  const payload = readPortalToken(token, nowMs);
  if (!payload) return { status: 401, body: { error: "invalid_token" } };

  let rows: CustomerRow[];
  try {
    const res = await serviceGet(
      `customers?id=eq.${encodeURIComponent(payload.customerId)}` +
        `&tenant_id=eq.${encodeURIComponent(payload.tenantId)}` +
        `&select=id,tenant_id,full_name,email,phone,profiles(id,role,is_active)&limit=1`,
    );
    if (!res.ok) return { status: 502, body: { error: "lookup_failed" } };
    rows = (await res.json()) as CustomerRow[];
  } catch {
    return { status: 502, body: { error: "lookup_failed" } };
  }

  const customer = rows[0];
  const profile = customer?.profiles ?? null;
  // Tamu tanpa profil tidak bisa diberi sesi: `auth.uid()` harus menunjuk baris
  // profiles yang nyata, atau setiap kebijakan RLS menolaknya.
  if (!customer || !profile) return { status: 401, body: { error: "invalid_token" } };
  if (profile.is_active === false) return { status: 403, body: { error: "account_disabled" } };
  // Hanya tamu. Lihat catatan di kepala berkas.
  if (profile.role !== "customer") return { status: 403, body: { error: "not_a_guest" } };

  const issuedAt = Math.floor(nowMs / 1000);
  const supabaseToken = mintSupabaseToken({
    profileId: profile.id,
    email: customer.email ?? undefined,
    issuedAt,
    expiresAt: issuedAt + SESSION_SECONDS,
  });
  if (!supabaseToken) return { status: 500, body: { error: "signing_unavailable" } };

  return {
    status: 200,
    body: {
      supabase_token: supabaseToken,
      profile_id: profile.id,
      role: profile.role,
      tenant_id: customer.tenant_id,
      expires_in: SESSION_SECONDS,
      user: {
        id: profile.id,
        name: customer.full_name ?? null,
        email: customer.email ?? null,
        phone_number: customer.phone ?? null,
      },
    },
  };
}
