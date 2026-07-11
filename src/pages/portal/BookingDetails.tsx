import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, User, Mail, Phone, Check } from "lucide-react";
import { motion } from "framer-motion";
import PageTransition from "@/components/shared/PageTransition";
import type { RoomType } from "@/types/database.types";

interface BookingState {
  roomType: RoomType;
  checkIn: string;
  checkOut: string;
  guests: number;
}

const steps = [
  { num: 1, label: "Room", done: true },
  { num: 2, label: "Details", active: true },
  { num: 3, label: "Review" },
  { num: 4, label: "Confirmation" },
];

function formatIDR(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
}

function diffNights(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 0;
  const a = new Date(checkIn).getTime();
  const b = new Date(checkOut).getTime();
  return Math.max(0, Math.round((b - a) / (1000 * 60 * 60 * 24)));
}

export default function BookingDetails() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as BookingState | null;

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [specialRequests, setSpecialRequests] = useState("");

  if (!state?.roomType) {
    return (
      <PageTransition>
        <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-8 text-center space-y-4">
          <p className="text-muted-foreground">No booking data found. Please start from the rooms page.</p>
          <button
            onClick={() => navigate("/portal")}
            className="text-primary text-sm hover:underline"
          >
            Browse rooms
          </button>
        </div>
      </PageTransition>
    );
  }

  const { roomType, checkIn, checkOut, guests } = state;
  const nights = diffNights(checkIn, checkOut);
  const total = nights * roomType.base_rate;

  function handleContinue() {
    navigate("/portal/book/review", {
      state: {
        roomType,
        checkIn,
        checkOut,
        guests,
        guestInfo: { firstName, lastName, email, phone, specialRequests },
        nights,
        total,
      },
    });
  }

  const canContinue = firstName.trim() && lastName.trim() && email.trim() && phone.trim();

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

        {/* Room summary card */}
        <div className="bg-muted/40 rounded-xl border border-border p-4 text-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-semibold text-foreground">{roomType.name}</p>
              {checkIn && checkOut && (
                <p className="text-muted-foreground mt-0.5">
                  {checkIn} → {checkOut} · {nights} night{nights !== 1 ? "s" : ""} · {guests} guest{guests !== 1 ? "s" : ""}
                </p>
              )}
            </div>
            {total > 0 && (
              <p className="font-bold text-primary shrink-0">{formatIDR(total)}</p>
            )}
          </div>
        </div>

        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Guest Details</h1>
          <p className="text-sm text-muted-foreground mt-1">Please provide your information</p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-xl border border-border p-4 md:p-6 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">First Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="John"
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Last Name</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Doe"
                className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Phone</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+62 812 3456 7890"
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              Special Requests <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <textarea
              rows={3}
              value={specialRequests}
              onChange={(e) => setSpecialRequests(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              placeholder="Any special requests..."
            />
          </div>
        </motion.div>

        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors btn-press"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <motion.div whileTap={{ scale: 0.98 }}>
            <button
              onClick={handleContinue}
              disabled={!canContinue}
              className="bg-primary text-primary-foreground px-5 md:px-6 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-2 touch-target disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Review Booking <ArrowRight className="w-4 h-4" />
            </button>
          </motion.div>
        </div>
      </div>
    </PageTransition>
  );
}
