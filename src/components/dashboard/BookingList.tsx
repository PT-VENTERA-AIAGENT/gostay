import { Search, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/shared/PageTransition";
import CopyButton from "@/components/shared/CopyButton";

const bookings = [
  { id: "LG-B00108", guest: "Angus Copper", type: "Deluxe", typeColor: "bg-primary", room: "Room 101", nights: 3, checkIn: "June 19, 2028", checkOut: "June 22, 2028", status: "Checked-In" },
  { id: "LG-B00109", guest: "Catherine Lopp", type: "Standard", typeColor: "bg-info", room: "Room 202", nights: 2, checkIn: "June 19, 2028", checkOut: "June 21, 2028", status: "Checked-In" },
  { id: "LG-B00110", guest: "Edgar Irving", type: "Suite", typeColor: "bg-warning", room: "Room 303", nights: 5, checkIn: "June 19, 2028", checkOut: "June 24, 2028", status: "Pending" },
  { id: "LG-B00111", guest: "Ice B. Holand", type: "Standard", typeColor: "bg-info", room: "Room 105", nights: 4, checkIn: "June 19, 2028", checkOut: "June 23, 2028", status: "Checked-In" },
];

export default function BookingList() {
  return (
    <div className="bg-card rounded-xl p-5 border border-border">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-3">
        <h3 className="font-semibold text-foreground">Booking List</h3>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2 flex-1 sm:w-56">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input placeholder="Search guest, status, etc" className="bg-transparent text-xs outline-none w-full text-foreground placeholder:text-muted-foreground" />
          </div>
          <select className="text-sm bg-muted rounded-lg px-3 py-2 text-foreground border-none outline-none cursor-pointer">
            <option>All Status</option>
            <option>Checked-In</option>
            <option>Pending</option>
          </select>
        </div>
      </div>

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
              <th className="text-left py-3 font-medium">Check-In & Check-Out</th>
              <th className="text-left py-3 font-medium">Status</th>
              <th className="text-left py-3 font-medium"></th>
            </tr>
          </thead>
          <motion.tbody variants={staggerContainer} initial="hidden" animate="show">
            {bookings.map((b) => (
              <motion.tr key={b.id} variants={staggerItem} className="border-b border-border last:border-0 table-row-hover">
                <td className="py-3 font-medium text-foreground">
                  <div className="flex items-center gap-1">
                    <span className="font-mono">{b.id}</span>
                    <CopyButton text={b.id} />
                  </div>
                </td>
                <td className="py-3 text-foreground font-medium">{b.guest}</td>
                <td className="py-3">
                  <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-md text-primary-foreground", b.typeColor)}>
                    {b.type}
                  </span>
                </td>
                <td className="py-3 text-foreground">{b.room}</td>
                <td className="py-3 text-muted-foreground">{b.nights} nights</td>
                <td className="py-3 text-muted-foreground">{b.checkIn} - {b.checkOut}</td>
                <td className="py-3">
                  <span className={cn(
                    "text-xs font-semibold px-2.5 py-1 rounded-full",
                    b.status === "Checked-In" ? "badge-success" : "badge-warning"
                  )}>
                    {b.status}
                  </span>
                </td>
                <td className="py-3">
                  <Link to={`/bookings/${b.id}`} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="View details">
                    <Eye className="w-4 h-4" />
                  </Link>
                </td>
              </motion.tr>
            ))}
          </motion.tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="md:hidden space-y-3">
        {bookings.map((b) => (
          <motion.div key={b.id} variants={staggerItem}>
            <Link to={`/bookings/${b.id}`} className="block bg-muted/30 rounded-xl p-4 hover:bg-muted/50 transition-colors">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-sm font-semibold text-foreground">{b.guest}</p>
                  <p className="text-xs font-mono text-muted-foreground">{b.id}</p>
                </div>
                <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", b.status === "Checked-In" ? "badge-success" : "badge-warning")}>{b.status}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{b.room} · {b.type}</span>
                <span>{b.nights} nights</span>
              </div>
            </Link>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
