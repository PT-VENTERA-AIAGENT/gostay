// Orchestration for the payment module — the logic behind api/payment/[action].
//
// Model Nexus (sejak 31 Jul 2026): invoice DIBUAT lewat Ventera-Nexus
// (POST /v1/payments) dan settlement pulang sebagai callback bertanda tangan
// HMAC ke /api/payment/nexus. Kontrak: repo PT-VENTERA-AIAGENT/ventera-nexus →
// docs/INTEGRASI.md.
//
// Jalur LAMA yang tersisa: handleWebhook (x-internal-token dari gateway callback
// Xendit) tetap hidup untuk invoice yang terbit SEBELUM migrasi ini dan belum
// dibayar — menghapusnya berarti tamu yang membayar invoice lama tidak pernah
// tercatat. Pembuatan invoice Xendit-langsung (gateway.ts) sudah tidak dipanggil.
// Kept out of the route file so it is unit-testable.

import {
  getHotelPaymentMode,
  getBookingByReference,
  recordGatewayPayment,
  getNexusReference,
  getOpenNexusReference,
  insertNexusReference,
  updateNexusReference,
  markNexusEventProcessed,
  getNexusReconcileCursor,
  setNexusReconcileCursor,
  type NexusReferenceRow,
} from "./service";
import { mapXenditStatus, envForMode, modeForEnv } from "./xendit";
import {
  isNexusConfigured,
  ensureNexusMerchant,
  createNexusPayment,
  listNexusPaymentsUpdatedSince,
  newNexusReference,
  verifyNexusSignature,
  type NexusPayment,
} from "./nexus";
import { matchGatewayToken, type TokenEnv } from "./token";
import { serviceDelete } from "../admin/http";

const PREFIX = "GOSTAY-";

/** Setiap referensi booking dimulai dengan ini — jangkar untuk membacanya kembali. */
const REFERENCE_MARKER = "BK-";

/**
 * Slug hotel dalam bentuk yang aman untuk external_id: huruf besar, dan apa pun
 * selain huruf/angka menjadi satu tanda hubung. Xendit menerima ini apa adanya,
 * dan bentuknya tetap enak dibaca di dashboard mereka.
 */
