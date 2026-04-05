import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

const rooms = [
  { id: "1", number: "101", type: "Standard" },
  { id: "2", number: "102", type: "Standard" },
  { id: "3", number: "103", type: "Standard" },
  { id: "4", number: "104", type: "Deluxe" },
  { id: "5", number: "105", type: "Deluxe" },
  { id: "6", number: "201", type: "Standard" },
  { id: "7", number: "202", type: "Standard" },
  { id: "8", number: "203", type: "Deluxe" },
  { id: "9", number: "204", type: "Suite" },
  { id: "10", number: "205", type: "Suite" },
  { id: "11", number: "301", type: "Family" },
  { id: "12", number: "302", type: "Family" },
  { id: "13", number: "303", type: "Suite" },
  { id: "14", number: "304", type: "Presidential" },
  { id: "15", number: "305", type: "Presidential" },
];

const bookings = [
  { id: "1", roomId: "2", guest: "David Chen", checkIn: "2026-04-01", checkOut: "2026-04-04", status: "checked_in" },
  { id: "2", roomId: "3", guest: "Sarah Kim", checkIn: "2026-04-02", checkOut: "2026-04-05", status: "confirmed" },
  { id: "3", roomId: "7", guest: "Mike Johnson", checkIn: "2026-04-05", checkOut: "2026-04-07", status: "pending" },
  { id: "4", roomId: "8", guest: "Emily Davis", checkIn: "2026-04-03", checkOut: "2026-04-06", status: "checked_in" },
  { id: "5", roomId: "10", guest: "Robert Wilson", checkIn: "2026-04-01", checkOut: "2026-04-03", status: "checked_out" },
  { id: "6", roomId: "12", guest: "Anna Lee", checkIn: "2026-03-30", checkOut: "2026-04-02", status: "checked_out" },
  { id: "7", roomId: "15", guest: "James Brown", checkIn: "2026-04-07", checkOut: "2026-04-10", status: "confirmed" },
  { id: "8", roomId: "5", guest: "Lisa Wang", checkIn: "2026-04-01", checkOut: "2026-04-04", status: "checked_in" },
  { id: "9", roomId: "1", guest: "Tom Harris", checkIn: "2026-04-06", checkOut: "2026-04-09", status: "confirmed" },
  { id: "10", roomId: "9", guest: "Grace Park", checkIn: "2026-04-04", checkOut: "2026-04-08", status: "confirmed" },
  { id: "11", roomId: "11", guest: "Kevin Nguyen", checkIn: "2026-04-02", checkOut: "2026-04-06", status: "checked_in" },
  { id: "12", roomId: "14", guest: "Sofia Martinez", checkIn: "2026-04-01", checkOut: "2026-04-05", status: "checked_in" },
  { id: "13", roomId: "6", guest: "Alex Turner", checkIn: "2026-04-08", checkOut: "2026-04-11", status: "pending" },
  { id: "14", roomId: "4", guest: "Rachel Adams", checkIn: "2026-04-05", checkOut: "2026-04-08", status: "confirmed" },
];

const statusColors: Record<string, string> = {
  pending: "bg-warning/80 border-warning",
  confirmed: "bg-info/80 border-info",
  checked_in: "bg-primary/80 border-primary",
  checked_out: "bg-muted border-muted-foreground/30",
  cancelled: "bg-destructive/30 border-destructive",
};

const statusTextColors: Record<string, string> = {
  pending: "text-warning-foreground",
  confirmed: "text-info-foreground",
  checked_in: "text-primary-foreground",
  checked_out: "text-muted-foreground",
  cancelled: "text-destructive-foreground",
};

