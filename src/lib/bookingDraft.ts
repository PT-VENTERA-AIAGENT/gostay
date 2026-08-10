import type { RoomType } from "@/types/database.types";

/**
 * Isi wizard pemesanan yang bertahan melewati perjalanan keluar-masuk aplikasi.
 *
 * Seluruh langkah portal (Kamar → Data Diri → Tinjau) mengoper datanya lewat
 * `location.state` React Router. Itu hanya hidup di memori tab, dan ia hilang
 * pada tiga peristiwa yang semuanya wajar dilakukan tamu:
 *
 *   * **Diminta masuk.** `handleConfirm` memanggil `signIn()` yang membawa
 *     browser keluar ke SSO. Saat kembali, tamu yang sudah mengisi nama, email,
 *     dan nomor teleponnya disambut "Data pesanan tidak ditemukan. Silakan mulai
 *     dari halaman kamar." Ia baru saja menekan tombol pesan — dan diminta
 *     mengulang semuanya.
 *   * **Muat ulang halaman.** F5 di langkah mana pun menghapus semuanya.
 *   * **Tombol kembali peramban** setelah meninggalkan alur.
 *
 * sessionStorage, bukan localStorage: draf ini milik satu kunjungan. Menutup tab
 * berarti tamu memang membatalkannya, dan draf yang bertahan berhari-hari akan
 * memunculkan kembali tanggal yang sudah lewat.
 */

const KEY = "gostay_booking_draft";

export interface BookingDraft {
  roomType: RoomType;
  checkIn: string;
  checkOut: string;
  guests: number;
  guestInfo?: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    specialRequests: string;
  };
  nights?: number;
  total?: number;
}

export function saveDraft(draft: BookingDraft): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // Mode privat atau penyimpanan penuh. Alurnya tetap jalan lewat
    // location.state; yang hilang hanya kemampuan pulih.
  }
}

/**
 * Draf yang tersimpan, atau null kalau tidak ada / rusak.
 *
 * Draf tanpa `roomType` tidak berguna bagi satu pun layar, dan lebih baik
 * dianggap tidak ada daripada membuat halaman melempar saat merendernya.
 */
export function loadDraft(): BookingDraft | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BookingDraft;
    return parsed?.roomType?.id ? parsed : null;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
