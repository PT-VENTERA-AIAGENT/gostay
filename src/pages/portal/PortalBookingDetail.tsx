import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Calendar, MapPin, User, CreditCard, XCircle, MessageSquare } from "lucide-react";

function formatIDR(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
}

export default function PortalBookingDetail() {
  const { id } = useParams();

  return (
    <div className="max-w-3xl mx-auto px-8 py-8 space-y-6">
      <Link to="/portal/my-account" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to My Account
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Booking Detail</h1>
          <p className="text-sm font-mono text-primary mt-1">BK-20260410-X7Y8</p>
        </div>
        <span className="text-xs font-medium px-3 py-1 rounded-full bg-info/10 text-info">Upcoming</span>
      </div>

      <div className="space-y-4">
        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="font-semibold text-foreground mb-3 flex items-center gap-2"><MapPin className="w-4 h-4" /> Stay Details</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-muted-foreground">Room Type</span><p className="font-medium text-foreground mt-0.5">Deluxe Room (King Bed)</p></div>
            <div><span className="text-muted-foreground">Dates</span><p className="font-medium text-foreground mt-0.5">Apr 10 – Apr 13, 2026 (3 nights)</p></div>
            <div><span className="text-muted-foreground">Guests</span><p className="font-medium text-foreground mt-0.5">2 Adults</p></div>
            <div><span className="text-muted-foreground">Special Requests</span><p className="font-medium text-foreground mt-0.5">Late check-out, extra pillows</p></div>
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="font-semibold text-foreground mb-3 flex items-center gap-2"><CreditCard className="w-4 h-4" /> Payment</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">3 nights × {formatIDR(1250000)}</span><span className="text-foreground">{formatIDR(3750000)}</span></div>
            <div className="flex justify-between font-semibold pt-2 border-t border-border"><span className="text-foreground">Total</span><span className="text-primary">{formatIDR(3750000)}</span></div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Link to="/portal/chat" className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors">
          <MessageSquare className="w-4 h-4" /> Contact Hotel
        </Link>
        <button className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-destructive text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors">
          <XCircle className="w-4 h-4" /> Cancel Booking
        </button>
      </div>
    </div>
  );
}
