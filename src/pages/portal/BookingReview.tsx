import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";

function formatIDR(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
}

export default function BookingReview() {
  return (
    <div className="max-w-3xl mx-auto px-8 py-8 space-y-6">
      <div className="flex items-center gap-3 text-sm">
        <span className="text-muted-foreground">1. Room</span><span className="text-muted-foreground">→</span>
        <span className="text-muted-foreground">2. Details</span><span className="text-muted-foreground">→</span>
        <span className="text-primary font-semibold">3. Review</span><span className="text-muted-foreground">→</span>
        <span className="text-muted-foreground">4. Confirmation</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-foreground">Review Your Booking</h1>
        <p className="text-sm text-muted-foreground mt-1">Please review all details before confirming</p>
      </div>

      <div className="space-y-4">
        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="font-semibold text-foreground mb-3">Room Details</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-muted-foreground">Room Type</span><p className="font-medium text-foreground mt-0.5">Deluxe Room</p></div>
            <div><span className="text-muted-foreground">Bed Type</span><p className="font-medium text-foreground mt-0.5">King</p></div>
            <div><span className="text-muted-foreground">Check-in</span><p className="font-medium text-foreground mt-0.5">April 10, 2026</p></div>
            <div><span className="text-muted-foreground">Check-out</span><p className="font-medium text-foreground mt-0.5">April 13, 2026</p></div>
            <div><span className="text-muted-foreground">Nights</span><p className="font-medium text-foreground mt-0.5">3</p></div>
            <div><span className="text-muted-foreground">Guests</span><p className="font-medium text-foreground mt-0.5">2 Adults</p></div>
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="font-semibold text-foreground mb-3">Guest Information</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-muted-foreground">Name</span><p className="font-medium text-foreground mt-0.5">John Doe</p></div>
            <div><span className="text-muted-foreground">Email</span><p className="font-medium text-foreground mt-0.5">john@example.com</p></div>
            <div><span className="text-muted-foreground">Phone</span><p className="font-medium text-foreground mt-0.5">+62 812 3456 7890</p></div>
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="font-semibold text-foreground mb-3">Price Breakdown</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Apr 10 — Deluxe Room</span><span className="text-foreground">{formatIDR(1250000)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Apr 11 — Deluxe Room</span><span className="text-foreground">{formatIDR(1250000)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Apr 12 — Deluxe Room</span><span className="text-foreground">{formatIDR(1250000)}</span></div>
            <div className="flex justify-between font-semibold pt-2 border-t border-border"><span className="text-foreground">Total</span><span className="text-primary">{formatIDR(3750000)}</span></div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Link to="/portal/book/details" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
        <Link to="/portal/book/confirmation" className="bg-primary text-primary-foreground px-6 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-2">
          Confirm Booking <Check className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
