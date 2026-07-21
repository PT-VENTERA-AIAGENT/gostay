import { Link } from "react-router-dom";
import { Calendar, Settings, Eye, MessageSquare, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import PageTransition, { staggerContainer, staggerItem } from "@/components/shared/PageTransition";
import { useMyBookings } from "@/hooks/useBookings";
import { useAuth } from "@/contexts/AuthContext";
import type { BookingWithRelations } from "@/services/bookingService";

const statusConfig: Record<string, { label: string; cls: string }> = {
  pending: { label: "Menunggu Konfirmasi", cls: "bg-warning/10 text-warning" },
  confirmed: { label: "Akan Datang", cls: "bg-info/10 text-info" },
  checked_in: { label: "Sedang Menginap", cls: "bg-primary/10 text-primary" },
  checked_out: { label: "Selesai", cls: "bg-muted text-muted-foreground" },
  cancelled: { label: "Dibatalkan", cls: "bg-destructive/10 text-destructive" },
  no_show: { label: "Tidak Hadir", cls: "bg-destructive/10 text-destructive" },
};

// 'pending' belongs here, not under Past: it is a live request the guest is
// waiting on, and burying it under completed stays is how a booking gets
// silently forgotten.
const UPCOMING = new Set(["pending", "confirmed", "checked_in"]);

function formatIDR(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", minimumFractionDigits: 0,
  }).format(n);
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

function BookingCard({ b, past }: { b: BookingWithRelations; past?: boolean }) {
  const sc = statusConfig[b.status] ?? statusConfig.confirmed;
  return (
    <motion.div
      variants={staggerItem}
      className="bg-card rounded-xl border border-border p-4 md:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:shadow-sm transition-shadow"
    >
      <div className="flex items-center gap-3 md:gap-4">
        <div className={cn("w-10 h-10 md:w-12 md:h-12 rounded-lg flex items-center justify-center shrink-0", past ? "bg-muted" : "bg-primary/10")}>
          <Calendar className={cn("w-4 h-4 md:w-5 md:h-5", past ? "text-muted-foreground" : "text-primary")} />
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-foreground">{b.rooms?.room_types?.name ?? "Kamar"}</p>
            <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", sc.cls)}>{sc.label}</span>
          </div>
          <p className="text-sm text-muted-foreground">{formatDate(b.check_in)} → {formatDate(b.check_out)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{b.reference}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 md:gap-4 self-end sm:self-auto">
        <span className="text-sm font-semibold text-foreground">{formatIDR(Number(b.total_amount))}</span>
        <Link to={`/portal/my-account/bookings/${b.id}`} className="text-muted-foreground hover:text-foreground transition-colors" aria-label={`View booking ${b.reference}`}>
          <Eye className="w-4 h-4" />
        </Link>
      </div>
    </motion.div>
  );
}

export default function MyAccount() {
  const { user } = useAuth();
  const { data: bookings, isLoading, error } = useMyBookings();

  const upcoming = (bookings ?? []).filter((b) => UPCOMING.has(b.status));
  const past = (bookings ?? []).filter((b) => !UPCOMING.has(b.status));

  const name = user?.name ?? user?.email ?? "Tamu";

  return (
    <PageTransition>
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-6 md:py-8 space-y-6 md:space-y-8">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Akun Saya</h1>
          <p className="text-sm text-muted-foreground mt-1">Kelola booking dan profilmu</p>
        </div>

        <div className="bg-card rounded-xl border border-border p-4 md:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-primary/20 flex items-center justify-center text-base md:text-lg font-bold text-primary">
              {initials(name)}
            </div>
            <div>
              <p className="font-semibold text-foreground">{name}</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/portal/chat" className="flex items-center gap-2 px-3 md:px-4 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
              <MessageSquare className="w-4 h-4" /> <span className="hidden sm:inline">Pesan</span>
            </Link>
            <Link to="/portal/profile" className="flex items-center gap-2 px-3 md:px-4 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
              <Settings className="w-4 h-4" /> <span className="hidden sm:inline">Edit Profil</span>
            </Link>
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Memuat booking-mu…
          </div>
        )}

        {error && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-sm text-destructive">
            Gagal memuat booking. Coba refresh, atau hubungi kami jika terus terjadi.
          </div>
        )}

        {!isLoading && !error && (
          <>
            <div>
              <h2 className="text-lg font-semibold text-foreground mb-4">Menginap Mendatang</h2>
              {upcoming.length === 0 ? (
                <div className="bg-card rounded-xl border border-border p-8 text-center">
                  <Calendar className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="font-medium text-foreground mb-1">Belum ada booking mendatang</p>
                  <Link to="/portal" className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity mt-3">
                    Lihat Kamar
                  </Link>
                </div>
              ) : (
                <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-3">
                  {upcoming.map((b) => <BookingCard key={b.id} b={b} />)}
                </motion.div>
              )}
            </div>

            <div>
              <h2 className="text-lg font-semibold text-foreground mb-4">Riwayat Menginap</h2>
              {past.length === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada riwayat menginap.</p>
              ) : (
                <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-3">
                  {past.map((b) => <BookingCard key={b.id} b={b} past />)}
                </motion.div>
              )}
            </div>
          </>
        )}
      </div>
    </PageTransition>
  );
}
