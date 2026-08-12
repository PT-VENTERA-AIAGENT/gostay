// Pembayaran online untuk tagihan langganan bulanan Ventera (migration 056).
//
// Berbeda dari pembayaran reservasi dalam satu hal yang menentukan segalanya:
// uangnya milik VENTERA, bukan hotel. Karena itu jalur ini TIDAK PERNAH menulis
// ke tabel `payments` — satu baris di sana memicu credit_hotel_balance(), yang
// akan mengkredit saldo hotel dengan uang yang justru ditagihkan kepadanya dan
// memotong 7% dari pendapatan Ventera sendiri. Pelunasan di sini hanya mengubah
// `hotel_subscription_invoices`.
//
// Jalur pulangnya menumpang webhook yang sudah ada. Router callback Ventera
// memilih tujuan dari awalan `GOSTAY-`, jadi external_id langganan tetap
// memakai awalan itu dan membedakan dirinya dengan penanda `SUB-` sesudahnya.

import { serviceGet, serviceUpdate } from "../wa/client";
import { createInvoiceViaGateway, isGatewayConfigured } from "./gateway";
import { envForMode, type PaymentMode } from "./xendit";

/** Awalan yang dipakai router callback Ventera untuk mengenali proyek ini. */
const PREFIX = "GOSTAY-";
/** Penanda "ini tagihan langganan, bukan reservasi". */
const SUB_MARKER = "SUB-";

/**
 * Umur tautan pembayaran, dan sekaligus jangka pakai-ulangnya. SATU angka untuk
 * keduanya, dan itu disengaja.
 *
 * Kalau jangka pakai-ulang lebih pendek daripada umur invoice di Xendit (bawaan
 * akun ±24 jam), ada jendela ketika tautan LAMA masih bisa dibayar padahal
 * barisnya sudah menunjuk ke tautan baru. Hotel yang membayar dari tab lama
 * atau dari email Xendit akan mengirim uangnya masuk ke akun Ventera sementara
 * tagihannya tetap tercatat belum lunas — lalu ditagih ulang bulan depan.
 *
 * Dengan mengunci invoice_duration ke angka yang sama, tautan lama sudah pasti
 * mati pada detik kita boleh menerbitkan penggantinya.
 */
const INVOICE_TTL_SECONDS = 20 * 60 * 60;
// Margin setengah jam: `gateway_issued_at` dicatat dengan jam KITA setelah
// Xendit membuat invoicenya, dan dua jam itu tidak identik. Tanpa margin, di
// ujung jangka ada saat tautannya sudah ditutup Xendit sementara kita masih
// menganggapnya hidup — hotel menekan Bayar dan mendapat halaman kedaluwarsa.
const REUSE_WINDOW_MS = (INVOICE_TTL_SECONDS - 30 * 60) * 1000;

