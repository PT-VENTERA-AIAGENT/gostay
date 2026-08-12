import { platformDb } from "@/lib/supabase";
import type { BillingMode } from "./adminPaymentService";

// Tagihan langganan bulanan — sisi konsol platform (Ventera super admin).
//
// Uangnya TIDAK lewat GoStay: hotel yang memilih model langganan mentransfer
// biaya bulanannya langsung ke Ventera, lalu operator menandainya lunas di sini.
// Jadi tabel `hotel_subscription_invoices` bukan gateway pembayaran, melainkan
// buku tagihan: siapa menagih berapa untuk bulan apa, dan sudah masuk atau
// belum. Karena itu semua tulisan di file ini butuh platformDb (header
// `x-platform-scope: all`) — RLS 055 hanya mengizinkan platform menulisnya,
// hotel cuma boleh membaca barisnya sendiri.
//
// Untyped cast: tabel-tabel ini belum ada di generated types.
const db = platformDb as unknown as { from: (table: string) => any };

export type InvoiceStatus = "unpaid" | "paid" | "waived";

export interface SubscriptionInvoice {
  id: number;
  tenant_id: string;
  period: string;              // tanggal 1 bulan yang ditagih (YYYY-MM-DD)
  amount: number;
  status: InvoiceStatus;
  paid_at: string | null;
  paid_method: string | null;
  note: string | null;
  /** Catatan mesin: kurang bayar, bayar ganda, atau bayar atas tagihan yang dibebaskan (057). */
  gateway_note: string | null;
  updated_by: string | null;
}

export interface SubscriptionHotel {
  tenant_id: string;
  name: string;
  slug: string;
  /** 'commission' = sudah tidak berlangganan, tapi masih punya tagihan terbuka. */
  billing_mode: BillingMode;
  subscription_amount: number;
  subscription_day: number;
  subscription_since: string | null;
  invoices: SubscriptionInvoice[];
  /** Tagihan bulan berjalan, kalau sudah dibuat. */
  current: SubscriptionInvoice | null;
  /** Bulan lewat yang belum lunas (tidak termasuk bulan berjalan). */
  overdue_count: number;
  overdue_amount: number;
}

/** Tanggal 1 bulan dari sebuah tanggal, dalam bentuk YYYY-MM-DD. */
export function periodOf(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/** "Agustus 2026" — label periode yang dibaca manusia. */
export function periodLabel(period: string, locale = "id-ID"): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, 1).toLocaleDateString(locale, { month: "long", year: "numeric" });
}

/**
 * Semua hotel berlangganan beserta riwayat tagihannya, DITAMBAH hotel yang
 * sudah pindah kembali ke komisi tapi masih meninggalkan tagihan belum lunas.
 *
 * Bagian kedua itu bukan kelengkapan yang manis-manis saja: kalau daftar ini
 * dikunci ke `billing_mode = 'subscription'`, satu klik "Potongan 7%" akan
 * menghapus hotel yang menunggak dari layar penagihan berikut utangnya. Karena
 * itu tagihan diambil di query terpisah dan hotel tanpa langganan aktif tetap
 * ditarik masuk selama masih ada yang belum lunas.
 *
 * Batasnya `monthsBack`: tagihan yang lebih tua dari itu tidak ikut terbaca,
 * jadi hotel yang HANYA menunggak di luar jendela itu tidak muncul sama sekali.
 * 12 bulan dipilih supaya layar tetap terbaca; kalau suatu saat ada tunggakan
 * yang lebih tua dari setahun, ia perlu dicari lewat query, bukan lewat layar ini.
 */
