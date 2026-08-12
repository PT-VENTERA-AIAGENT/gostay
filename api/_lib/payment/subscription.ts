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

import { serviceGet, serviceUpdate, serviceInsert, serviceRpc } from "../wa/client";
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
// SAMA PERSIS dengan TTL, dan jangan pernah dipersempit.
//
// Xendit membuat invoice pada T0; kita mencatat gateway_issued_at = T1, selalu
// beberapa detik sesudahnya. Tautannya mati di T0+TTL, dan kita menerbitkan
// penggantinya di T1+jangka. Dengan jangka = TTL, pengganti selalu terbit
// SESUDAH yang lama mati. Memberi margin ke bawah (TTL − 30 menit) terdengar
// seperti kehati-hatian, tapi artinya pengganti terbit ~30 menit SEBELUM yang
// lama mati: satu bulan tagihan punya dua tautan hidup, hotel bisa membayar
// dua kali, dan uang keduanya masuk ke Ventera.
//
// Harganya: selama beberapa detik di ujung jangka, tautan yang kita sodorkan
// bisa sudah mati. Kalau itu mau dihilangkan, simpan `expiry_date` dari jawaban
// Xendit dan pakai itu sebagai syarat — jangan menebaknya dengan margin.
const REUSE_WINDOW_MS = INVOICE_TTL_SECONDS * 1000;

/** Rupiah untuk teks yang dibaca operator dan hotel, bukan angka mentah. */
function rp(n: number): string {
  return "Rp" + Math.round(n).toLocaleString("id-ID");
}

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
  /** Yang sudah masuk sebelum pembayaran ini (058). */
  paid_total: number;
  gateway_note: string | null;
  /** Nominal di tautan terakhir — penentu boleh-tidaknya dipakai ulang. */
  gateway_amount: number | null;
}

const INVOICE_COLUMNS =
  "id,tenant_id,period,amount,status,paid_total,gateway_note,gateway_ref,gateway_external_id,gateway_url,gateway_env,gateway_issued_at,gateway_attempt,gateway_amount";

