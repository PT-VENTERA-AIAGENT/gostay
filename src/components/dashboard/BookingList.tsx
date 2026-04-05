import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

const bookings = [
  { id: "LG-B00108", guest: "Angus Copper", type: "Deluxe", typeColor: "bg-primary", room: "Room 101", nights: 3, checkIn: "June 19, 2028", checkOut: "June 22, 2028", status: "Checked-In" },
  { id: "LG-B00109", guest: "Catherine Lopp", type: "Standard", typeColor: "bg-info", room: "Room 202", nights: 2, checkIn: "June 19, 2028", checkOut: "June 21, 2028", status: "Checked-In" },
  { id: "LG-B00110", guest: "Edgar Irving", type: "Suite", typeColor: "bg-warning", room: "Room 303", nights: 5, checkIn: "June 19, 2028", checkOut: "June 24, 2028", status: "Pending" },
  { id: "LG-B00111", guest: "Ice B. Holand", type: "Standard", typeColor: "bg-info", room: "Room 105", nights: 4, checkIn: "June 19, 2028", checkOut: "June 23, 2028", status: "Checked-In" },
];

export default function BookingList() {
  return (
    <div className="bg-card rounded-xl p-5 border border-border">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground">Booking List</h3>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2 w-56">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input placeholder="Search guest, status, etc" className="bg-transparent text-xs outline-none w-full text-foreground placeholder:text-muted-foreground" />
          </div>
          <select className="text-sm bg-muted rounded-lg px-3 py-2 text-foreground border-none outline-none">
            <option>All Status</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
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
            </tr>
          </thead>
          <tbody>
            {bookings.map((b) => (
              <tr key={b.id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                <td className="py-3 font-medium text-foreground">{b.id}</td>
                <td className="py-3 text-foreground">{b.guest}</td>
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
                    b.status === "Checked-In" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
                  )}>
                    {b.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
