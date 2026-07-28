import { useLocation, Link } from "react-router-dom";
import { CheckCircle, Mail, Calendar, Home } from "lucide-react";
import PageTransition, { scaleIn } from "@/components/shared/PageTransition";
import CopyButton from "@/components/shared/CopyButton";
import { motion } from "framer-motion";
import type { Booking, RoomType } from "@/types/database.types";

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
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function BookingConfirmation() {
  const location = useLocation();
  const state = location.state as ConfirmationState | null;

  const booking = state?.booking;
  const roomType = state?.roomType;
  const guestInfo = state?.guestInfo;
  const checkIn = state?.checkIn ?? "";
  const checkOut = state?.checkOut ?? "";
  const guests = state?.guests ?? 1;
  const total = state?.total ?? 0;

  return (
    <PageTransition>
      <div className="max-w-lg mx-auto px-4 md:px-8 py-12 md:py-16 text-center space-y-6">
        <motion.div variants={scaleIn} initial="hidden" animate="show" className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mx-auto">
          <CheckCircle className="w-8 h-8 text-success" />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <h1 className="text-2xl font-bold text-foreground">Booking Confirmed!</h1>
          <p className="text-muted-foreground mt-2">Your reservation has been successfully created</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-card rounded-xl border border-border p-5 md:p-6 text-left space-y-3"
        >
          <div className="text-center mb-4">
            <p className="text-sm text-muted-foreground">Booking Reference</p>
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
            <div><span className="text-muted-foreground">Room</span><p className="font-medium text-foreground mt-0.5">{roomType?.name ?? "—"}</p></div>
            <div>
              <span className="text-muted-foreground">Dates</span>
              <p className="font-medium text-foreground mt-0.5">
                {checkIn && checkOut ? `${formatDate(checkIn)} – ${formatDate(checkOut)}` : "—"}
              </p>
            </div>
            <div><span className="text-muted-foreground">Guests</span><p className="font-medium text-foreground mt-0.5">{guests} Adult{guests !== 1 ? "s" : ""}</p></div>
            <div>
              <span className="text-muted-foreground">Total</span>
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
            <span>Confirmation sent to {guestInfo.email}</span>
          </motion.div>
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
            <Calendar className="w-4 h-4" /> My Bookings
          </Link>
          <Link
            to="/portal"
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity btn-press touch-target"
          >
            <Home className="w-4 h-4" /> Back to Home
          </Link>
        </motion.div>
      </div>
    </PageTransition>
  );
}