function toRow(raw: any): SubscriptionInvoiceRow {
  return {
    ...raw,
    amount: Number(raw.amount),
    paid_total: Number(raw.paid_total ?? 0),
    gateway_amount: raw.gateway_amount == null ? null : Number(raw.gateway_amount),
    gateway_attempt: Number(raw.gateway_attempt ?? 0),
  };
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

/**
 * Terbitkan tagihan satu periode untuk hotel ini kalau belum ada, lalu
 * kembalikan id-nya. Mengembalikan null kalau periodenya tidak sah untuk hotel
 * itu.
 *
 * Periodenya TIDAK dipercaya apa adanya: yang menentukan boleh-tidaknya adalah
 * `subscription_gate()` — hanya bulan yang benar-benar terutang menurut DB yang
 * bisa diterbitkan dari sini. Tanpa itu hotel bisa menyuruh server membuat
 * tagihan untuk bulan mana pun, termasuk yang belum tiba.
 */
async function ensureOwnInvoice(tenantId: string, period: string): Promise<number | null> {
  const gateRes = (await serviceRpc("subscription_gate", { p_tenant: tenantId })) as any[];
  const owed = Array.isArray(gateRes) ? gateRes[0] : null;
  if (!owed || String(owed.period).slice(0, 10) !== period.slice(0, 10)) return null;

  const cfg = await serviceGet(
    `hotel_payment_config?tenant_id=eq.${encodeURIComponent(tenantId)}&select=subscription_amount,billing_mode&limit=1`,
  );
  if (!cfg.ok) throw new Error(`hotel_payment_config_read_failed_${cfg.status}`);
  const row = ((await cfg.json()) as any[])[0];
  const amount = Number(row?.subscription_amount ?? 0);
  if (row?.billing_mode !== "subscription" || !(amount > 0)) return null;

  // Upsert: dua tab yang menekan Bayar bersamaan tidak boleh membuat dua
  // tagihan untuk bulan yang sama (UNIQUE tenant_id+period menahannya, tapi
  // yang kalah harus tetap mendapat barisnya, bukan galat).
  const ins = await serviceInsert(
    "hotel_subscription_invoices",
    { tenant_id: tenantId, period, amount, updated_by: "hotel_checkout" },
    "return=representation,resolution=ignore-duplicates",
  );
  if (ins.ok) {
    const rows = (await ins.json().catch(() => [])) as any[];
    if (rows[0]?.id) return Number(rows[0].id);
  } else if (ins.status !== 409) {
    throw new Error(`subscription_invoice_insert_failed_${ins.status}`);
  }

  // Sudah ada (atau upsert tidak mengembalikan baris) — baca kembali.
  const found = await serviceGet(
    `hotel_subscription_invoices?tenant_id=eq.${encodeURIComponent(tenantId)}` +
    `&period=eq.${encodeURIComponent(period)}&select=id&limit=1`,
  );
  if (!found.ok) throw new Error(`subscription_invoice_read_failed_${found.status}`);
  const got = ((await found.json()) as any[])[0];
  return got?.id ? Number(got.id) : null;
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
  input: { invoiceId?: number; period?: string; profileId: string; successRedirectUrl?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<SubscriptionCheckoutResult> {
  const tenantId = await profileTenantId(input.profileId);
  if (!tenantId) return { ok: false, status: 403, error: "not_hotel_member" };

  // Membayar bulan yang tagihannya BELUM diterbitkan.
  //
  // Gerbang tunggakan menghitung dari periode yang diharapkan, bukan dari baris
  // tagihan yang ada — supaya hotel yang tagihannya lupa diterbitkan tetap
  // tertagih. Tapi kalau tombol bayarnya menuntut baris itu ada, hotel yang
  // sama jadi terkunci TANPA cara membayar: gerbang yang mengunci jalan
  // keluarnya sendiri. Jadi barisnya diterbitkan di sini, dengan service key,
  // atas periode yang memang sudah jatuh tempo baginya.
  const invoiceId = input.invoiceId ?? (input.period
    ? await ensureOwnInvoice(tenantId, input.period)
    : null);
  if (invoiceId === null) return { ok: false, status: 400, error: "missing_invoice_id" };

  const invoice = await getSubscriptionInvoice(invoiceId);
  // Tagihan yang tidak ada dan tagihan milik hotel lain dijawab sama, supaya
  // endpoint ini tidak bisa dipakai menghitung tagihan hotel sebelah.
  if (!invoice || invoice.tenant_id !== tenantId) {
    return { ok: false, status: 404, error: "invoice_not_found" };
  }
  if (invoice.status === "paid") return { ok: false, status: 409, error: "already_paid" };
  if (invoice.status === "waived") return { ok: false, status: 409, error: "invoice_waived" };
  // Yang ditagih adalah SISA. Hotel yang sudah mentransfer sebagian melihat
  // sisa itu di layar gerbang; menerbitkan tautan sebesar nominal penuh akan
  // menagihnya dua kali untuk bagian yang sudah ia bayar.
  // Dibulatkan ke sen, dan ambangnya disamakan dengan
  // recompute_subscription_invoice() di 058 (toleransi 0,5). Tanpa itu sisa
  // Rp0,30 pada baris yang belum sempat dihitung ulang lolos ke Xendit,
  // ditolak gateway, dan hotel mendapat 502 alih-alih kalimat yang terbaca.
  const sisa = Math.round((invoice.amount - invoice.paid_total) * 100) / 100;
  if (!(sisa > 0.5)) return { ok: false, status: 400, error: "nothing_to_pay" };

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
  // Dipakai ulang selama masih hidup DAN nominalnya masih sama dengan sisa hari
  // ini. Syarat kedua itu yang menahan tautan beranak: kalau pembayaran
  // sebagian mematikan pemakaian ulang begitu saja, setiap klik Bayar
  // menerbitkan invoice baru yang semuanya tetap bisa dibayar — hotel yang
  // mengklik tiga kali punya tiga tautan hidup, dan kelebihan bayarnya jadi
  // kerja tangan untuk dikembalikan.
  if (invoice.gateway_url && invoice.gateway_ref && invoice.gateway_env === mode
      && masihHidup && invoice.gateway_amount === sisa) {
    return {
      ok: true, invoiceUrl: invoice.gateway_url, invoiceId: invoice.gateway_ref,
      amount: sisa, mode, reused: true,
    };
  }

  const hotel = await hotelIdentity(tenantId);
  const attempt = invoice.gateway_attempt + (invoice.gateway_external_id ? 1 : 0);
  const externalId = subscriptionExternalId(hotel.slug, invoice.period, attempt);
  const bulan = invoice.period.slice(0, 7);

  const created = await createInvoiceViaGateway(
    {
      externalId,
      amount: sisa,
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
    gateway_amount: sisa,
    gateway_issued_at: new Date().toISOString(),
    gateway_attempt: attempt,
  });

  return {
    ok: true, invoiceUrl: created.invoiceUrl, invoiceId: created.id,
    amount: sisa, mode, reused: false,
  };
}

/**
 * Catat pembayaran langganan yang datang dari callback Xendit.
 *
 * Urutannya disengaja: uangnya SELALU dicatat lebih dulu ke buku pembayaran
 * (058), baru keanehannya dijelaskan. Sebelum buku itu ada, uang yang tidak
 * pas — kurang bayar, bayar dua kali, bayar atas tagihan yang sudah dibebaskan
 * — hanya bisa jadi kalimat di kolom catatan, dan angkanya hilang. Sekarang
 * setiap rupiah yang benar-benar diterima punya barisnya sendiri, dan status
 * tagihan cuma ringkasan yang dihitung ulang trigger dari jumlah isinya.
 *
 * Idempoten lewat UNIQUE gateway_ref: callback yang diulang ditolak database,
 * dan itu jawaban yang benar, bukan kegagalan.
 */
export async function markInvoicePaidFromCallback(
  invoice: SubscriptionInvoiceRow,
  gatewayRef: string,
  mode: PaymentMode,
  paidAmount: number,
): Promise<"recorded" | "duplicate" | "underpaid" | "waived" | "double_paid"> {
  const res = await serviceInsert("subscription_payments", {
    tenant_id: invoice.tenant_id,
    invoice_id: invoice.id,
    amount: paidAmount,
    method: "xendit",
    gateway_ref: gatewayRef,
    gateway_env: mode,
    recorded_by: "xendit_callback",
  });
  if (res.status === 409) return "duplicate";   // callback yang sama, diulang
  if (!res.ok) throw new Error(`subscription_payment_insert_failed_${res.status}`);

  // Keanehan yang perlu dilihat orang. Ditulis ke gateway_note, BUKAN note:
  // kolom itu milik operator, dan catatan tangannya ("transfer 5 Agustus via
  // BCA") tidak boleh ditimpa mesin setiap kali callback datang.
  if (invoice.status === "waived") {
    await patchInvoice(invoice.id, {
      gateway_note: `Tagihan sudah dibebaskan, tapi pembayaran online ${rp(paidAmount)} tetap masuk (${gatewayRef}).`,
    });
    return "waived";
  }
  if (invoice.status === "paid") {
    // Bulan ini sudah lunas sebelum uang ini datang — entah lewat invoice lain
    // atau transfer yang ditandai operator. Uangnya tetap tercatat di buku,
    // jadi paid_total akan melebihi tagihan dan selisihnya terlihat.
    const lewat = invoice.gateway_ref ?? "cara lain";
    await patchInvoice(invoice.id, {
      gateway_note: `Pembayaran ganda: bulan ini sudah lunas lewat ${lewat}, lalu ${rp(paidAmount)} masuk lagi (${gatewayRef}).`,
    });
    return "double_paid";
  }
  // Yang dibandingkan adalah SELURUH yang sudah masuk, bukan pembayaran ini
  // sendirian. Operator mencatat transfer Rp200.000 lalu tautan online
  // Rp300.000 dibayar: trigger 058 menjumlahkannya jadi lunas, dan menyebut
  // pembayaran kedua "kurang bayar" hanya karena ia lebih kecil dari tagihan
  // akan menempelkan peringatan palsu pada tagihan yang justru sudah beres.
  // Toleransi setengah rupiah: pembulatan boleh, kurang bayar tidak.
  const kurang = invoice.amount - (invoice.paid_total + paidAmount);
  if (kurang > 0.5) {
    await patchInvoice(invoice.id, {
      gateway_note: `Pembayaran online kurang: diterima ${rp(paidAmount)}, total masuk ${rp(invoice.paid_total + paidAmount)} dari ${rp(invoice.amount)} — kurang ${rp(kurang)} (${gatewayRef}).`,
    });
    return "underpaid";
  }

  // Lunas penuh: peringatan dari percobaan sebelumnya tidak boleh menempel.
  if (invoice.gateway_note) await patchInvoice(invoice.id, { gateway_note: null });
  return "recorded";
}
