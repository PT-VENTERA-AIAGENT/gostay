import { useLocation, Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getBookingByReference } from "@/services/bookingService";
import { createCheckoutInvoice } from "@/services/paymentService";
import { humanMessage } from "@/lib/errors";
import { CheckCircle, Mail, Calendar, Home, Wallet, Loader2, Clock } from "lucide-react";
import PageTransition, { scaleIn } from "@/components/shared/PageTransition";
import CopyButton from "@/components/shared/CopyButton";
import { motion } from "framer-motion";
import type { Booking, RoomType } from "@/types/database.types";
import { useT } from "@/lib/i18n";
import { dateLocale } from "@/lib/i18n";

interface ConfirmationState {
  booking: Booking;
  roomType: RoomType;
  checkIn: string;
  checkOut: string;
  guests: number;
  guestInfo: { firstName: string; lastName: string; email: string; phone: string; specialRequests: string };
  nights: number;
  total: number;
}

function formatIDR(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
}

function formatDate(dateStr: string) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString(dateLocale(), { day: "numeric", month: "short", year: "numeric" });
}

export default function BookingConfirmation() {
  const location = useLocation();
  const t = useT();
  const [params] = useSearchParams();
  const state = location.state as (ConfirmationState & { payError?: string }) | null;

  // Kepulangan dari Xendit adalah pemuatan halaman BARU: `location.state` sudah
  // tidak ada. Nomor referensi di query yang menggantikannya, dan pesanannya
  // dibaca ulang dari database — itu juga yang membuat status "lunas" di sini
  // benar-benar berasal dari settlement, bukan dari tebakan halaman ini.
  const ref = params.get("ref") ?? "";
  const { data: fetched, isLoading: loadingRef } = useQuery({
    queryKey: ["booking-ref", ref],
    queryFn: () => getBookingByReference(ref),
    enabled: Boolean(ref) && !state?.booking,
    retry: 1,
  });

  const booking = state?.booking ?? fetched;
  const roomType = state?.roomType;
  const guestInfo = state?.guestInfo;
  const checkIn = state?.checkIn ?? booking?.check_in ?? "";
  const checkOut = state?.checkOut ?? booking?.check_out ?? "";
  const guests = state?.guests ?? booking?.num_adults ?? 1;
  const total = state?.total ?? Number(booking?.total_amount ?? 0);
  const roomName =
    roomType?.name ??
    (booking as { rooms?: { room_types?: { name?: string } } } | undefined)?.rooms?.room_types?.name ??
    "—";

  const paid = booking?.payment_status === "paid";
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(state?.payError ?? null);

  async function handlePay() {
    if (!booking?.reference) return;
    setPayError(null);
    setPaying(true);
    try {
      window.location.href = await createCheckoutInvoice(booking.reference);
    } catch (e) {
      setPayError(humanMessage(e, "Halaman pembayaran belum bisa dibuka. Coba lagi sebentar."));
      setPaying(false);
    }
  }

  return (
    <PageTransition>
      <div className="max-w-lg mx-auto px-4 md:px-8 py-12 md:py-16 text-center space-y-6">
        <motion.div variants={scaleIn} initial="hidden" animate="show" className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto ${paid ? "bg-success/20" : "bg-warning/20"}`}>
          {paid ? <CheckCircle className="w-8 h-8 text-success" /> : <Clock className="w-8 h-8 text-warning" />}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <h1 className="text-2xl font-bold text-foreground">
            {paid ? t("Pembayaran Diterima!") : t("Pesanan Dibuat")}
          </h1>
          <p className="text-muted-foreground mt-2">
            {paid
              ? t("Reservasi Anda sudah lunas dan terkonfirmasi")
              : t("Tinggal satu langkah — selesaikan pembayaran untuk mengunci kamar Anda")}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-card rounded-xl border border-border p-5 md:p-6 text-left space-y-3"
        >
          <div className="text-center mb-4">
            <p className="text-sm text-muted-foreground">{t("Booking Reference")}</p>
            {booking?.reference ? (
              <div className="flex items-center justify-center gap-1">
                <p className="text-2xl font-bold font-mono text-primary">{booking.reference}</p>
                <CopyButton text={booking.reference} />
              </div>
            ) : (
              <p className="text-2xl font-bold font-mono text-primary">—</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-muted-foreground">{t("Room")}</span><p className="font-medium text-foreground mt-0.5">{roomName}</p></div>
            <div>
              <span className="text-muted-foreground">{t("Dates")}</span>
              <p className="font-medium text-foreground mt-0.5">
                {checkIn && checkOut ? `${formatDate(checkIn)} – ${formatDate(checkOut)}` : "—"}
              </p>
            </div>
            <div><span className="text-muted-foreground">{t("Guests")}</span><p className="font-medium text-foreground mt-0.5">{guests} {t(guests !== 1 ? "Adults" : "Adult")}</p></div>
            <div>
              <span className="text-muted-foreground">{t("Total")}</span>
              <p className="font-medium text-primary mt-0.5 tabular-nums">{total > 0 ? formatIDR(total) : "—"}</p>
            </div>
          </div>
        </motion.div>

        {guestInfo?.email && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="flex items-center gap-2 justify-center text-sm text-muted-foreground"
          >
            <Mail className="w-4 h-4" />
            <span>{t("Confirmation sent to")} {guestInfo.email}</span>
          </motion.div>
        )}

        {!paid && booking?.reference && (
          <div className="space-y-3">
            {payError && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm text-destructive">
                {payError}
              </div>
            )}
            <button
              onClick={handlePay}
              disabled={paying}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity btn-press touch-target disabled:opacity-60"
            >
              {paying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
              {paying ? t("Menyiapkan tagihan…") : t("Bayar sekarang")}
            </button>
            <p className="text-xs text-muted-foreground">
              {t("Kamar Anda baru terkunci setelah pembayaran diterima.")}
            </p>
          </div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="flex flex-col sm:flex-row items-center gap-3 justify-center"
        >
          <Link
            to="/portal/my-account"
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors btn-press touch-target"
          >
            <Calendar className="w-4 h-4" /> {t("My Bookings")}
          </Link>
          <Link
            to="/portal"
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity btn-press touch-target"
          >
            <Home className="w-4 h-4" /> {t("Back to Home")}
          </Link>
        </motion.div>
      </div>
    </PageTransition>
  );
}