export async function listSubscriptions(monthsBack = 12): Promise<SubscriptionHotel[]> {
  const from = new Date();
  from.setMonth(from.getMonth() - monthsBack);
  const since = periodOf(from);
  const now = periodOf();

  const [cfgRes, invRes] = await Promise.all([
    db.from("hotel_payment_config")
      .select("tenant_id,billing_mode,subscription_amount,subscription_day,subscription_since,tenants(name,slug)")
      .eq("billing_mode", "subscription"),
    db.from("hotel_subscription_invoices")
      // Nama hotel ikut ditarik di sini supaya baris tagihan tetap bisa
      // ditampilkan meski hotelnya tidak ada lagi di daftar langganan aktif.
      .select("id,tenant_id,period,amount,status,paid_at,paid_method,note,gateway_note,updated_by,tenants(name,slug)")
      .gte("period", since)
      .order("period", { ascending: false }),
  ]);
  if (cfgRes.error) throw cfgRes.error;
  if (invRes.error) throw invRes.error;

  const invoices = (invRes.data ?? []) as any[];
  const byTenant = new Map<string, SubscriptionInvoice[]>();
  const namaTenant = new Map<string, { name: string; slug: string }>();
  for (const raw of invoices) {
    const { tenants, ...rest } = raw;
    const inv: SubscriptionInvoice = { ...rest, amount: Number(rest.amount) };
    if (tenants) namaTenant.set(inv.tenant_id, { name: tenants.name ?? "—", slug: tenants.slug ?? "" });
    const list = byTenant.get(inv.tenant_id);
    if (list) list.push(inv);
    else byTenant.set(inv.tenant_id, [inv]);
  }

  const rows: SubscriptionHotel[] = ((cfgRes.data ?? []) as any[]).map((c) => {
    const list = byTenant.get(c.tenant_id) ?? [];
    const late = list.filter((i) => i.status === "unpaid" && i.period < now);
    return {
      tenant_id: c.tenant_id,
      name: c.tenants?.name ?? "—",
      slug: c.tenants?.slug ?? "",
      billing_mode: "subscription",
      subscription_amount: Number(c.subscription_amount ?? 0),
      subscription_day: Number(c.subscription_day ?? 1),
      subscription_since: c.subscription_since ?? null,
      invoices: list,
      current: list.find((i) => i.period === now) ?? null,
      overdue_count: late.length,
      overdue_amount: late.reduce((s, i) => s + i.amount, 0),
    };
  });
  // Hotel yang sudah tidak berlangganan tapi masih punya tagihan terbuka.
  // Mereka tidak muncul di cfgRes (difilter ke 'subscription'), dan justru
  // merekalah yang paling perlu ditagih.
  const sudahAda = new Set(rows.map((r) => r.tenant_id));
  for (const [tenantId, list] of byTenant) {
    if (sudahAda.has(tenantId)) continue;
    const belumLunas = list.filter((i) => i.status === "unpaid");
    if (belumLunas.length === 0) continue;
    const late = belumLunas.filter((i) => i.period < now);
    const t = namaTenant.get(tenantId);
    rows.push({
      tenant_id: tenantId,
      name: t?.name ?? "—",
      slug: t?.slug ?? "",
      billing_mode: "commission",          // penanda "mantan langganan"
      subscription_amount: 0,
      subscription_day: 1,
      subscription_since: null,
      invoices: list,
      current: list.find((i) => i.period === now) ?? null,
      overdue_count: late.length,
      overdue_amount: late.reduce((s, i) => s + i.amount, 0),
    });
  }

  return rows.sort((a, b) => b.overdue_count - a.overdue_count || a.name.localeCompare(b.name));
}

/** Riwayat tagihan satu hotel (dipakai halaman detail hotel & halaman Saldo). */
export async function listHotelInvoices(tenantId: string, limit = 12): Promise<SubscriptionInvoice[]> {
  const { data, error } = await db
    .from("hotel_subscription_invoices")
    .select("id,tenant_id,period,amount,status,paid_at,paid_method,note,gateway_note,updated_by")
    .eq("tenant_id", tenantId)
    .order("period", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({ ...r, amount: Number(r.amount) }));
}

/**
 * Terbitkan tagihan satu bulan untuk sekumpulan hotel.
 *
 * `ignoreDuplicates` membuat tombol "Terbitkan tagihan bulan ini" aman ditekan
 * dua kali: hotel yang tagihannya sudah ada dilewati apa adanya — termasuk yang
 * sudah dilunasi, yang kalau ditimpa akan kembali jadi belum bayar.
 * Mengembalikan jumlah tagihan yang benar-benar baru.
 */
export async function issueInvoices(
  hotels: Array<{ tenant_id: string; subscription_amount: number }>,
  period: string,
  by: string,
): Promise<number> {
  const rows = hotels
    .filter((h) => h.subscription_amount > 0)
    .map((h) => ({ tenant_id: h.tenant_id, period, amount: h.subscription_amount, updated_by: by }));
  if (rows.length === 0) return 0;
  const { data, error } = await db
    .from("hotel_subscription_invoices")
    .upsert(rows, { onConflict: "tenant_id,period", ignoreDuplicates: true })
    .select("id");
  if (error) throw error;
  return (data ?? []).length;
}

/**
 * Catat pembayaran offline (atau batalkan pencatatannya).
 *
 * `paid_at` tidak dikirim dari sini — trigger 055 yang mengisinya saat status
 * jadi 'paid' dan membersihkannya saat kembali 'unpaid', supaya waktu lunas
 * selalu waktu server, bukan jam di komputer operator.
 */
export async function setInvoiceStatus(
  id: number,
  status: InvoiceStatus,
  by: string,
  opts: { method?: string; note?: string } = {},
): Promise<void> {
  const patch: Record<string, unknown> = { status, updated_by: by };
  if (status === "paid") patch.paid_method = opts.method ?? "transfer";
  else patch.paid_method = null;
  if (opts.note !== undefined) patch.note = opts.note;
  const { error } = await db.from("hotel_subscription_invoices").update(patch).eq("id", id);
  if (error) throw error;
}
