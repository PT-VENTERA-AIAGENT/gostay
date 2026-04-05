import { Link } from "react-router-dom";
import { Plus, Search, Filter, Download, Calendar, List, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { motion } from "framer-motion";
import PageTransition, { staggerContainer, staggerItem } from "@/components/shared/PageTransition";
import BookingCalendar from "@/components/bookings/BookingCalendar";

const bookings = [
  { id: "1", reference: "BK-20260401-A1B2", guest: "David Chen", room: "203", roomType: "Deluxe", checkIn: "2026-04-01", checkOut: "2026-04-04", status: "checked_in", total: 3750000, source: "portal" },
  { id: "2", reference: "BK-20260402-C3D4", guest: "Sarah Kim", room: "103", roomType: "Standard", checkIn: "2026-04-02", checkOut: "2026-04-05", status: "confirmed", total: 2550000, source: "phone" },
  { id: "3", reference: "BK-20260403-E5F6", guest: "Mike Johnson", room: "202", roomType: "Standard", checkIn: "2026-04-05", checkOut: "2026-04-07", status: "pending", total: 1700000, source: "walk_in" },
  { id: "4", reference: "BK-20260403-G7H8", guest: "Emily Davis", room: "208", roomType: "Deluxe", checkIn: "2026-04-03", checkOut: "2026-04-06", status: "checked_in", total: 3750000, source: "portal" },
  { id: "5", reference: "BK-20260401-I9J0", guest: "Robert Wilson", room: "205", roomType: "Suite", checkIn: "2026-04-01", checkOut: "2026-04-03", status: "checked_out", total: 5000000, source: "staff" },
  { id: "6", reference: "BK-20260330-K1L2", guest: "Anna Lee", room: "302", roomType: "Family", checkIn: "2026-03-30", checkOut: "2026-04-02", status: "checked_out", total: 5400000, source: "portal" },
  { id: "7", reference: "BK-20260405-M3N4", guest: "James Brown", room: "305", roomType: "Presidential", checkIn: "2026-04-07", checkOut: "2026-04-10", status: "confirmed", total: 15000000, source: "phone" },
  { id: "8", reference: "BK-20260328-O5P6", guest: "Lisa Wang", room: "107", roomType: "Deluxe", checkIn: "2026-03-28", checkOut: "2026-04-01", status: "cancelled", total: 5000000, source: "portal" },
  { id: "9", reference: "BK-20260404-Q7R8", guest: "Grace Park", room: "204", roomType: "Suite", checkIn: "2026-04-04", checkOut: "2026-04-08", status: "confirmed", total: 10000000, source: "portal" },
  { id: "10", reference: "BK-20260402-S9T0", guest: "Kevin Nguyen", room: "301", roomType: "Family", checkIn: "2026-04-02", checkOut: "2026-04-06", status: "checked_in", total: 7200000, source: "walk_in" },
  { id: "11", reference: "BK-20260401-U1V2", guest: "Sofia Martinez", room: "304", roomType: "Presidential", checkIn: "2026-04-01", checkOut: "2026-04-05", status: "checked_in", total: 20000000, source: "phone" },
  { id: "12", reference: "BK-20260406-W3X4", guest: "Tom Harris", room: "101", roomType: "Standard", checkIn: "2026-04-06", checkOut: "2026-04-09", status: "confirmed", total: 2550000, source: "portal" },
];

const statusConfig: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-warning/10 text-warning" },
  confirmed: { label: "Confirmed", cls: "bg-info/10 text-info" },
  checked_in: { label: "Checked In", cls: "bg-primary/10 text-primary" },
  checked_out: { label: "Checked Out", cls: "bg-muted text-muted-foreground" },
  cancelled: { label: "Cancelled", cls: "bg-destructive/10 text-destructive" },
  no_show: { label: "No Show", cls: "bg-destructive/10 text-destructive" },
};

const statusTabs = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "confirmed", label: "Confirmed" },
  { key: "checked_in", label: "Checked In" },
  { key: "checked_out", label: "Checked Out" },
  { key: "cancelled", label: "Cancelled" },
];

function formatIDR(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
}

