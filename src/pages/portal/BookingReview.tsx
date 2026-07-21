import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import PageTransition, { staggerContainer, staggerItem } from "@/components/shared/PageTransition";
import { createBooking, getOrCreateOwnCustomer } from "@/services/bookingService";
import { getAvailableRooms } from "@/services/roomService";
import { useAuth } from "@/contexts/AuthContext";
import type { RoomType } from "@/types/database.types";

interface GuestInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  specialRequests: string;
}

interface ReviewState {
  roomType: RoomType;
  checkIn: string;
  checkOut: string;
  guests: number;
  guestInfo: GuestInfo;
  nights: number;
  total: number;
}

const steps = [
  { num: 1, label: "Room", done: true },
  { num: 2, label: "Details", done: true },
  { num: 3, label: "Review", active: true },
  { num: 4, label: "Confirmation" },
];

function formatIDR(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
}

function formatDate(dateStr: string) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function BookingReview() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signIn } = useAuth();
  const state = location.state as ReviewState | null;
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (!state?.roomType) {
    return (
      <PageTransition>
        <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-8 text-center space-y-4">
          <p className="text-muted-foreground">No booking data found. Please start from the rooms page.</p>
          <button onClick={() => navigate("/portal")} className="text-primary text-sm hover:underline">
            Browse rooms
          </button>
        </div>
      </PageTransition>
    );
  }

  const { roomType, checkIn, checkOut, guests, guestInfo, nights, total } = state;

  async function handleConfirm() {
    // A booking has to belong to someone. Every "own bookings" RLS policy walks
    // customers.profile_id back to auth.uid(), so an anonymous booking would be
    // one the guest could never open again — and the insert is denied anyway.
    if (!user) {
      signIn(location.pathname);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      // 1. Get or create the customer record owned by this profile
      const customer = await getOrCreateOwnCustomer(user.id, {
        full_name: `${guestInfo.firstName} ${guestInfo.lastName}`.trim(),
        email: guestInfo.email,
        phone: guestInfo.phone || null,
        nationality: null,
      });

      // 2. Find an available room for this room type
      const availableRooms = await getAvailableRooms(checkIn, checkOut, roomType.id);
      if (availableRooms.length === 0) {
        setSubmitError("No rooms available for the selected dates. Please go back and choose different dates.");
        setSubmitting(false);
        return;
      }
      const room = availableRooms[0];

      // 3. Create the booking
      const booking = await createBooking({
        customer_id: customer.id,
        room_id: room.id,
        check_in: checkIn,
        check_out: checkOut,
        num_adults: guests,
        num_children: 0,
        // Staff confirm; the guest does not confirm their own booking. A browser
        // that could insert status='confirmed' with payment_status='pending' is
        // a browser that books free stays — see PRD §"Booking creation".
        status: "pending",
        total_amount: total,
        amount_paid: 0,
        payment_status: "pending",
        source: "portal",
        special_requests: guestInfo.specialRequests || null,
        internal_notes: null,
        created_by: user.id,
      });

      navigate("/portal/book/confirmation", {
        state: {
          booking,
          roomType,
          checkIn,
          checkOut,
          guests,
          guestInfo,
          nights,
          total,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setSubmitError(message);
      setSubmitting(false);
    }
  }

  return (
    <PageTransition>
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-8 space-y-6">
        {/* Progress steps */}
        <div className="flex items-center justify-between">
          {steps.map((step, i) => (
            <div key={step.num} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                step.done ? "bg-primary text-primary-foreground" :
                step.active ? "bg-primary text-primary-foreground ring-4 ring-primary/20" :
                "bg-muted text-muted-foreground"
              }`}>
                {step.done ? <Check className="w-4 h-4" /> : step.num}
              </div>
              <span className={`text-sm font-medium hidden sm:inline ${step.active ? "text-primary" : step.done ? "text-foreground" : "text-muted-foreground"}`}>{step.label}</span>
              {i < steps.length - 1 && <div className={`w-8 sm:w-16 h-0.5 ml-2 ${step.done ? "bg-primary" : "bg-muted"}`} />}
            </div>
          ))}
        </div>

        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Review Your Booking</h1>
          <p className="text-sm text-muted-foreground mt-1">Please review all details before confirming</p>
        </div>

        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-4">
          <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-4 md:p-5">
            <h2 className="font-semibold text-foreground mb-3">Room Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div><span className="text-muted-foreground">Room Type</span><p className="font-medium text-foreground mt-0.5">{roomType.name}</p></div>
              <div><span className="text-muted-foreground">Max Occupancy</span><p className="font-medium text-foreground mt-0.5">{roomType.max_occupancy} guests</p></div>
              <div><span className="text-muted-foreground">Check-in</span><p className="font-medium text-foreground mt-0.5">{formatDate(checkIn)}</p></div>
              <div><span className="text-muted-foreground">Check-out</span><p className="font-medium text-foreground mt-0.5">{formatDate(checkOut)}</p></div>
              <div><span className="text-muted-foreground">Nights</span><p className="font-medium text-foreground mt-0.5">{nights}</p></div>
              <div><span className="text-muted-foreground">Guests</span><p className="font-medium text-foreground mt-0.5">{guests} Adult{guests !== 1 ? "s" : ""}</p></div>
            </div>
          </motion.div>

          <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-4 md:p-5">
            <h2 className="font-semibold text-foreground mb-3">Guest Information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div><span className="text-muted-foreground">Name</span><p className="font-medium text-foreground mt-0.5">{guestInfo.firstName} {guestInfo.lastName}</p></div>
              <div><span className="text-muted-foreground">Email</span><p className="font-medium text-foreground mt-0.5">{guestInfo.email}</p></div>
              <div><span className="text-muted-foreground">Phone</span><p className="font-medium text-foreground mt-0.5">{guestInfo.phone}</p></div>
              {guestInfo.specialRequests && (
                <div className="sm:col-span-2"><span className="text-muted-foreground">Special Requests</span><p className="font-medium text-foreground mt-0.5">{guestInfo.specialRequests}</p></div>
              )}
            </div>
          </motion.div>

          <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-4 md:p-5">
            <h2 className="font-semibold text-foreground mb-3">Price Breakdown</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{nights} night{nights !== 1 ? "s" : ""} × {formatIDR(roomType.base_rate)}</span>
                <span className="text-foreground tabular-nums">{formatIDR(total)}</span>
              </div>
              <div className="flex justify-between font-semibold pt-2 border-t border-border">
                <span className="text-foreground">Total</span>
                <span className="text-primary tabular-nums">{formatIDR(total)}</span>
              </div>
            </div>
          </motion.div>
        </motion.div>

        {submitError && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm text-destructive">
            {submitError}
          </div>
        )}

        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            disabled={submitting}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors btn-press disabled:opacity-50"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <motion.div whileTap={{ scale: 0.98 }}>
            <button
              onClick={handleConfirm}
              disabled={submitting}
              className="bg-primary text-primary-foreground px-5 md:px-6 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-2 touch-target disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</>
              ) : user ? (
                <>Request Booking <Check className="w-4 h-4" /></>
              ) : (
                <>Sign in to book <Check className="w-4 h-4" /></>
              )}
            </button>
          </motion.div>
        </div>
      </div>
    </PageTransition>
  );
}
