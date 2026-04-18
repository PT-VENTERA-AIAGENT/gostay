import { Link, useParams } from "react-router-dom";
import { ArrowLeft, LogOut, LogIn, XCircle, Clock, FileText, User, MapPin, CreditCard, MoreHorizontal, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import PageTransition, { staggerContainer, staggerItem } from "@/components/shared/PageTransition";
import CopyButton from "@/components/shared/CopyButton";
import { useBooking, useBookingAuditLog, useUpdateBookingStatus } from "@/hooks/useBookings";
import { useToast } from "@/hooks/use-toast";

const statusConfig: Record<string, { label: string; cls: string }> = {
  pending:     { label: "Pending",     cls: "bg-warning/10 text-warning" },
  confirmed:   { label: "Confirmed",   cls: "bg-info/10 text-info" },
  checked_in:  { label: "Checked In",  cls: "bg-primary/10 text-primary" },
  checked_out: { label: "Checked Out", cls: "bg-muted text-muted-foreground" },
  cancelled:   { label: "Cancelled",   cls: "bg-destructive/10 text-destructive" },
  no_show:     { label: "No Show",     cls: "bg-destructive/10 text-destructive" },
};

function formatIDR(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-ID", { year: "numeric", month: "short", day: "numeric" });
}

function nightCount(checkIn: string, checkOut: string) {
  return Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86_400_000);
}