export default function Bookings() {
  const [view, setView] = useState<"list" | "calendar">("list");
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = bookings.filter((b) => {
    if (activeTab !== "all" && b.status !== activeTab) return false;
    if (search) {
      const q = search.toLowerCase();
      return b.guest.toLowerCase().includes(q) || b.reference.toLowerCase().includes(q) || b.room.includes(q);
    }
    return true;
  });

  return (
    <PageTransition>
      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">Reservations</h1>
            <p className="text-sm text-muted-foreground mt-1">{bookings.length} total bookings</p>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <button className="hidden sm:flex items-center gap-2 px-3 md:px-4 py-2 md:py-2.5 rounded-lg border border-border bg-card text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
              <Download className="w-4 h-4" /> <span className="hidden md:inline">Export CSV</span>
            </button>
            <Link to="/bookings/new" className="bg-primary text-primary-foreground px-3 md:px-4 py-2 md:py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-2">
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">New Booking</span>
            </Link>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 md:gap-3 flex-1">
            <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 md:px-4 py-2 md:py-2.5 flex-1 sm:max-w-sm">
              <Search className="w-4 h-4 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search guest, ref, room..." className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full" />
            </div>
            <button className="hidden sm:flex items-center gap-2 px-3 md:px-4 py-2 md:py-2.5 rounded-lg border border-border bg-card text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
              <Filter className="w-4 h-4" /> Filter
            </button>
          </div>
          <div className="flex items-center bg-muted rounded-lg p-1 self-start">
            <button onClick={() => setView("list")} className={cn("px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5", view === "list" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}>
              <List className="w-4 h-4" /> List
            </button>
            <button onClick={() => setView("calendar")} className={cn("px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5", view === "calendar" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}>
              <Calendar className="w-4 h-4" /> Calendar
            </button>
          </div>
        </div>

        {view === "list" ? (
          <>
            <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
              {statusTabs.map((tab) => {
                const count = tab.key === "all" ? bookings.length : bookings.filter((b) => b.status === tab.key).length;
                return (
                  <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={cn("px-3 md:px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap", activeTab === tab.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
                    {tab.label} <span className="text-xs ml-1 opacity-60">({count})</span>
                  </button>
                );
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block bg-card rounded-xl border border-border overflow-hidden">
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
                <motion.tbody variants={staggerContainer} initial="hidden" animate="show">
                  {filtered.map((b) => {
                    const sc = statusConfig[b.status];
                    return (
                      <motion.tr key={b.id} variants={staggerItem} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                        <td className="px-4 py-3 text-sm font-mono font-medium text-primary">{b.reference}</td>
                        <td className="px-4 py-3 text-sm font-medium text-foreground">{b.guest}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{b.room} · {b.roomType}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{b.checkIn}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{b.checkOut}</td>
                        <td className="px-4 py-3"><span className={cn("text-xs font-medium px-2.5 py-1 rounded-full", sc.cls)}>{sc.label}</span></td>
                        <td className="px-4 py-3 text-sm font-medium text-foreground">{formatIDR(b.total)}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground capitalize">{b.source.replace("_", " ")}</td>
                        <td className="px-4 py-3"><Link to={`/bookings/${b.id}`} className="text-muted-foreground hover:text-foreground transition-colors"><Eye className="w-4 h-4" /></Link></td>
                      </motion.tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-12 text-center text-sm text-muted-foreground">No bookings found</td></tr>
                  )}
                </motion.tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <motion.div variants={staggerContainer} initial="hidden" animate="show" className="md:hidden space-y-3">
              {filtered.map((b) => {
                const sc = statusConfig[b.status];
                return (
                  <motion.div key={b.id} variants={staggerItem}>
                    <Link to={`/bookings/${b.id}`} className="block bg-card rounded-xl border border-border p-4 hover:shadow-sm transition-shadow">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{b.guest}</p>
                          <p className="text-xs font-mono text-primary">{b.reference}</p>
                        </div>
                        <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", sc.cls)}>{sc.label}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{b.room} · {b.roomType}</span>
                        <span>{b.checkIn} → {b.checkOut}</span>
                      </div>
                      <p className="text-sm font-semibold text-foreground mt-2">{formatIDR(b.total)}</p>
                    </Link>
                  </motion.div>
                );
              })}
              {filtered.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No bookings found</p>}
            </motion.div>
          </>
        ) : (
          <BookingCalendar />
        )}
      </div>
    </PageTransition>
  );
}
