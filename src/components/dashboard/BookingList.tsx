import { useState } from "react";
import { Search, Eye, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/shared/PageTransition";
import CopyButton from "@/components/shared/CopyButton";
import { useBookings } from "@/hooks/useBookings";
import type { BookingStatus, BookingWithRelations } from "@/types/database.types";

const statusLabels: Record<BookingStatus, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "badge-warning" },
  confirmed: { label: "Confirmed", cls: "badge-info" },
  checked_in: { label: "Checked-In", cls: "badge-success" },
  checked_out: { label: "Checked-Out", cls: "badge-info" },
  cancelled: { label: "Cancelled", cls: "badge-destructive" },
  no_show: { label: "No Show", cls: "badge-destructive" },
};

// Colour by room type name, so the badge stays stable as types are added.
const typeColors = ["bg-primary", "bg-info", "bg-warning", "bg-success", "bg-destructive"];
function typeColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return typeColors[hash % typeColors.length];
}

function nightsOf(checkIn: string, checkOut: string) {
  const ms = new Date(checkOut + "T00:00:00Z").getTime() - new Date(checkIn + "T00:00:00Z").getTime();
  return Math.max(1, Math.round(ms / 86_400_000));
}

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function BookingList() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<BookingStatus | "all">("all");
  const { data, isLoading, error } = useBookings({
    status: status === "all" ? undefined : status,
    search: search || undefined,
    pageSize: 5,
  });

  const bookings = (data?.data ?? []) as BookingWithRelations[];

  return (
    <div className="bg-card rounded-xl p-5 border border-border">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-3">
        <h3 className="font-semibold text-foreground">Booking List</h3>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2 flex-1 sm:w-56">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search guest, ref, room"
              className="bg-transparent text-xs outline-none w-full text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as BookingStatus | "all")}
            aria-label="Filter by status"
            className="text-sm bg-muted rounded-lg px-3 py-2 text-foreground border-none outline-none cursor-pointer"
          >
            <option value="all">All Status</option>
            {Object.entries(statusLabels).map(([key, s]) => (
              <option key={key} value={key}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <p className="text-xs text-destructive py-8 text-center">
          Could not load bookings: {(error as Error).message}
        </p>
      ) : bookings.length === 0 ? (
        <p className="text-xs text-muted-foreground py-8 text-center">No bookings match this filter.</p>
      ) : (
        <>
          {/* Desktop table */}
          <div className="overflow-x-auto hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="text-left py-3 font-medium">Booking ID</th>
                  <th className="text-left py-3 font-medium">Guest Name</th>
                  <th className="text-left py-3 font-medium">Room Type</th>
                  <th className="text-left py-3 font-medium">Room Number</th>
                  <th className="text-left py-3 font-medium">Duration</th>
                  <th className="text-left py-3 font-medium">Check-In &amp; Check-Out</th>
                  <th className="text-left py-3 font-medium">Status</th>
                  <th className="text-left py-3 font-medium"></th>
                </tr>
              </thead>
              <motion.tbody variants={staggerContainer} initial="hidden" animate="show">
                {bookings.map((b) => {
                  const type = b.rooms?.room_types?.name ?? "—";
                  const s = statusLabels[b.status];
                  return (
                    <motion.tr key={b.id} variants={staggerItem} className="border-b border-border last:border-0 table-row-hover">
                      <td className="py-3 font-medium text-foreground">
                        <div className="flex items-center gap-1">
                          <span className="font-mono">{b.reference}</span>
                          <CopyButton text={b.reference} />
                        </div>
                      </td>
                      <td className="py-3 text-foreground font-medium">{b.customers?.full_name ?? "—"}</td>
                      <td className="py-3">
                        <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-md text-primary-foreground", typeColor(type))}>
                          {type}
                        </span>
                      </td>
                      <td className="py-3 text-foreground">{b.rooms?.number ? "Room " + b.rooms.number : "—"}</td>
                      <td className="py-3 text-muted-foreground">{nightsOf(b.check_in, b.check_out)} nights</td>
                      <td className="py-3 text-muted-foreground">{fmtDate(b.check_in)} - {fmtDate(b.check_out)}</td>
                      <td className="py-3">
                        <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-full", s.cls)}>{s.label}</span>
                      </td>
                      <td className="py-3">
                        <Link to={"/bookings/" + b.id} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="View details">
                          <Eye className="w-4 h-4" />
                        </Link>
                      </td>
                    </motion.tr>
                  );
                })}
              </motion.tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <motion.div variants={staggerContainer} initial="hidden" animate="show" className="md:hidden space-y-3">
            {bookings.map((b) => {
              const s = statusLabels[b.status];
              return (
                <motion.div key={b.id} variants={staggerItem}>
                  <Link to={"/bookings/" + b.id} className="block bg-muted/30 rounded-xl p-4 hover:bg-muted/50 transition-colors">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{b.customers?.full_name ?? "—"}</p>
                        <p className="text-xs font-mono text-muted-foreground">{b.reference}</p>
                      </div>
                      <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", s.cls)}>{s.label}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{b.rooms?.number ? "Room " + b.rooms.number : "—"} · {b.rooms?.room_types?.name ?? "—"}</span>
                      <span>{nightsOf(b.check_in, b.check_out)} nights</span>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </motion.div>
        </>
      )}
    </div>
  );
}
