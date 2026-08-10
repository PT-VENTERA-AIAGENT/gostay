import { getSession } from "@/lib/sso";

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
  if (!token) throw new Error("Silakan masuk lebih dulu untuk membayar.");

  const res = await fetch("/api/payment/checkout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      bookingReference,
      // Tamu dikembalikan ke halaman pesanannya, bukan ke beranda: di situlah
      // status pembayarannya berubah, dan itu yang ingin ia lihat.
      successRedirectUrl: `${window.location.origin}/portal/my-account`,
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
    throw new Error(known[body.error ?? ""] ?? "Gagal membuat tagihan. Coba lagi sebentar.");
  }
  return body.invoiceUrl;
}
