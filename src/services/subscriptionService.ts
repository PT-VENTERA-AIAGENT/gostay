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
  /** Jumlah yang benar-benar sudah masuk (058); status hanyalah ringkasannya. */
  paid_total: number;
  note: string | null;
  /** Catatan mesin: kurang bayar, bayar ganda, atau bayar atas tagihan yang dibebaskan (057). */
  gateway_note: string | null;
  /** Kenapa tagihan ini dibebaskan (059). */
  waived_reason: string | null;
  /** Ada tautan Xendit terbit untuk tagihan ini — menghapusnya berbahaya (059). */
  gateway_ref: string | null;
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
      .select("id,tenant_id,period,amount,status,paid_total,paid_at,paid_method,note,gateway_note,waived_reason,gateway_ref,updated_by,tenants(name,slug)")
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
    const inv: SubscriptionInvoice = { ...rest, amount: Number(rest.amount), paid_total: Number(rest.paid_total ?? 0) };
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
    .select("id,tenant_id,period,amount,status,paid_total,paid_at,paid_method,note,gateway_note,waived_reason,gateway_ref,updated_by")
    .eq("tenant_id", tenantId)
    .order("period", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({ ...r, amount: Number(r.amount), paid_total: Number(r.paid_total ?? 0) }));
}

/**
 * Terbitkan tagihan yang belum ada — SEMUA bulan yang terlewat, bukan hanya
 * bulan ini.
 *
 * Dikerjakan fungsi DB `ensure_subscription_invoices` (058), bukan di sini:
 * gerbang tunggakan hanya seadil daftar tagihannya, dan kalau penerbitan
 * bergantung pada ingatan operator, hotel yang terlewat tidak pernah tertagih
 * sekaligus tidak pernah tergerbang. Idempoten — yang sudah ada dilewati apa
 * adanya, termasuk yang sudah lunas. Mengembalikan jumlah yang benar-benar baru.
 */
export async function issueInvoices(tenantId?: string): Promise<number> {
  const { data, error } = await (platformDb as any).rpc("ensure_subscription_invoices", {
    p_tenant: tenantId ?? null,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

/**
 * Catat transfer yang sudah diterima Ventera.
 *
 * Yang ditulis adalah PEMBAYARAN-nya, bukan status tagihannya: status dihitung
 * ulang trigger 058 dari jumlah isi buku. Itu yang membuat pembayaran sebagian
 * ("baru transfer separuh") punya tempat, dan membuat "lunas" tidak pernah ada
 * tanpa uang di belakangnya.
 *
 * Nominalnya = sisa yang belum tertutup, supaya menekan tombol pada tagihan
 * yang sudah dibayar sebagian tidak mencatat uang dua kali lipat.
 */
export async function recordManualPayment(
  invoice: Pick<SubscriptionInvoice, "id" | "tenant_id" | "amount" | "paid_total">,
  by: string,
  opts: { method?: "transfer" | "cash" | "adjustment"; note?: string } = {},
): Promise<void> {
  const sisa = Math.max(0, invoice.amount - invoice.paid_total);
  if (sisa <= 0) return;
  const { error } = await db.from("subscription_payments").insert({
    tenant_id: invoice.tenant_id,
    invoice_id: invoice.id,
    amount: sisa,
    method: opts.method ?? "transfer",
    recorded_by: by,
    note: opts.note ?? null,
  });
  if (error) throw error;
}

/**
 * Batalkan pencatatan pembayaran manual sebuah tagihan.
 *
 * Hanya yang dicatat tangan. Pembayaran online adalah bukti uang yang benar
 * BENAR-BENAR masuk ke akun Xendit Ventera; menghapusnya dari sini tidak
 * mengembalikan uangnya, hanya menghapus jejaknya — jadi ia ditolak dan
 * operator diberi tahu alasannya.
 */
export async function undoManualPayments(invoiceId: number): Promise<void> {
  const { data, error: readErr } = await db
    .from("subscription_payments")
    .select("id,method")
    .eq("invoice_id", invoiceId);
  if (readErr) throw readErr;
  const rows = (data ?? []) as Array<{ id: number; method: string }>;
  if (rows.some((r) => r.method === "xendit")) {
    throw new Error(
      "Tagihan ini punya pembayaran online. Uangnya sudah masuk ke Xendit — hapus jejaknya tidak mengembalikannya.",
    );
  }
  if (rows.length === 0) return;
  // Filternya diulang di DELETE, bukan hanya di pemeriksaan di atas: callback
  // Xendit yang mendarat di antara keduanya akan ikut terhapus, dan itu persis
  // yang hendak dicegah. Pemeriksaan tadi tetap ada supaya pesannya jelas.
  const { error } = await db
    .from("subscription_payments")
    .delete()
    .eq("invoice_id", invoiceId)
    .neq("method", "xendit");
  if (error) throw error;
}

/**
 * Terbitkan satu tagihan di luar jadwal.
 *
 * Penerbitan otomatis hanya tahu tarif bulanan hotel; ini untuk bulan atau
 * nominal yang tidak mengikuti pola itu. Periodenya dinormalkan ke tanggal 1
 * oleh trigger 055, dan UNIQUE (tenant_id, period) menahan tagihan kembar —
 * jadi menagih bulan yang sudah punya tagihan ditolak database, bukan
 * menghasilkan dua baris untuk bulan yang sama.
 */
export async function createManualInvoice(input: {
  tenantId: string;
  period: string;          // YYYY-MM-01 (tanggal berapa pun di bulan itu diterima)
  amount: number;
  by: string;
  note?: string;
}): Promise<void> {
  const amount = Math.max(0, Math.round(input.amount));
  const { error } = await db.from("hotel_subscription_invoices").insert({
    tenant_id: input.tenantId,
    period: input.period,
    amount,
    note: input.note ?? null,
    updated_by: input.by,
  });
  if (error) throw error;
}

/**
 * Lepas sebuah tagihan: dibebaskan, bukan dihapus.
 *
 * Tagihan yang dibebaskan keluar dari perhitungan gerbang (subscription_gate
 * hanya menghitung yang 'unpaid'), tapi barisnya tetap ada beserta alasannya —
 * tiga bulan lagi tidak ada yang ingat kenapa hotel itu tidak jadi ditagih
 * kalau jejaknya hilang.
 */
export async function setInvoiceWaived(
  id: number, waived: boolean, by: string, reason?: string,
): Promise<void> {
  const { error } = await db
    .from("hotel_subscription_invoices")
    .update({
      status: waived ? "waived" : "unpaid",
      waived_reason: waived ? (reason?.trim() || null) : null,
      updated_by: by,
    })
    .eq("id", id);
  if (error) throw error;
}

/**
 * Hapus tagihan yang salah terbit.
 *
 * Hanya untuk membetulkan kekeliruan penerbitan. Tagihan yang sudah punya
 * pembayaran ditolak trigger 059 — menghapusnya akan ikut menghapus catatan
 * uang yang benar-benar sudah diterima Ventera (ON DELETE CASCADE), tanpa
 * mengembalikan uangnya. Untuk kasus itu jawabannya membebaskan, bukan menghapus.
 */
export async function deleteInvoice(id: number): Promise<void> {
  const { error } = await db.from("hotel_subscription_invoices").delete().eq("id", id);
  if (error) throw error;
}