function slugSegment(hotelSlug: string): string {
  return (hotelSlug ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * external_id untuk sebuah invoice: `GOSTAY-<HOTEL>-<referensi>`.
 *
 * Dua hal yang harus benar sekaligus, dan keduanya alasan bentuk ini dipilih:
 *
 *   1. Router callback Ventera memilih tujuan berdasarkan awalan `GOSTAY-`, jadi
 *      awalan itu tidak boleh bergeser satu karakter pun.
 *   2. Di dashboard Xendit, sebuah pembayaran harus bisa langsung dikenali milik
 *      hotel mana. Tanpa nama hotel, satu akun Xendit yang melayani banyak hotel
 *      hanya memperlihatkan deretan kode booking yang tak berarti bagi manusia —
 *      dan itu jadi masalah nyata begitu produksi menampung hotel kedua.
 *
 * Nama hotel boleh kosong (mis. slug tenant belum terbaca); hasilnya kembali ke
 * bentuk lama `GOSTAY-<referensi>` yang tetap sah dan tetap terbaca.
 */
export function externalIdFor(reference: string, hotelSlug?: string | null): string {
  const hotel = slugSegment(hotelSlug ?? "");
  return hotel ? `${PREFIX}${hotel}-${reference}` : PREFIX + reference;
}

/**
 * Baca referensi booking dari sebuah external_id.
 *
 * Mencari POLA referensinya, bukan memotong awalan dengan panjang tetap — sebab
 * segmen nama hotel panjangnya berbeda-beda per hotel, dan yang lebih penting:
 * invoice yang sudah terbit sebelum perubahan ini membawa bentuk lama
 * `GOSTAY-<referensi>`. Kalau pembacaan di sini hanya mengerti bentuk baru,
 * pembayaran atas invoice-invoice lama itu gagal dicatat — tamu membayar, uangnya
 * masuk ke Xendit, dan reservasinya tetap menunggu selamanya.
 *
 * Sufiks percobaan ulang `-R<n>` tetap dibuang seperti sebelumnya.
 */
export function referenceFromExternalId(externalId: string): string {
  const stripped = (externalId ?? "")
    .replace(new RegExp("^" + PREFIX), "")
    .replace(/-R\d+$/, "");
  // Kemunculan TERAKHIR, bukan yang pertama: sebuah slug hotel pun boleh memuat
  // "BK-" (mis. hotel bernama "BK Residence") tanpa membuat referensinya salah
  // dibaca. Bentuk lama tanpa segmen hotel punya penanda ini di posisi 0, jadi
  // aturan yang sama melayani keduanya.
  const at = stripped.lastIndexOf(REFERENCE_MARKER);
  return at > 0 ? stripped.slice(at) : stripped;
}

export interface CreateInvoiceRequest {
  bookingReference: string;
  amount?: number;             // defaults to the booking's outstanding balance
  successRedirectUrl?: string;
}

export type CreateInvoiceResult =
  | { ok: true; invoiceUrl: string; invoiceId: string; amount: number; mode: string }
  | { ok: false; status: number; error: string };

/**
 * Create an invoice for a booking's outstanding balance via NEXUS, using the
 * booking's HOTEL's live/test mode.
 *
 * Idempoten dua lapis, sesuai kontrak Nexus §4:
 *   1. Booking yang sudah punya pembayaran Nexus TERBUKA (belum paid/expired,
 *      nominal sama) memakai ulang invoice itu — tamu yang minta tautan dua
 *      kali menerima tautan yang SAMA.
 *   2. Body request diserialisasi SEKALI dan disimpan; retry mengirim string
 *      yang sama byte-per-byte, karena Idempotency-Key Nexus terikat pada hash
 *      body. Menyusun ulang body saat retry menghasilkan 409, bukan invoice.
 */
export async function handleCreateInvoice(
  req: CreateInvoiceRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<CreateInvoiceResult> {
  const booking = await getBookingByReference(req.bookingReference);
  if (!booking) return { ok: false, status: 404, error: "booking_not_found" };

  const outstanding = booking.total_amount - booking.amount_paid;
  const amount = req.amount ?? outstanding;
  if (!(amount > 0)) return { ok: false, status: 400, error: "nothing_to_pay" };
  // Kontrak §2: bilangan bulat rupiah penuh. Booking menyimpan numeric — bulatkan
  // di sini, sekali, supaya selisih pembulatan tidak lolos diam-diam.
  const amountInt = Math.round(amount);
  if (amountInt !== amount) {
    console.warn(`[payment/nexus] amount ${amount} dibulatkan ke ${amountInt} (${booking.reference})`);
  }

  const mode = await getHotelPaymentMode(booking.tenant_id);
  const env = envForMode(mode);
  if (!isNexusConfigured(env)) return { ok: false, status: 503, error: `nexus_not_configured_${env}` };

  // Lapisan 1: pembayaran terbuka yang sudah ada untuk booking+environment+nominal ini.
  const open = await getOpenNexusReference(booking.id, env, amountInt);
  if (open) {
    if (open.checkout_url) {
      return {
        ok: true,
        invoiceUrl: open.checkout_url,
        invoiceId: open.nexus_payment_id ?? open.reference,
        amount: amountInt,
        mode,
      };
    }
    // Baris ada tapi Nexus belum sempat menjawab (crash di antara insert dan
    // POST). Kirim ulang body TERSIMPAN dengan reference yang sama — idempoten.
    const resumed = await createNexusPayment(env, open.reference, open.request_body, fetchImpl);
    if (!resumed.checkout_url) return { ok: false, status: 502, error: "nexus_no_checkout_url" };
    await updateNexusReference(open.reference, {
      nexus_payment_id: resumed.id,
      checkout_url: resumed.checkout_url,
      status: resumed.status,
    });
    return { ok: true, invoiceUrl: resumed.checkout_url, invoiceId: resumed.id, amount: amountInt, mode };
  }

  // Merchant = hotelnya. Idempoten di Nexus; didaftarkan saat dipakai supaya
  // hotel baru tidak pernah gagal dengan merchant_not_found (pelajaran Sellix).
  // Best-effort: bila pendaftaran gagal, invoice tetap dibuat tanpa merchant_ref
  // — tamu sedang menunggu tautannya.
  let merchantRef: string | undefined = booking.tenant_id;
  try {
    await ensureNexusMerchant(
      env,
      { tenantId: booking.tenant_id, hotelSlug: booking.hotel_slug, hotelName: booking.hotel_name },
      fetchImpl,
    );
  } catch (e) {
    console.error(`[payment/nexus] ensureMerchant gagal:`, (e as Error).message);
    merchantRef = undefined;
  }

  const reference = newNexusReference(booking.hotel_slug);
  // Dibangun SEKALI, disimpan, dikirim apa adanya — jangan pernah menyusun ulang.
  const body = JSON.stringify({
    ...(merchantRef ? { merchant_ref: merchantRef } : {}),
    reference,
    description: booking.hotel_name
      ? `Pembayaran reservasi ${booking.reference} — ${booking.hotel_name}`
      : `Pembayaran reservasi ${booking.reference}`,
    amount: amountInt,
    currency: "IDR",
    ...(booking.customer_email ? { customer: { email: booking.customer_email } } : {}),
    ...(req.successRedirectUrl ? { success_redirect_url: req.successRedirectUrl } : {}),
    // Referensi booking ikut sebagai metadata — muncul kembali di payload
    // callback, memudahkan penelusuran manual tanpa membuka tabel pemetaan.
    metadata: { booking_reference: booking.reference },
  });

  // Pemetaan ditulis SEBELUM memanggil Nexus: kalau proses mati setelah POST
  // sampai di Nexus, jalur "open" di atas menemukan baris ini dan melanjutkan
  // dengan reference yang sama alih-alih mencetak invoice kedua.
  await insertNexusReference({
    reference,
    booking_id: booking.id,
    tenant_id: booking.tenant_id,
    environment: env,
    amount: amountInt,
    request_body: body,
  });

  const payment = await createNexusPayment(env, reference, body, fetchImpl);
  if (!payment.checkout_url) return { ok: false, status: 502, error: "nexus_no_checkout_url" };

  await updateNexusReference(reference, {
    nexus_payment_id: payment.id,
    checkout_url: payment.checkout_url,
    status: payment.status,
  });

  // Kontrak §2: nominal yang dikembalikan Nexus harus sama dengan yang dikirim.
  if (Number(payment.amount) !== amountInt) {
    console.error(
      `[payment/nexus] selisih nominal: kirim ${amountInt}, Nexus jawab ${payment.amount} (${reference})`,
    );
  }

  return { ok: true, invoiceUrl: payment.checkout_url, invoiceId: payment.id, amount: amountInt, mode };
}

export type WebhookResult =
  | { ok: true; outcome: "recorded" | "duplicate" | "ignored"; status: number }
  | { ok: false; status: number; error: string };

/**
 * Process a settlement callback from the gateway. Authenticated by the
 * environment internal token (production/sandbox) — which one matched also
 * decides whether the recorded payment is stamped live or test, so a sandbox
 * settlement can never be booked as live. A non-paid status is acknowledged and
 * ignored. Idempotent via gateway_ref.
 *
 * Expected payload (gateway → GoStay), same shape as Storo's confirm:
 *   { external_id, invoice_id, status, amount, environment? }
 */
export async function handleWebhook(
  internalTokenHeader: string | undefined,
  body: Record<string, unknown>,
): Promise<WebhookResult> {
  const env = matchGatewayToken(internalTokenHeader);
  if (!env) return { ok: false, status: 401, error: "unauthorized" };

  const status = mapXenditStatus(body.status as string | undefined);
  if (status !== "paid") return { ok: true, outcome: "ignored", status: 200 };

  const externalId = String(body.external_id ?? "");
  const gatewayRef = String(body.invoice_id ?? body.id ?? "");
  const amount = Number(body.amount ?? body.paid_amount ?? 0);
  if (!externalId || !gatewayRef || !(amount > 0)) {
    return { ok: false, status: 400, error: "malformed_webhook" };
  }

  const reference = referenceFromExternalId(externalId);
  const booking = await getBookingByReference(reference);
  if (!booking) return { ok: false, status: 404, error: "booking_not_found" };

  // The token's environment is authoritative for how we stamp the payment. The
  // 5% fee itself is applied by the SQL balance-credit trigger (reads fee_bps in
  // SQL), so there's nothing fee-related to compute here.
  const outcome = await recordGatewayPayment({
    tenantId: booking.tenant_id,
    bookingId: booking.id,
    amount,
    gatewayRef,
    mode: modeForEnv(env),
  });
  return { ok: true, outcome, status: 200 };
}

// ─── Callback + rekonsiliasi Nexus ───────────────────────────────────────────

export type NexusApplyOutcome = "recorded" | "duplicate" | "updated" | "skipped";

/**
 * Terapkan satu status pembayaran Nexus ke booking-nya. SATU fungsi ini dipakai
 * callback DAN rekonsiliasi — kontrak §7: dua jalur dengan dua logika akan
 * berbeda perilaku, dan perbedaannya baru ketahuan saat uang sudah salah.
 *
 * Status tidak pernah mundur: 'paid' yang disusul 'pending' (event datang tidak
 * berurutan) diabaikan. Pencatatan uangnya idempoten dua lapis — gateway_ref
 * UNIQUE di tabel payments — jadi pemrosesan ulang tidak menggandakan saldo.
 */
export async function applyNexusPaymentStatus(
  ref: NexusReferenceRow,
  payment: Pick<NexusPayment, "id" | "status" | "amount_paid">,
  env: TokenEnv,
): Promise<NexusApplyOutcome> {
  const status = payment.status;
  if (ref.status === "paid" && status !== "paid") return "skipped";
  if (ref.status === status && status !== "paid") return "skipped";

  if (status === "paid") {
    const outcome = await recordGatewayPayment({
      tenantId: ref.tenant_id,
      bookingId: ref.booking_id,
      // Nominal dari Nexus bila ada; nominal pemetaan sebagai cadangan.
      amount: payment.amount_paid > 0 ? payment.amount_paid : ref.amount,
      gatewayRef: payment.id || ref.reference,
      mode: modeForEnv(env),
      gateway: "nexus",
    });
    await updateNexusReference(ref.reference, {
      status: "paid",
      ...(payment.id ? { nexus_payment_id: payment.id } : {}),
    });
    return outcome; // "recorded" | "duplicate"
  }

  await updateNexusReference(ref.reference, {
    status,
    ...(payment.id ? { nexus_payment_id: payment.id } : {}),
  });
  return "updated";
}

export interface NexusCallbackInput {
  /** Byte mentah body — signature dihitung atas ini, bukan hasil parse. */
  rawBody: string;
  timestamp: string | undefined;
  signature: string | undefined;
}

export type NexusCallbackResult =
  | { ok: true; outcome: NexusApplyOutcome | "ignored"; status: number }
  | { ok: false; status: number; error: string };

/**
 * Callback bertanda tangan dari Nexus (POST /api/payment/nexus).
 *
 * Urutan pertahanannya mengikuti kontrak §6:
 *   1. signature diverifikasi SEBELUM body dipercaya; environment yang sah
 *      adalah environment yang secret-nya cocok — header tidak dipercaya;
 *   2. idempoten pada X-Nexus-Event-Id (tabel nexus_processed_events);
 *   3. event_type tak dikenal dibalas 2xx — menolaknya membuat setiap jenis
 *      event baru memicu badai percobaan ulang;
 *   4. status tidak pernah dimundurkan (applyNexusPaymentStatus).
 */
export async function handleNexusCallback(
  input: NexusCallbackInput,
): Promise<NexusCallbackResult> {
  const env = verifyNexusSignature(input.rawBody, input.timestamp, input.signature);
  if (!env) return { ok: false, status: 401, error: "invalid_signature" };

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(input.rawBody) as Record<string, unknown>;
  } catch {
    return { ok: false, status: 400, error: "invalid_json" };
  }

  const eventId = typeof event.event_id === "string" ? event.event_id : "";
  const eventType = typeof event.event_type === "string" ? event.event_type : "";
  if (!eventId) return { ok: false, status: 400, error: "missing_event_id" };

  const fresh = await markNexusEventProcessed(eventId);
  if (!fresh) return { ok: true, outcome: "duplicate", status: 200 };

  try {
    // shipment.* dan jenis lain yang belum kita pakai: 200, bukan 4xx.
    if (!eventType.startsWith("payment.")) return { ok: true, outcome: "ignored", status: 200 };

    const data = (event.data ?? {}) as Record<string, unknown>;
    const reference = typeof data.reference === "string" ? data.reference : "";
    const ref = reference ? await getNexusReference(reference) : null;
    if (!ref) {
      // Pemetaan ditulis sebelum invoice dibuat, jadi absennya berarti data
      // rusak — bukan balapan yang akan sembuh dengan retry. 200 + jejak.
      console.error(`[payment/nexus] callback untuk reference tak dikenal: ${reference}`);
      return { ok: true, outcome: "ignored", status: 200 };
    }

    const outcome = await applyNexusPaymentStatus(
      ref,
      {
        id: typeof data.id === "string" ? data.id : "",
        status: typeof data.status === "string" ? data.status : "",
        amount_paid: Number(data.amount_paid ?? 0),
      },
      env,
    );
    return { ok: true, outcome, status: 200 };
  } catch (e) {
    // Pemrosesan gagal SETELAH event ditandai — lepaskan tandanya supaya
    // percobaan ulang Nexus tidak dibalas "duplicate" untuk kerja yang belum
    // pernah selesai. Efeknya sendiri idempoten (gateway_ref UNIQUE), jadi
    // dobel-proses karena balapan di sini aman.
    await serviceDelete(`nexus_processed_events?event_id=eq.${encodeURIComponent(eventId)}`);
    console.error("[payment/nexus] callback error:", (e as Error).message);
    return { ok: false, status: 500, error: "processing_failed" };
  }
}

/** Tumpang tindih kursor: menutup selisih jam antar server (kontrak §7). */
const RECONCILE_OVERLAP_MS = 5 * 60 * 1000;
/** Tanpa kursor (run pertama), tarik 24 jam ke belakang. */
const RECONCILE_BOOTSTRAP_MS = 24 * 60 * 60 * 1000;
/** Pagar halaman per run — 2000 pembayaran per environment per run. */
const RECONCILE_MAX_PAGES = 10;

export interface ReconcileResult {
  environment: TokenEnv;
  scanned: number;
  recorded: number;
  updated: number;
}

/**
 * Rekonsiliasi: tarik pembayaran yang berubah dari Nexus dan proses lewat
 * fungsi YANG SAMA dengan callback. Callback adalah percepatan; inilah yang
 * menjamin. Kursor disimpan hanya bila seluruh halaman selesai diproses.
 */
export async function handleReconcile(
  fetchImpl: typeof fetch = fetch,
): Promise<ReconcileResult[]> {
  const results: ReconcileResult[] = [];

  for (const env of ["sandbox", "production"] as const) {
    if (!isNexusConfigured(env)) continue;

    const runStartedAt = new Date().toISOString();
    const cursor = await getNexusReconcileCursor(env);
    const sinceMs = cursor
      ? new Date(cursor).getTime() - RECONCILE_OVERLAP_MS
      : Date.now() - RECONCILE_BOOTSTRAP_MS;
    let since = new Date(sinceMs).toISOString();

    let scanned = 0;
    let recorded = 0;
    let updated = 0;

    for (let page = 0; page < RECONCILE_MAX_PAGES; page++) {
      const batch = await listNexusPaymentsUpdatedSince(env, since, 200, fetchImpl);
      if (batch.length === 0) break;

      for (const p of batch) {
        scanned++;
        const ref = await getNexusReference(p.reference);
        if (!ref) continue; // bukan milik jalur ini (mis. dibuat manual di Nexus)
        const outcome = await applyNexusPaymentStatus(ref, p, env);
        if (outcome === "recorded") recorded++;
        else if (outcome === "updated") updated++;
      }

      if (batch.length < 200) break;
      const last = batch[batch.length - 1]?.updated_at;
      if (!last || last <= since) break; // jangan berputar di tempat
      since = last;
    }

    await setNexusReconcileCursor(env, runStartedAt);
    results.push({ environment: env, scanned, recorded, updated });
  }

  return results;
}