function slugSegment(hotelSlug: string): string {
  return (hotelSlug ?? "").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * external_id tagihan langganan: `GOSTAY-SUB-<HOTEL>-<YYYYMM>` (+ `-R<n>` pada
 * percobaan ulang).
 *
 * Bentuknya harus bisa dibaca manusia di dashboard Xendit — di sana tagihan
 * langganan berbaur dengan pembayaran tamu, dan tanpa nama hotel + bulan,
 * keduanya cuma deretan kode. Yang dipakai program untuk menemukan barisnya
 * BUKAN string ini melainkan kolom yang kita simpan sendiri (lihat
 * findInvoiceForCallback) — penormalan slug di atas bersifat lossy dan tidak
 * bisa dibalik dengan aman.
 */
export function subscriptionExternalId(hotelSlug: string | null, period: string, attempt = 0): string {
  const hotel = slugSegment(hotelSlug ?? "");
  const yyyymm = (period ?? "").slice(0, 7).replace("-", "");
  const base = hotel
    ? `${PREFIX}${SUB_MARKER}${hotel}-${yyyymm}`
    : `${PREFIX}${SUB_MARKER}${yyyymm}`;
  return attempt > 0 ? `${base}-R${attempt}` : base;
}

/**
 * Apakah sebuah external_id milik tagihan langganan, bukan reservasi.
 *
 * Awalannya saja TIDAK cukup. external_id reservasi berbentuk
 * `GOSTAY-<SLUG>-BK-…`, jadi hotel yang slug-nya kebetulan dimulai "sub"
 * (mis. `sub-urban-stay`) menghasilkan `GOSTAY-SUB-URBAN-STAY-BK-…` dan akan
 * dibajak masuk ke cabang langganan: pembayaran tamunya dijawab 404, tidak
 * pernah tercatat, dan saldo hotel itu tidak pernah dikredit — diam-diam, dan
 * hanya untuk hotel itu. Karena itu dua syarat lagi: tidak boleh mengandung
 * penanda booking, dan ekornya harus berbentuk periode YYYYMM (+ -R<n>).
 *
 * Penanda booking-nya dicocokkan dengan BENTUK referensinya (`-BK-<8 digit>-`),
 * bukan sekadar "-BK-". Kalau hanya potongan itu, hotel dengan segmen slug `bk`
 * (mis. `sub-bk-inn` → `GOSTAY-SUB-BK-INN-202608`) justru terlempar ke arah
 * sebaliknya: tagihan langganannya dibaca sebagai reservasi dan dijawab 404.
 */
export function isSubscriptionExternalId(externalId: string | undefined): boolean {
  const id = externalId ?? "";
  return id.startsWith(PREFIX + SUB_MARKER)
    && !/-BK-\d{8}-/.test(id)
    && /-\d{6}(-R\d+)?$/.test(id);
}

/** external_id tanpa sufiks percobaan ulang — penanda satu bulan tagihan. */
function baseExternalId(externalId: string): string {
  return externalId.replace(/-R\d+$/, "");
}

export interface SubscriptionInvoiceRow {
  id: number;
  tenant_id: string;
  period: string;
  amount: number;
  status: "unpaid" | "paid" | "waived";
  gateway_ref: string | null;
  gateway_external_id: string | null;
  gateway_url: string | null;
  gateway_env: "live" | "test" | null;
  gateway_issued_at: string | null;
  gateway_attempt: number;
}

const INVOICE_COLUMNS =
  "id,tenant_id,period,amount,status,gateway_ref,gateway_external_id,gateway_url,gateway_env,gateway_issued_at,gateway_attempt";

function toRow(raw: any): SubscriptionInvoiceRow {
  return { ...raw, amount: Number(raw.amount), gateway_attempt: Number(raw.gateway_attempt ?? 0) };
}

/** Lingkungan penagihan Ventera sendiri — terpisah dari mode pembayaran hotel. */
export async function getSubscriptionMode(): Promise<PaymentMode> {
  const res = await serviceGet("payment_config?id=eq.true&select=subscription_mode&limit=1");
  if (!res.ok) return "test";  // gagal baca = jangan menagih dengan uang sungguhan
  const rows = (await res.json()) as Array<{ subscription_mode?: string }>;
  return rows[0]?.subscription_mode === "live" ? "live" : "test";
}

export async function getSubscriptionInvoice(id: number): Promise<SubscriptionInvoiceRow | null> {
  const res = await serviceGet(
    `hotel_subscription_invoices?id=eq.${encodeURIComponent(String(id))}&select=${INVOICE_COLUMNS}&limit=1`,
  );
  if (!res.ok) throw new Error(`subscription_invoice_read_failed_${res.status}`);
  const rows = (await res.json()) as any[];
  return rows[0] ? toRow(rows[0]) : null;
}

/** Hotel pemilik sebuah profil — sumber kebenaran kepemilikan, bukan kiriman peramban. */
export async function profileTenantId(profileId: string): Promise<string | null> {
  const res = await serviceGet(
    `profiles?id=eq.${encodeURIComponent(profileId)}&select=tenant_id,role,is_active&limit=1`,
  );
  if (!res.ok) throw new Error(`profile_read_failed_${res.status}`);
  const rows = (await res.json()) as Array<{ tenant_id?: string; role?: string; is_active?: boolean }>;
  const p = rows[0];
  // Hanya orang hotel. Tamu tidak boleh menerbitkan tagihan langganan siapa pun.
  if (!p || p.is_active === false || (p.role !== "staff" && p.role !== "admin")) return null;
  return p.tenant_id ?? null;
}

export async function hotelIdentity(tenantId: string): Promise<{ slug: string | null; name: string | null }> {
  const res = await serviceGet(`tenants?id=eq.${encodeURIComponent(tenantId)}&select=slug,name&limit=1`);
  if (!res.ok) return { slug: null, name: null };
  const rows = (await res.json()) as Array<{ slug?: string; name?: string }>;
  return { slug: rows[0]?.slug ?? null, name: rows[0]?.name ?? null };
}

/**
 * Temukan tagihan yang dimaksud sebuah callback.
 *
 * Dicari lewat kolom yang KAMI tulis saat menerbitkan invoice — id Xendit lebih
 * dulu, lalu external_id apa adanya. Tidak ada penguraian string: nama hotel di
 * external_id sudah dinormalkan dan tidak bisa dikembalikan jadi slug dengan
 * pasti, jadi menebaknya dari sana akan salah pada hotel tertentu saja — bug
 * yang muncul belakangan dan sulit ditemukan.
 */
export async function findInvoiceForCallback(
  gatewayRef: string,
  externalId: string,
): Promise<SubscriptionInvoiceRow | null> {
  const byRef = await serviceGet(
    `hotel_subscription_invoices?gateway_ref=eq.${encodeURIComponent(gatewayRef)}&select=${INVOICE_COLUMNS}&limit=1`,
  );
  if (byRef.ok) {
    const rows = (await byRef.json()) as any[];
    if (rows[0]) return toRow(rows[0]);
  }
  const byExt = await serviceGet(
    `hotel_subscription_invoices?gateway_external_id=eq.${encodeURIComponent(externalId)}&select=${INVOICE_COLUMNS}&limit=1`,
  );
  if (byExt.ok) {
    const rows = (await byExt.json()) as any[];
    if (rows[0]) return toRow(rows[0]);
  }

  // Upaya ketiga: cocokkan bulannya saja, tanpa sufiks percobaan ulang.
  //
  // Baris tagihan hanya menyimpan SATU gateway_external_id — yang terakhir
  // diterbitkan. Kalau dua tab menekan Bayar hampir bersamaan, invoice yang
  // kalah menjadi yatim: masih bisa dibayar, tapi tidak lagi ditunjuk barisnya.
  // Tanpa upaya ini pembayaran atas invoice itu dijawab 404 — uangnya sudah
  // masuk ke akun Ventera sementara tagihannya tetap tercatat belum lunas.
  // `GOSTAY-SUB-<HOTEL>-<YYYYMM>` unik per hotel per bulan, jadi mencocokkan
  // awalannya tidak bisa nyasar ke tagihan bulan atau hotel lain.
  const base = baseExternalId(externalId);
  // Wildcard DINETRALKAN. encodeURIComponent tidak meng-escape `*`, `%`, atau
  // `_`, dan string ini datang dari badan callback: sebuah panggilan berbekal
  // token internal dengan external_id "GOSTAY-SUB-*-202608" akan mencocokkan
  // tagihan bulan itu milik hotel MANA PUN dan melunasinya. Hanya bentuk yang
  // kita terbitkan sendiri yang boleh lewat.
  if (!/^[A-Z0-9-]+$/.test(base)) return null;
  const byBase = await serviceGet(
    `hotel_subscription_invoices?gateway_external_id=like.${encodeURIComponent(base)}*&select=${INVOICE_COLUMNS}&order=id.desc&limit=1`,
  );
  if (byBase.ok) {
    const rows = (await byBase.json()) as any[];
    if (rows[0]) return toRow(rows[0]);
  }
  return null;
}

/**
 * PATCH satu tagihan; mengembalikan BERAPA BARIS yang benar-benar berubah.
 *
 * `return=representation` bukan kemewahan: dengan `return=minimal` PostgREST
 * menjawab 204 baik ketika satu baris terupdate maupun nol, jadi pelunasan yang
 * filternya tidak kena apa-apa (tagihan sudah dibebaskan, atau callback lain
 * mendahului) akan terbaca sebagai sukses — uang masuk, baris tidak berubah,
 * dan tidak ada satu pun jejak.
 */
async function patchInvoice(
  id: number,
  patch: Record<string, unknown>,
  extraFilter = "",
): Promise<number> {
  // serviceUpdate menerima path+filter sebagai SATU argumen (lihat wa/client.ts),
  // bukan tabel dan filter terpisah.
  const res = await serviceUpdate(
    `hotel_subscription_invoices?id=eq.${encodeURIComponent(String(id))}${extraFilter}`,
    patch,
    "return=representation",
  );
  if (!res.ok) throw new Error(`subscription_invoice_update_failed_${res.status}`);
  const rows = (await res.json().catch(() => [])) as unknown[];
  return Array.isArray(rows) ? rows.length : 0;
}

export type SubscriptionCheckoutResult =
  | { ok: true; invoiceUrl: string; invoiceId: string; amount: number; mode: PaymentMode; reused: boolean }
  | { ok: false; status: number; error: string };

/**
 * Terbitkan (atau pakai ulang) tautan pembayaran Xendit untuk satu tagihan
 * langganan.
 *
 * Jumlahnya diambil dari baris tagihan, tidak pernah dari permintaan —
 * menerimanya dari peramban berarti membiarkan hotel menetapkan sendiri berapa
 * ia berlangganan. Kepemilikan diperiksa di sini dengan service key: tagihan
 * harus milik hotel si pemanggil.
 */
export async function handleSubscriptionCheckout(
  input: { invoiceId: number; profileId: string; successRedirectUrl?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<SubscriptionCheckoutResult> {
  const tenantId = await profileTenantId(input.profileId);
  if (!tenantId) return { ok: false, status: 403, error: "not_hotel_member" };

  const invoice = await getSubscriptionInvoice(input.invoiceId);
  // Tagihan yang tidak ada dan tagihan milik hotel lain dijawab sama, supaya
  // endpoint ini tidak bisa dipakai menghitung tagihan hotel sebelah.
  if (!invoice || invoice.tenant_id !== tenantId) {
    return { ok: false, status: 404, error: "invoice_not_found" };
  }
  if (invoice.status === "paid") return { ok: false, status: 409, error: "already_paid" };
  if (invoice.status === "waived") return { ok: false, status: 409, error: "invoice_waived" };
  if (!(invoice.amount > 0)) return { ok: false, status: 400, error: "nothing_to_pay" };

  const mode = await getSubscriptionMode();
  // Diperiksa lebih dulu supaya kunci Xendit yang belum diisi menjadi jawaban
  // yang bisa dibaca hotel, bukan 502 dari lemparan di kedalaman.
  if (!isGatewayConfigured(envForMode(mode))) {
    return { ok: false, status: 503, error: "service_not_configured" };
  }

  // Tautan yang masih hidup dipakai ulang: menerbitkan invoice baru tiap klik
  // menumpuk tagihan kembar di dashboard Xendit, dan tagihan lama tetap bisa
  // dibayar — dua-duanya masuk untuk satu bulan yang sama.
  const issuedAt = invoice.gateway_issued_at ? Date.parse(invoice.gateway_issued_at) : 0;
  const masihHidup = Date.now() - issuedAt < REUSE_WINDOW_MS;
  if (invoice.gateway_url && invoice.gateway_ref && invoice.gateway_env === mode && masihHidup) {
    return {
      ok: true, invoiceUrl: invoice.gateway_url, invoiceId: invoice.gateway_ref,
      amount: invoice.amount, mode, reused: true,
    };
  }

  const hotel = await hotelIdentity(tenantId);
  const attempt = invoice.gateway_attempt + (invoice.gateway_external_id ? 1 : 0);
  const externalId = subscriptionExternalId(hotel.slug, invoice.period, attempt);
  const bulan = invoice.period.slice(0, 7);

  const created = await createInvoiceViaGateway(
    {
      externalId,
      amount: invoice.amount,
      description: hotel.name
        ? `Langganan GoStay ${bulan} — ${hotel.name}`
        : `Langganan GoStay ${bulan}`,
      successRedirectUrl: input.successRedirectUrl,
      invoiceDuration: INVOICE_TTL_SECONDS,
    },
    envForMode(mode),
    fetchImpl,
  );

  await patchInvoice(invoice.id, {
    gateway_ref: created.id,
    gateway_external_id: externalId,
    gateway_url: created.invoiceUrl,
    gateway_env: mode,
    gateway_issued_at: new Date().toISOString(),
    gateway_attempt: attempt,
  });

  return {
    ok: true, invoiceUrl: created.invoiceUrl, invoiceId: created.id,
    amount: invoice.amount, mode, reused: false,
  };
}

/**
 * Tandai satu tagihan langganan lunas karena callback Xendit.
 *
 * Idempoten: callback yang datang dua kali untuk invoice yang sudah lunas
 * dijawab "duplicate" tanpa menulis apa pun. `paid_at` sengaja tidak dikirim —
 * trigger 055 yang mengisinya, supaya waktu lunas selalu waktu server.
 *
 * Nominalnya DIPERIKSA. Callback yang membawa uang kurang dari tagihan tidak
 * boleh menandainya lunas hanya karena statusnya "PAID" — kalau dibiarkan,
 * selisihnya tidak pernah muncul di layar mana pun. Yang kurang bayar dicatat
 * di kolom `note` supaya operator melihatnya di tempat ia memang melihat
 * tagihan, bukan hanya di log server yang tak pernah dibuka.
 */
export async function markInvoicePaidFromCallback(
  invoice: SubscriptionInvoiceRow,
  gatewayRef: string,
  mode: PaymentMode,
  paidAmount: number,
): Promise<"recorded" | "duplicate" | "underpaid" | "waived" | "stale"> {
  if (invoice.status === "paid") return "duplicate";
  // Operator membebaskan tagihan setelah tautannya terbit, lalu hotel tetap
  // membayar. Uangnya sudah masuk; yang salah bukan pembayarannya, jadi jangan
  // diam-diam melunasi sesuatu yang sudah dinyatakan tidak perlu dibayar.
  if (invoice.status === "waived") return "waived";

  // Toleransi setengah rupiah: pembulatan boleh, kurang bayar tidak.
  if (paidAmount + 0.5 < invoice.amount) {
    // Ditulis ke gateway_note, BUKAN note: kolom itu milik operator, dan
    // catatan tangannya ("transfer 5 Agustus via BCA") tidak boleh ditimpa
    // mesin setiap kali callback datang.
    await patchInvoice(invoice.id, {
      gateway_note: `Pembayaran online kurang: diterima ${paidAmount} dari ${invoice.amount} (${gatewayRef}).`,
      updated_by: "xendit_callback",
    });
    return "underpaid";
  }

  const changed = await patchInvoice(invoice.id, {
    status: "paid",
    paid_method: "xendit",
    gateway_ref: gatewayRef,
    gateway_env: mode,
    updated_by: "xendit_callback",
  }, "&status=eq.unpaid");   // atomik: dua callback beriringan tidak saling menimpa

  if (changed === 0) {
    // Filternya tidak kena: statusnya berubah antara pembacaan dan penulisan.
    // Dibaca ulang supaya "callback kembar" tidak tertukar dengan "tagihan
    // keburu dibebaskan" — yang pertama wajar, yang kedua perlu dilihat orang.
    const fresh = await getSubscriptionInvoice(invoice.id);
    return fresh?.status === "paid" ? "duplicate" : "stale";
  }
  return "recorded";
}