function getDatesInRange(start: Date, numDays: number): Date[] {
  const dates: Date[] = [];
  for (let i = 0; i < numDays; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    dates.push(d);
  }
  return dates;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

export default function BookingCalendar() {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(2026, 3, 1); // April 1, 2026
    return d;
  });

  const numDays = 14;
  const dates = getDatesInRange(startDate, numDays);
  const cellWidth = 80;

  const navigate = (dir: number) => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + dir * 7);
    setStartDate(d);
  };

  const today = new Date(2026, 3, 5); // Mock today

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      {/* Header controls */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-foreground min-w-[180px] text-center">
            {dates[0].toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </span>
          <button onClick={() => navigate(1)} className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {[
            { label: "Pending", cls: "bg-warning/80" },
            { label: "Confirmed", cls: "bg-info/80" },
            { label: "Checked In", cls: "bg-primary/80" },
            { label: "Checked Out", cls: "bg-muted" },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-1.5">
              <span className={cn("w-3 h-3 rounded-sm", s.cls)} />
              <span className="text-muted-foreground">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-max">
          {/* Date header */}
          <div className="flex border-b border-border">
            <div className="w-[120px] shrink-0 px-3 py-2 bg-muted/50 border-r border-border">
              <span className="text-xs font-medium text-muted-foreground">Room</span>
            </div>
            {dates.map((d) => {
              const isToday = formatDate(d) === formatDate(today);
              const isWeekend = d.getDay() === 0 || d.getDay() === 6;
              return (
                <div
                  key={formatDate(d)}
                  style={{ width: cellWidth }}
                  className={cn(
                    "shrink-0 px-1 py-2 text-center border-r border-border",
                    isToday && "bg-primary/10",
                    isWeekend && !isToday && "bg-muted/30"
                  )}
                >
                  <p className={cn("text-xs font-medium", isToday ? "text-primary" : "text-muted-foreground")}>
                    {d.toLocaleDateString("en-US", { weekday: "short" })}
                  </p>
                  <p className={cn("text-sm font-semibold", isToday ? "text-primary" : "text-foreground")}>
                    {d.getDate()}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Room rows */}
          {rooms.map((room) => {
            const roomBookings = bookings.filter((b) => b.roomId === room.id);

            return (
              <div key={room.id} className="flex border-b border-border last:border-0 relative" style={{ height: 44 }}>
                <div className="w-[120px] shrink-0 px-3 flex items-center border-r border-border bg-muted/30">
                  <div>
                    <span className="text-sm font-semibold text-foreground">{room.number}</span>
                    <span className="text-xs text-muted-foreground ml-1.5">{room.type}</span>
                  </div>
                </div>
                <div className="relative flex-1" style={{ width: numDays * cellWidth }}>
                  {/* Grid lines */}
                  {dates.map((d) => {
                    const isToday = formatDate(d) === formatDate(today);
                    const idx = dates.indexOf(d);
                    return (
                      <div
                        key={formatDate(d)}
                        className={cn(
                          "absolute top-0 bottom-0 border-r border-border",
                          isToday && "bg-primary/5"
                        )}
                        style={{ left: idx * cellWidth, width: cellWidth }}
                      />
                    );
                  })}

                  {/* Booking bars */}
                  {roomBookings.map((booking) => {
                    const bStart = new Date(booking.checkIn);
                    const bEnd = new Date(booking.checkOut);
                    const rangeStart = dates[0];
                    const rangeEnd = dates[dates.length - 1];

                    // Skip bookings entirely outside range
                    if (bEnd <= rangeStart || bStart > rangeEnd) return null;

                    const startOffset = Math.max(0, daysBetween(rangeStart, bStart));
                    const endOffset = Math.min(numDays, daysBetween(rangeStart, bEnd));
                    const barWidth = (endOffset - startOffset) * cellWidth;

                    if (barWidth <= 0) return null;

                    return (
                      <Link
                        key={booking.id}
                        to={`/bookings/${booking.id}`}
                        className={cn(
                          "absolute top-1 bottom-1 rounded-md border flex items-center px-2 cursor-pointer hover:opacity-90 transition-opacity z-10",
                          statusColors[booking.status]
                        )}
                        style={{
                          left: startOffset * cellWidth + 2,
                          width: barWidth - 4,
                        }}
                        title={`${booking.guest} — ${booking.checkIn} to ${booking.checkOut}`}
                      >
                        <span className={cn("text-xs font-medium truncate", statusTextColors[booking.status])}>
                          {booking.guest}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
