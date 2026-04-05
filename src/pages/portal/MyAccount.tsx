import { Link } from "react-router-dom";
import { Calendar, User, Settings, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

const myBookings = [
  { id: "1", reference: "BK-20260410-X7Y8", roomType: "Deluxe Room", checkIn: "Apr 10, 2026", checkOut: "Apr 13, 2026", status: "confirmed", total: "IDR 3,750,000" },
  { id: "2", reference: "BK-20260301-A1B2", roomType: "Standard Room", checkIn: "Mar 1, 2026", checkOut: "Mar 3, 2026", status: "checked_out", total: "IDR 1,700,000" },
  { id: "3", reference: "BK-20260215-C3D4", roomType: "Suite", checkIn: "Feb 15, 2026", checkOut: "Feb 18, 2026", status: "checked_out", total: "IDR 7,500,000" },
];

const statusConfig: Record<string, { label: string; cls: string }> = {
  confirmed: { label: "Upcoming", cls: "bg-info/10 text-info" },
  checked_out: { label: "Completed", cls: "bg-muted text-muted-foreground" },
  cancelled: { label: "Cancelled", cls: "bg-destructive/10 text-destructive" },
};

export default function MyAccount() {
  return (
    <div className="max-w-4xl mx-auto px-8 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Account</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your bookings and profile</p>
      </div>

      {/* Profile card */}
      <div className="bg-card rounded-xl border border-border p-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center text-lg font-bold text-primary">JD</div>
          <div>
            <p className="font-semibold text-foreground">John Doe</p>
            <p className="text-sm text-muted-foreground">john@example.com • +62 812 3456 7890</p>
          </div>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
          <Settings className="w-4 h-4" /> Edit Profile
        </button>
      </div>

      {/* Bookings */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">My Bookings</h2>
        <div className="space-y-3">
          {myBookings.map((b) => {
            const sc = statusConfig[b.status] || statusConfig.confirmed;
            return (
              <div key={b.id} className="bg-card rounded-xl border border-border p-5 flex items-center justify-between hover:shadow-sm transition-shadow">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground">{b.roomType}</p>
                      <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", sc.cls)}>{sc.label}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{b.checkIn} → {b.checkOut}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{b.reference}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-semibold text-foreground">{b.total}</span>
                  <Link to={`/portal/my-account/bookings/${b.id}`} className="text-muted-foreground hover:text-foreground transition-colors">
                    <Eye className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
