import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Halaman portal yang hanya masuk akal bagi seorang TAMU.
 *
 * "Akun Saya", "Menginap Mendatang", "Riwayat Menginap" — semuanya membaca
 * `customers.profile_id = auth.uid()`, jadi bagi staf hotel isinya kosong pada
 * keadaan terbaik, dan menyesatkan pada keadaan terburuk: pengelola hotel
 * disapa sebagai tamu, lengkap dengan daftar menginapnya sendiri.
 *
 * Menjelajah portal tetap boleh — staf perlu melihat brosur, denah, dan menu
 * seperti yang dilihat tamu. Yang dialihkan hanya halaman yang memang bukan
 * untuk mereka, dan tujuannya jelas: dasbor, tempat data yang mereka cari
 * benar-benar ada.
 *
 * Ini bukan batas keamanan — RLS yang menjaga datanya. Ini soal tidak menyodorkan
 * ruangan yang salah kepada orang yang salah.
 */
export default function GuestOnlyRoute({ children }: { children: React.ReactNode }) {
  const { role, isLoading } = useAuth();

  // Selagi peran belum diketahui, jangan mengalihkan siapa pun: seorang tamu
  // yang dialihkan ke /dashboard hanya karena sesinya belum selesai dimuat akan
  // mendarat di halaman yang menolaknya.
  if (isLoading) return <>{children}</>;

  if (role === "staff" || role === "admin") {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}
