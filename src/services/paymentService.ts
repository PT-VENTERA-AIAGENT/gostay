import { getSession } from "@/lib/sso";
import { currentTenantSlug } from "@/lib/tenant";
import { UserFacingError } from "@/lib/errors";
import { tr } from "@/lib/i18n";

/**
 * Menerbitkan invoice untuk pesanan milik tamu yang sedang masuk.
 *
 * Memanggil `POST /api/payment/checkout`, BUKAN `/create`. Yang terakhir dijaga
 * `x-internal-token` — rahasia server yang tidak boleh ada di peramban; itulah
 * sebabnya sampai sekarang satu-satunya penerbit invoice adalah jalur WhatsApp,
 * dan portal hanya bisa menampilkan "Pending" tanpa cara membayarnya.
 *
 * Yang dikirim hanya nomor pesanan. Jumlahnya ditentukan server dari database —
 * mengirim `amount` dari sini berarti membiarkan tamu menetapkan harganya
 * sendiri.
 */
export async function createCheckoutInvoice(bookingReference: string): Promise<string> {
  const token = getSession()?.supabase_token;
  if (!token) throw new UserFacingError(tr("Silakan masuk lebih dulu untuk membayar."));
  const slug = currentTenantSlug();

  const res = await fetch("/api/payment/checkout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      bookingReference,
      // Xendit memulangkan tamu ke halaman konfirmasi pesanan ITU, bukan ke
      // daftar pesanan. Nomor referensi dibawa di query karena kepulangan dari
      // Xendit adalah pemuatan halaman baru — `location.state` React Router
      // sudah tidak ada lagi di titik itu.
      // `hotel` ikut dibawa, bukan hanya `ref`.
      //
      // Kepulangan dari Xendit adalah pemuatan halaman baru di tab yang mungkin
      // belum pernah menyentuh portal hotel ini, jadi tidak ada slug yang
      // diingat. Tanpa itu `current_tenant()` menjatuhkan pilihannya ke hotel
      // lain: kop halaman menyebut nama hotel yang salah, dan nama tipe kamar
      // hilang jadi "—" karena baris `rooms` milik hotel ini tersaring RLS.
      successRedirectUrl: `${window.location.origin}/portal/book/confirmation?ref=${encodeURIComponent(bookingReference)}${slug ? `&hotel=${encodeURIComponent(slug)}` : ""}`,
    }),
  });

  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    invoiceUrl?: string;
    error?: string;
  };

  if (!res.ok || !body.invoiceUrl) {
    // Pesan apa adanya dari server jarang bisa dibaca tamu ("service_not_
    // configured"), jadi yang paling sering terjadi diterjemahkan.
    const known: Record<string, string> = {
      unauthorized: "Sesi Anda sudah berakhir. Silakan masuk kembali.",
      booking_not_found: "Pesanan ini tidak ditemukan.",
      service_not_configured: "Pembayaran online belum aktif untuk hotel ini.",
      payment_disabled: "Hotel ini belum menerima pembayaran online.",
      already_paid: "Pesanan ini sudah lunas.",
    };
    // Kode dari server TIDAK ikut ditampilkan — ia menyebut bentuk dalam
    // sistem. Yang tidak dikenal jatuh ke kalimat umum; detailnya ke konsol.
    if (!known[body.error ?? ""]) console.error("[payment] gagal membuat tagihan:", body.error);
    throw new UserFacingError(
      known[body.error ?? ""] ??
        tr("Halaman pembayaran belum bisa dibuka. Coba lagi sebentar, atau hubungi hotel lewat menu Pesan."),
    );
  }
  return body.invoiceUrl;
}

/**
 * Menerbitkan tautan pembayaran Xendit untuk satu tagihan langganan hotel ini.
 *
 * Yang dikirim hanya id tagihan. Jumlah dan hotel pemiliknya ditentukan server
 * dari baris tagihannya — mengirim keduanya dari sini berarti membiarkan hotel
 * menetapkan sendiri berapa dan atas nama siapa ia berlangganan.
 *
 * Server boleh mengembalikan tautan yang SAMA kalau tagihan ini baru saja
 * diterbitkan (`reused`), supaya menekan tombolnya dua kali tidak menumpuk
 * tagihan kembar di Xendit — dua-duanya bisa dibayar untuk satu bulan yang sama.
 */
export async function createSubscriptionInvoice(invoiceId: number): Promise<string> {
  const token = getSession()?.supabase_token;
  if (!token) throw new UserFacingError(tr("Silakan masuk lebih dulu untuk membayar."));

  const res = await fetch("/api/payment/subscription-checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      invoiceId,
      successRedirectUrl: `${window.location.origin}/saldo`,
    }),
  });

  const body = (await res.json().catch(() => ({}))) as { invoiceUrl?: string; error?: string };
  if (!res.ok || !body.invoiceUrl) {
    const known: Record<string, string> = {
      unauthorized: "Sesi Anda sudah berakhir. Silakan masuk kembali.",
      not_hotel_member: "Hanya staf hotel yang bisa membayar langganan.",
      invoice_not_found: "Tagihan ini tidak ditemukan.",
      already_paid: "Tagihan ini sudah lunas.",
      invoice_waived: "Tagihan ini sudah dibebaskan Ventera.",
      service_not_configured: "Pembayaran online belum aktif.",
      invoice_create_failed: "Tautan pembayaran belum bisa dibuat. Coba lagi sebentar.",
    };
    if (!known[body.error ?? ""]) console.error("[langganan] gagal membuat tagihan:", body.error);
    throw new UserFacingError(
      known[body.error ?? ""] ??
        tr("Tautan pembayaran belum bisa dibuka. Coba lagi sebentar, atau hubungi Ventera."),
    );
  }
  return body.invoiceUrl;
}
