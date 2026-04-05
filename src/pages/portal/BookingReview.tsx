import { Link } from "react-router-dom";
import { ArrowLeft, Check } from "lucide-react";
import { motion } from "framer-motion";
import PageTransition, { staggerContainer, staggerItem } from "@/components/shared/PageTransition";
function formatIDR(n: number) { return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n); }

const steps = [
  { num: 1, label: "Room", done: true },
  { num: 2, label: "Details", done: true },
  { num: 3, label: "Review", active: true },
  { num: 4, label: "Confirmation" },
];

export default function BookingReview() {
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

        <div><h1 className="text-xl md:text-2xl font-bold text-foreground">Review Your Booking</h1><p className="text-sm text-muted-foreground mt-1">Please review all details before confirming</p></div>

        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-4">
          <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-4 md:p-5">
            <h2 className="font-semibold text-foreground mb-3">Room Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div><span className="text-muted-foreground">Room Type</span><p className="font-medium text-foreground mt-0.5">Deluxe Room</p></div>
              <div><span className="text-muted-foreground">Bed Type</span><p className="font-medium text-foreground mt-0.5">King</p></div>
              <div><span className="text-muted-foreground">Check-in</span><p className="font-medium text-foreground mt-0.5">April 10, 2026</p></div>
              <div><span className="text-muted-foreground">Check-out</span><p className="font-medium text-foreground mt-0.5">April 13, 2026</p></div>
              <div><span className="text-muted-foreground">Nights</span><p className="font-medium text-foreground mt-0.5">3</p></div>
              <div><span className="text-muted-foreground">Guests</span><p className="font-medium text-foreground mt-0.5">2 Adults</p></div>
            </div>
          </motion.div>
          <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-4 md:p-5">
            <h2 className="font-semibold text-foreground mb-3">Guest Information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div><span className="text-muted-foreground">Name</span><p className="font-medium text-foreground mt-0.5">John Doe</p></div>
              <div><span className="text-muted-foreground">Email</span><p className="font-medium text-foreground mt-0.5">john@example.com</p></div>
              <div><span className="text-muted-foreground">Phone</span><p className="font-medium text-foreground mt-0.5">+62 812 3456 7890</p></div>
            </div>
          </motion.div>
          <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-4 md:p-5">
            <h2 className="font-semibold text-foreground mb-3">Price Breakdown</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Apr 10 — Deluxe Room</span><span className="text-foreground tabular-nums">{formatIDR(1250000)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Apr 11 — Deluxe Room</span><span className="text-foreground tabular-nums">{formatIDR(1250000)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Apr 12 — Deluxe Room</span><span className="text-foreground tabular-nums">{formatIDR(1250000)}</span></div>
              <div className="flex justify-between font-semibold pt-2 border-t border-border"><span className="text-foreground">Total</span><span className="text-primary tabular-nums">{formatIDR(3750000)}</span></div>
            </div>
          </motion.div>
        </motion.div>

        <div className="flex items-center justify-between">
          <Link to="/portal/book/details" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors btn-press"><ArrowLeft className="w-4 h-4" /> Back</Link>
          <motion.div whileTap={{ scale: 0.98 }}>
            <Link to="/portal/book/confirmation" className="bg-primary text-primary-foreground px-5 md:px-6 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-2 touch-target">Confirm Booking <Check className="w-4 h-4" /></Link>
          </motion.div>
        </div>
      </div>
    </PageTransition>
  );
}
