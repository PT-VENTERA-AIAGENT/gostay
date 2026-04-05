import { Link } from "react-router-dom";
import { Plus, Search, Filter, Download, Calendar, List, Eye, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

const bookings = [
  { id: "1", reference: "BK-20260401-A1B2", guest: "David Chen", room: "203", roomType: "Deluxe", checkIn: "2026-04-01", checkOut: "2026-04-04", status: "checked_in", total: 3750000, source: "portal" },
  { id: "2", reference: "BK-20260402-C3D4", guest: "Sarah Kim", room: "103", roomType: "Standard", checkIn: "2026-04-02", checkOut: "2026-04-05", status: "confirmed", total: 2550000, source: "phone" },
  { id: "3", reference: "BK-20260403-E5F6", guest: "Mike Johnson", room: "202", roomType: "Standard", checkIn: "2026-04-05", checkOut: "2026-04-07", status: "pending", total: 1700000, source: "walk_in" },
  { id: "4", reference: "BK-20260403-G7H8", guest: "Emily Davis", room: "208", roomType: "Deluxe", checkIn: "2026-04-03", checkOut: "2026-04-06", status: "checked_in", total: 3750000, source: "portal" },
  { id: "5", reference: "BK-20260401-I9J0", guest: "Robert Wilson", room: "205", roomType: "Suite", checkIn: "2026-04-01", checkOut: "2026-04-03", status: "checked_out", total: 5000000, source: "staff" },
  { id: "6", reference: "BK-20260330-K1L2", guest: "Anna Lee", room: "302", roomType: "Family", checkIn: "2026-03-30", checkOut: "2026-04-02", status: "checked_out", total: 5400000, source: "portal" },
  { id: "7", reference: "BK-20260405-M3N4", guest: "James Brown", room: "305", roomType: "Presidential", checkIn: "2026-04-07", checkOut: "2026-04-10", status: "confirmed", total: 15000000, source: "phone" },
  { id: "8", reference: "BK-20260328-O5P6", guest: "Lisa Wang", room: "107", roomType: "Deluxe", checkIn: "2026-03-28", checkOut: "2026-04-01", status: "cancelled", total: 5000000, source: "portal" },
];

const statusConfig: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-warning/10 text-warning" },
  confirmed: { label: "Confirmed", cls: "bg-info/10 text-info" },
  checked_in: { label: "Checked In", cls: "bg-primary/10 text-primary" },
  checked_out: { label: "Checked Out", cls: "bg-muted text-muted-foreground" },
  cancelled: { label: "Cancelled", cls: "bg-destructive/10 text-destructive" },
  no_show: { label: "No Show", cls: "bg-destructive/10 text-destructive" },
};

function formatIDR(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
}

export default function Bookings() {
  const [view, setView] = useState<"list" | "calendar">("list");

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reservations</h1>
          <p className="text-sm text-muted-foreground mt-1">{bookings.length} total bookings</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-card text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <Link to="/bookings/new" className="bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-2">
            <Plus className="w-4 h-4" /> New Booking
          </Link>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-4 py-2.5 w-80">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input placeholder="Search by guest, reference, room..." className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full" />
          </div>
          <button className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-card text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
            <Filter className="w-4 h-4" /> Filter
          </button>
        </div>
        <div className="flex items-center bg-muted rounded-lg p-1">
          <button onClick={() => setView("list")} className={cn("px-3 py-1.5 rounded-md text-sm font-medium transition-colors", view === "list" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}>
            <List className="w-4 h-4" />
          </button>
          <button onClick={() => setView("calendar")} className={cn("px-3 py-1.5 rounded-md text-sm font-medium transition-colors", view === "calendar" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}>
            <Calendar className="w-4 h-4" />
          </button>
        </div>
      </div>

      {view === "list" ? (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="text-left px-4 py-3 font-medium">Reference</th>
                <th className="text-left px-4 py-3 font-medium">Guest</th>
                <th className="text-left px-4 py-3 font-medium">Room</th>
                <th className="text-left px-4 py-3 font-medium">Check-in</th>
                <th className="text-left px-4 py-3 font-medium">Check-out</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Total</th>
                <th className="text-left px-4 py-3 font-medium">Source</th>
                <th className="text-left px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => {
                const sc = statusConfig[b.status];
                return (
                  <tr key={b.id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-3 text-sm font-mono font-medium text-primary">{b.reference}</td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{b.guest}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{b.room} · {b.roomType}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{b.checkIn}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{b.checkOut}</td>
                    <td className="px-4 py-3"><span className={cn("text-xs font-medium px-2.5 py-1 rounded-full", sc.cls)}>{sc.label}</span></td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{formatIDR(b.total)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground capitalize">{b.source.replace("_", " ")}</td>
                    <td className="px-4 py-3">
                      <Link to={`/bookings/${b.id}`} className="text-muted-foreground hover:text-foreground transition-colors">
                        <Eye className="w-4 h-4" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="text-center py-16">
            <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-semibold text-foreground mb-1">Calendar View</h3>
            <p className="text-sm text-muted-foreground">Gantt-style room × date grid will be rendered here</p>
            <p className="text-xs text-muted-foreground mt-1">Rooms on Y-axis, dates on X-axis with booking bars</p>
          </div>
        </div>
      )}
    </div>
  );
}
