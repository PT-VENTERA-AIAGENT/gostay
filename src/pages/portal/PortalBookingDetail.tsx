import { Link, useParams } from "react-router-dom";
import { ArrowLeft, MapPin, CreditCard, XCircle, MessageSquare, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import PageTransition, { staggerContainer, staggerItem } from "@/components/shared/PageTransition";
import CopyButton from "@/components/shared/CopyButton";
import BookingReviewForm from "@/components/portal/BookingReviewForm";
import { useBooking, useUpdateBookingStatus } from "@/hooks/useBookings";
import { cn } from "@/lib/utils";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { tr } from "@/lib/i18n";

function formatIDR(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function nightsBetween(a: string, b: string) {
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000));
}

const statusConfig: Record<string, { label: string; cls: string }> = {
  pending: { label: "Awaiting Confirmation", cls: "badge-warning" },
  confirmed: { label: "Upcoming", cls: "badge-info" },
  checked_in: { label: "In Stay", cls: "badge-info" },
  checked_out: { label: "Completed", cls: "bg-muted text-muted-foreground" },
  cancelled: { label: "Cancelled", cls: "bg-destructive/10 text-destructive" },
  no_show: { label: "No Show", cls: "bg-destructive/10 text-destructive" },
};

// Mirrors "Customer can cancel own bookings" in 005_tighten_rls.sql. The
// database is the authority; this only decides whether to offer the button,
// so that it is never shown for a request the server would reject.
const CANCELLABLE = new Set(["pending", "confirmed"]);

export default function PortalBookingDetail() {
  const { id } = useParams();
  const { data: booking, isLoading, error } = useBooking(id ?? "");
  const cancelBooking = useUpdateBookingStatus();
  const { toast } = useToast();
  const [cancelError, setCancelError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <PageTransition>
        <div className="max-w-3xl mx-auto px-4 py-16 flex items-center justify-center text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading booking…
        </div>
      </PageTransition>
    );
  }

  // RLS returns nothing for a booking that is not this user's, so "not found"
  // and "not yours" are deliberately the same message — telling them apart
  // would confirm the booking exists to someone who cannot see it.
  if (error || !booking) {
    return (
      <PageTransition>
        <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-8 space-y-4 text-center">
          <p className="text-muted-foreground">This booking could not be found.</p>
          <Link to="/portal/my-account" className="text-primary text-sm hover:underline">Back to My Account</Link>
        </div>
      </PageTransition>
    );
  }

  const nights = nightsBetween(booking.check_in, booking.check_out);
  const rate = booking.rooms?.room_types?.base_rate;
  const sc = statusConfig[booking.status] ?? statusConfig.confirmed;
  const canCancel = CANCELLABLE.has(booking.status);

  async function handleCancel() {
    setCancelError(null);
    try {
      await cancelBooking.mutateAsync({ id: booking!.id, status: "cancelled", note: "Cancelled by guest from the portal" });
      toast({ title: tr("Booking cancelled"), description: `${booking!.reference} has been cancelled.` });
    } catch (e) {
      setCancelError(e instanceof Error ? e.message : "Could not cancel the booking. Please contact the hotel.");
    }
  }

  return (
    <PageTransition>
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-8 space-y-6">
        <Link to="/portal/my-account" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to My Account
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">Booking Detail</h1>
            <div className="flex items-center gap-1 mt-1">
              <p className="text-sm font-mono text-primary">{booking.reference}</p>
              <CopyButton text={booking.reference} />
            </div>
          </div>
          <span className={cn("text-xs font-medium px-3 py-1 rounded-full self-start", sc.cls)}>{sc.label}</span>
        </div>

        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-4">
          <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-4 md:p-5">
            <h2 className="font-semibold text-foreground mb-3 flex items-center gap-2"><MapPin className="w-4 h-4" /> Stay Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Room Type</span>
                <p className="font-medium text-foreground mt-0.5">{booking.rooms?.room_types?.name ?? "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Dates</span>
                <p className="font-medium text-foreground mt-0.5">
                  {formatDate(booking.check_in)} – {formatDate(booking.check_out)} ({nights} night{nights !== 1 ? "s" : ""})
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Guests</span>
                <p className="font-medium text-foreground mt-0.5">
                  {booking.num_adults} Adult{booking.num_adults !== 1 ? "s" : ""}
                  {booking.num_children > 0 && `, ${booking.num_children} Child${booking.num_children !== 1 ? "ren" : ""}`}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Special Requests</span>
                <p className="font-medium text-foreground mt-0.5">{booking.special_requests || "—"}</p>
              </div>
            </div>
          </motion.div>

          <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-4 md:p-5">
            <h2 className="font-semibold text-foreground mb-3 flex items-center gap-2"><CreditCard className="w-4 h-4" /> Payment</h2>
            <div className="space-y-2 text-sm">
              {rate != null && nights > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{nights} night{nights !== 1 ? "s" : ""} × {formatIDR(Number(rate))}</span>
                  <span className="text-foreground tabular-nums">{formatIDR(Number(booking.total_amount))}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payment status</span>
                <span className="text-foreground capitalize">{booking.payment_status}</span>
              </div>
              <div className="flex justify-between font-semibold pt-2 border-t border-border">
                <span className="text-foreground">Total</span>
                <span className="text-primary tabular-nums">{formatIDR(Number(booking.total_amount))}</span>
              </div>
            </div>
          </motion.div>
        </motion.div>

        {/* Once the stay is done, the guest can rate it — this is what fills the
            reviews history shown on the portal. */}
        {booking.status === "checked_out" && (
          <BookingReviewForm bookingId={booking.id} customerId={booking.customer_id} />
        )}

        {cancelError && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm text-destructive">{cancelError}</div>
        )}

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <Link to="/portal/chat" className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors btn-press touch-target">
            <MessageSquare className="w-4 h-4" /> Contact Hotel
          </Link>

          {canCancel && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  disabled={cancelBooking.isPending}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-destructive text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors btn-press touch-target disabled:opacity-50"
                >
                  {cancelBooking.isPending
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Cancelling…</>
                    : <><XCircle className="w-4 h-4" /> Cancel Booking</>}
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {booking.reference} for {formatDate(booking.check_in)} will be cancelled. This cannot be undone —
                    you would need to book again.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep booking</AlertDialogCancel>
                  <AlertDialogAction onClick={handleCancel}>Cancel booking</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
