import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle, LogIn, LogOut, XCircle, AlertTriangle, Clock, FileText, User, MapPin, CreditCard, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import PageTransition, { staggerContainer, staggerItem } from "@/components/shared/PageTransition";
import CopyButton from "@/components/shared/CopyButton";

const booking = {
  reference: "BK-20260401-A1B2",
  guest: { name: "David Chen", email: "david@example.com", phone: "+62 812 3456 7890", nationality: "Indonesia" },
  room: { number: "203", type: "Deluxe Room", floor: 2 },
  checkIn: "2026-04-01", checkOut: "2026-04-04", nights: 3, numAdults: 2, numChildren: 0,
  status: "checked_in", totalAmount: 3750000, amountPaid: 3750000, paymentStatus: "paid", source: "portal",
  specialRequests: "Late check-out if possible. Extra pillows please.",
  internalNotes: "VIP guest — returning customer, 3rd visit.",
  nightlyBreakdown: [
    { date: "2026-04-01", price: 1250000 }, { date: "2026-04-02", price: 1250000 }, { date: "2026-04-03", price: 1250000 },
  ],
  auditLog: [
    { action: "created", by: "System (Portal)", at: "2026-03-28 14:22:00" },
    { action: "confirmed", by: "Maria (Admin)", at: "2026-03-28 14:30:00" },
    { action: "checked_in", by: "James (Staff)", at: "2026-04-01 14:05:00" },
  ],
};

const statusConfig: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-warning/10 text-warning" },
  confirmed: { label: "Confirmed", cls: "bg-info/10 text-info" },
  checked_in: { label: "Checked In", cls: "bg-primary/10 text-primary" },
  checked_out: { label: "Checked Out", cls: "bg-muted text-muted-foreground" },
  cancelled: { label: "Cancelled", cls: "bg-destructive/10 text-destructive" },
};

function formatIDR(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
}

export default function BookingDetail() {
  const { id } = useParams();
  const sc = statusConfig[booking.status];

  return (
    <PageTransition>
      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <Link to="/bookings" className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors shrink-0 self-start">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1">
                <h1 className="text-xl md:text-2xl font-bold text-foreground">{booking.reference}</h1>
                <CopyButton text={booking.reference} />
              </div>
              <span className={cn("text-xs font-medium px-2.5 py-1 rounded-full", sc.cls)}>{sc.label}</span>
            </div>
            <p className="text-sm text-muted-foreground">Booking for {booking.guest.name}</p>
          </div>
          {/* Desktop actions */}
          <div className="hidden md:flex items-center gap-2">
            {booking.status === "checked_in" && (
              <motion.button whileTap={{ scale: 0.97 }} className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity">
                <LogOut className="w-4 h-4" /> Check Out
              </motion.button>
            )}
          </div>
          {/* Mobile dropdown trigger */}
          <button className="md:hidden w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground self-start">
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          <motion.div variants={staggerContainer} initial="hidden" animate="show" className="lg:col-span-2 space-y-4 md:space-y-6">
            <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-4 md:p-5">
              <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2"><User className="w-4 h-4" /> Guest Information</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4 text-sm">
                <div><span className="text-muted-foreground">Name</span><p className="font-medium text-foreground mt-0.5">{booking.guest.name}</p></div>
                <div><span className="text-muted-foreground">Email</span><p className="font-medium text-foreground mt-0.5">{booking.guest.email}</p></div>
                <div><span className="text-muted-foreground">Phone</span><p className="font-medium text-foreground mt-0.5">{booking.guest.phone}</p></div>
                <div><span className="text-muted-foreground">Nationality</span><p className="font-medium text-foreground mt-0.5">{booking.guest.nationality}</p></div>
              </div>
            </motion.div>

            <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-4 md:p-5">
              <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2"><MapPin className="w-4 h-4" /> Stay Details</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4 text-sm">
                <div><span className="text-muted-foreground">Room</span><p className="font-medium text-foreground mt-0.5">{booking.room.number} · {booking.room.type} (Floor {booking.room.floor})</p></div>
                <div><span className="text-muted-foreground">Dates</span><p className="font-medium text-foreground mt-0.5">{booking.checkIn} → {booking.checkOut} ({booking.nights} nights)</p></div>
                <div><span className="text-muted-foreground">Guests</span><p className="font-medium text-foreground mt-0.5">{booking.numAdults} adults, {booking.numChildren} children</p></div>
                <div><span className="text-muted-foreground">Source</span><p className="font-medium text-foreground mt-0.5 capitalize">{booking.source}</p></div>
              </div>
            </motion.div>

            <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-4 md:p-5">
              <h2 className="font-semibold text-foreground mb-3 flex items-center gap-2"><FileText className="w-4 h-4" /> Notes</h2>
              <div className="space-y-3 text-sm">
                <div><span className="text-muted-foreground text-xs uppercase tracking-wide">Special Requests</span><p className="text-foreground mt-1">{booking.specialRequests}</p></div>
                <div><span className="text-muted-foreground text-xs uppercase tracking-wide">Internal Notes</span><p className="text-foreground mt-1">{booking.internalNotes}</p></div>
              </div>
            </motion.div>

            <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-4 md:p-5">
              <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2"><Clock className="w-4 h-4" /> Audit Trail</h2>
              <div className="space-y-3">
                {booking.auditLog.map((log, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                    <div>
                      <p className="text-sm text-foreground"><span className="font-medium capitalize">{log.action.replace("_", " ")}</span> by {log.by}</p>
                      <p className="text-xs text-muted-foreground">{log.at}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>

          <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-4 md:space-y-6">
            <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-4 md:p-5">
              <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2"><CreditCard className="w-4 h-4" /> Payment</h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className={cn("font-medium", booking.paymentStatus === "paid" ? "text-success" : "text-warning")}>{booking.paymentStatus}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span className="font-semibold text-foreground">{formatIDR(booking.totalAmount)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Paid</span><span className="font-medium text-foreground">{formatIDR(booking.amountPaid)}</span></div>
              </div>
            </motion.div>

            <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-4 md:p-5">
              <h2 className="font-semibold text-foreground mb-4">Nightly Breakdown</h2>
              <div className="space-y-2">
                {booking.nightlyBreakdown.map((n, i) => (
                  <div key={i} className="flex items-center justify-between text-sm p-2 bg-muted rounded-lg">
                    <span className="text-muted-foreground">{n.date}</span>
                    <span className="font-medium text-foreground">{formatIDR(n.price)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between text-sm font-semibold pt-2 border-t border-border">
                  <span className="text-foreground">Total</span>
                  <span className="text-primary">{formatIDR(booking.totalAmount)}</span>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </PageTransition>
  );
}
