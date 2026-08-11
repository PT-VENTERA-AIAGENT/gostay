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
