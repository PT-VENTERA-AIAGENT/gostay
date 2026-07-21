import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useRooms } from "@/hooks/useRooms";
import { useBookingsInRange } from "@/hooks/useBookings";

const statusColors: Record<string, string> = {
  pending: "bg-warning/80 border-warning",
  confirmed: "bg-info/80 border-info",
  checked_in: "bg-primary/80 border-primary",
  checked_out: "bg-muted border-muted-foreground/30",
  cancelled: "bg-destructive/30 border-destructive",
  no_show: "bg-destructive/30 border-destructive",
};

const statusTextColors: Record<string, string> = {
  pending: "text-warning-foreground",
  confirmed: "text-info-foreground",
  checked_in: "text-primary-foreground",
  checked_out: "text-muted-foreground",
  cancelled: "text-destructive-foreground",
  no_show: "text-destructive-foreground",
};

// A cancelled or no-show booking is not occupying the room, so drawing a bar
// for it would misreport the night as taken.
const OCCUPYING = new Set(["pending", "confirmed", "checked_in", "checked_out"]);

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

/**
 * Local calendar date, not UTC.
 *
 * toISOString() converts to UTC first, so east of Greenwich every date before
 * ~07:00 local lands on the previous day — the "today" column would highlight
 * yesterday for a hotel in WIB for most of the morning.
 */
function formatDate(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Parses a date-only column ('2026-04-01') as local midnight, to match. */
function parseDateOnly(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export default function BookingCalendar() {
  // Opens on the current week rather than a pinned date: this was `new Date(2026, 3, 1)`
  // with a matching `const today = new Date(2026, 3, 5) // Mock today`, so the
  // grid always showed April 2026 no matter when it was opened.
  const [startDate, setStartDate] = useState(startOfToday);

  const numDays = 14;
  const dates = useMemo(() => getDatesInRange(startDate, numDays), [startDate]);
  const cellWidth = 80;
  const today = startOfToday();

  // The window the grid draws. rangeEnd is exclusive — one day past the last
  // visible column, so a stay starting on that column still counts.
  const rangeStart = formatDate(dates[0]);
  const rangeEnd = useMemo(() => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + numDays);
    return formatDate(d);
  }, [startDate]);

  const { data: rooms, isLoading: roomsLoading } = useRooms();
  const { data: bookings, isLoading: bookingsLoading } = useBookingsInRange(rangeStart, rangeEnd);

  const navigate = (dir: number) => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + dir * 7);
    setStartDate(d);
  };

  const byRoom = useMemo(() => {
    const map = new Map<string, typeof bookings>();
    for (const b of bookings ?? []) {
      if (!OCCUPYING.has(b.status)) continue;
      const list = map.get(b.room_id) ?? [];
      list.push(b);
      map.set(b.room_id, list);
    }
    return map;
  }, [bookings]);

  const sortedRooms = useMemo(
    () => [...(rooms ?? [])].sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true })),
    [rooms],
  );

  if (roomsLoading || bookingsLoading) {
    return (
      <div className="bg-card rounded-xl border border-border p-12 flex items-center justify-center text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading calendar…
      </div>
    );
  }

  if (sortedRooms.length === 0) {
    return (
      <div className="bg-card rounded-xl border border-border p-12 text-center">
        <p className="text-sm font-medium text-foreground mb-1">No rooms yet</p>
        <p className="text-xs text-muted-foreground">Add rooms before the calendar can show anything.</p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(-1)} aria-label="Previous week" className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-foreground min-w-[180px] text-center">
            {dates[0].toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </span>
          <button onClick={() => navigate(1)} aria-label="Next week" className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button onClick={() => setStartDate(startOfToday())} className="text-xs text-primary font-medium hover:underline ml-1">
            Today
          </button>
        </div>
        <div className="flex items-center gap-3 text-xs flex-wrap">
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
                    isWeekend && !isToday && "bg-muted/30",
                  )}
                >
                  <p className={cn("text-xs font-medium", isToday ? "text-primary" : "text-muted-foreground")}>
                    {d.toLocaleDateString("en-US", { weekday: "short" })}
                  </p>
                  <p className={cn("text-sm font-semibold", isToday ? "text-primary" : "text-foreground")}>{d.getDate()}</p>
                </div>
              );
            })}
          </div>

          {sortedRooms.map((room) => {
            const roomBookings = byRoom.get(room.id) ?? [];

            return (
              <div key={room.id} className="flex border-b border-border last:border-0 relative" style={{ height: 44 }}>
                <div className="w-[120px] shrink-0 px-3 flex items-center border-r border-border bg-muted/30">
                  <div className="truncate">
                    <span className="text-sm font-semibold text-foreground">{room.number}</span>
                    <span className="text-xs text-muted-foreground ml-1.5">{room.room_types?.name}</span>
                  </div>
                </div>
                <div className="relative flex-1" style={{ width: numDays * cellWidth }}>
                  {dates.map((d, idx) => {
                    const isToday = formatDate(d) === formatDate(today);
                    return (
                      <div
                        key={formatDate(d)}
                        className={cn("absolute top-0 bottom-0 border-r border-border", isToday && "bg-primary/5")}
                        style={{ left: idx * cellWidth, width: cellWidth }}
                      />
                    );
                  })}

                  {roomBookings.map((booking) => {
                    const bStart = parseDateOnly(booking.check_in);
                    const bEnd = parseDateOnly(booking.check_out);
                    const rangeStart = dates[0];
                    const rangeEnd = dates[dates.length - 1];

                    if (bEnd <= rangeStart || bStart > rangeEnd) return null;

                    const startOffset = Math.max(0, daysBetween(rangeStart, bStart));
                    const endOffset = Math.min(numDays, daysBetween(rangeStart, bEnd));
                    const barWidth = (endOffset - startOffset) * cellWidth;

                    if (barWidth <= 0) return null;

                    const guest = booking.customers?.full_name ?? "Guest";

                    return (
                      <Link
                        key={booking.id}
                        to={`/bookings/${booking.id}`}
                        className={cn(
                          "absolute top-1 bottom-1 rounded-md border flex items-center px-2 cursor-pointer hover:opacity-90 transition-opacity z-10",
                          statusColors[booking.status],
                        )}
                        style={{ left: startOffset * cellWidth + 2, width: barWidth - 4 }}
                        title={`${guest} — ${booking.check_in} to ${booking.check_out} (${booking.reference})`}
                      >
                        <span className={cn("text-xs font-medium truncate", statusTextColors[booking.status])}>{guest}</span>
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