export default function BookingDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: booking, isLoading, error } = useBooking(id!);
  const { data: auditLog = [] } = useBookingAuditLog(id!);
  const updateStatus = useUpdateBookingStatus();
  const { toast } = useToast();

  async function handleStatusChange(status: Parameters<typeof updateStatus.mutate>[0]["status"]) {
    updateStatus.mutate(
      { id: id!, status },
      {
        onSuccess: () => toast({ title: `Booking ${status.replace("_", " ")}` }),
        onError: (e) => toast({ title: "Error", description: (e as Error).message, variant: "destructive" }),
      }
    );
  }

  if (isLoading) {
    return (
      <PageTransition>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </PageTransition>
    );
  }

  if (error || !booking) {
    return (
      <PageTransition>
        <div className="p-6 text-center text-sm text-destructive">Booking not found.</div>
      </PageTransition>
    );
  }

  const sc = statusConfig[booking.status];
  const nights = nightCount(booking.check_in, booking.check_out);
  const nightlyRate = booking.rooms?.room_types?.base_rate ?? 0;
  const nightlyBreakdown = Array.from({ length: nights }, (_, i) => {
    const d = new Date(booking.check_in);
    d.setDate(d.getDate() + i);
    return { date: d.toISOString().split("T")[0], price: nightlyRate };
  });

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
            <p className="text-sm text-muted-foreground">Booking for {booking.customers?.full_name}</p>
          </div>
          <div className="hidden md:flex items-center gap-2">
            {booking.status === "confirmed" && (
              <motion.button whileTap={{ scale: 0.97 }} onClick={() => handleStatusChange("checked_in")} disabled={updateStatus.isPending} className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60">
                <LogIn className="w-4 h-4" /> Check In
              </motion.button>
            )}
            {booking.status === "checked_in" && (
              <motion.button whileTap={{ scale: 0.97 }} onClick={() => handleStatusChange("checked_out")} disabled={updateStatus.isPending} className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60">
                <LogOut className="w-4 h-4" /> Check Out
              </motion.button>
            )}
            {booking.status === "pending" && (
              <motion.button whileTap={{ scale: 0.97 }} onClick={() => handleStatusChange("confirmed")} disabled={updateStatus.isPending} className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60">
                Confirm
              </motion.button>
            )}
            {["pending", "confirmed"].includes(booking.status) && (
              <motion.button whileTap={{ scale: 0.97 }} onClick={() => handleStatusChange("cancelled")} disabled={updateStatus.isPending} className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-destructive/50 text-destructive text-sm font-semibold hover:bg-destructive/5 transition-colors disabled:opacity-60">
                <XCircle className="w-4 h-4" /> Cancel
              </motion.button>
            )}
          </div>
          <button className="md:hidden w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground self-start">
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          <motion.div variants={staggerContainer} initial="hidden" animate="show" className="lg:col-span-2 space-y-4 md:space-y-6">
            <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-4 md:p-5">
              <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2"><User className="w-4 h-4" /> Guest Information</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4 text-sm">
                <div><span className="text-muted-foreground">Name</span><p className="font-medium text-foreground mt-0.5">{booking.customers?.full_name}</p></div>
                <div><span className="text-muted-foreground">Email</span><p className="font-medium text-foreground mt-0.5">{booking.customers?.email}</p></div>
                <div><span className="text-muted-foreground">Phone</span><p className="font-medium text-foreground mt-0.5">{booking.customers?.phone ?? "—"}</p></div>
                <div><span className="text-muted-foreground">Nationality</span><p className="font-medium text-foreground mt-0.5">{booking.customers?.nationality ?? "—"}</p></div>
              </div>
            </motion.div>

            <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-4 md:p-5">
              <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2"><MapPin className="w-4 h-4" /> Stay Details</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4 text-sm">
                <div><span className="text-muted-foreground">Room</span><p className="font-medium text-foreground mt-0.5">{booking.rooms?.number} · {booking.rooms?.room_types?.name} (Floor {booking.rooms?.floor})</p></div>
                <div><span className="text-muted-foreground">Dates</span><p className="font-medium text-foreground mt-0.5">{formatDate(booking.check_in)} → {formatDate(booking.check_out)} ({nights} nights)</p></div>
                <div><span className="text-muted-foreground">Guests</span><p className="font-medium text-foreground mt-0.5">{booking.num_adults} adults, {booking.num_children} children</p></div>
                <div><span className="text-muted-foreground">Source</span><p className="font-medium text-foreground mt-0.5 capitalize">{booking.source.replace("_", " ")}</p></div>
              </div>
            </motion.div>

            <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-4 md:p-5">
              <h2 className="font-semibold text-foreground mb-3 flex items-center gap-2"><FileText className="w-4 h-4" /> Notes</h2>
              <div className="space-y-3 text-sm">
                <div><span className="text-muted-foreground text-xs uppercase tracking-wide">Special Requests</span><p className="text-foreground mt-1">{booking.special_requests ?? "—"}</p></div>
                <div><span className="text-muted-foreground text-xs uppercase tracking-wide">Internal Notes</span><p className="text-foreground mt-1">{booking.internal_notes ?? "—"}</p></div>
              </div>
            </motion.div>

            <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-4 md:p-5">
              <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2"><Clock className="w-4 h-4" /> Audit Trail</h2>
              {auditLog.length === 0 ? (
                <p className="text-sm text-muted-foreground">No audit entries yet.</p>
              ) : (
                <div className="space-y-3">
                  {auditLog.map((log) => (
                    <div key={log.id} className="flex items-start gap-3">
                      <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                      <div>
                        <p className="text-sm text-foreground"><span className="font-medium capitalize">{log.action.replace("_", " ")}</span> by {log.performed_by}</p>
                        <p className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString()}</p>
                        {log.note && <p className="text-xs text-muted-foreground mt-0.5 italic">{log.note}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </motion.div>

          <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-4 md:space-y-6">
            <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-4 md:p-5">
              <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2"><CreditCard className="w-4 h-4" /> Payment</h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className={cn("font-medium", booking.payment_status === "paid" ? "text-success" : "text-warning")}>{booking.payment_status}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span className="font-semibold text-foreground">{formatIDR(booking.total_amount)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Paid</span><span className="font-medium text-foreground">{formatIDR(booking.amount_paid)}</span></div>
              </div>
            </motion.div>

            <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-4 md:p-5">
              <h2 className="font-semibold text-foreground mb-4">Nightly Breakdown</h2>
              <div className="space-y-2">
                {nightlyBreakdown.map((n, i) => (
                  <div key={i} className="flex items-center justify-between text-sm p-2 bg-muted rounded-lg">
                    <span className="text-muted-foreground">{n.date}</span>
                    <span className="font-medium text-foreground">{formatIDR(n.price)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between text-sm font-semibold pt-2 border-t border-border">
                  <span className="text-foreground">Total</span>
                  <span className="text-primary">{formatIDR(booking.total_amount)}</span>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </PageTransition>
  );
}
