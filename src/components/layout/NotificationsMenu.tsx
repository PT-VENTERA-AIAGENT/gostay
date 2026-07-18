import { Bell, CalendarClock, LogIn, PhoneCall, CheckCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useBookings, useTodayArrivals } from "@/hooks/useBookings";
import { getPendingFollowUps } from "@/services/callLogService";

/**
 * A real, data-backed notification feed — no invented items. It surfaces the
 * things staff actually need to act on: bookings awaiting confirmation, guests
 * arriving today, and calls flagged for follow-up. The badge counts them; an
 * empty feed shows nothing to do.
 */
export default function NotificationsMenu() {
  const navigate = useNavigate();

  const { data: pending } = useBookings({ status: "pending", pageSize: 5 });
  const { data: arrivals = [] } = useTodayArrivals();
  const { data: followUps = [] } = useQuery({
    queryKey: ["notifications", "follow-ups"],
    queryFn: getPendingFollowUps,
  });

  const pendingBookings = pending?.data ?? [];
  const total = pendingBookings.length + arrivals.length + followUps.length;

  const go = (path: string) => navigate(path);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="relative w-9 h-9 md:w-10 md:h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:bg-accent transition-colors btn-press" aria-label="Notifikasi">
          <Bell className="w-5 h-5" />
          {total > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full border-2 border-card flex items-center justify-center">
              {total > 9 ? "9+" : total}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Notifikasi</p>
          {total > 0 && <span className="text-xs text-muted-foreground">{total} perlu tindakan</span>}
        </div>

        <div className="max-h-[360px] overflow-y-auto">
          {total === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
              <CheckCheck className="w-6 h-6 text-success" />
              Semua beres. Tidak ada yang perlu ditindak.
            </div>
          )}

          {pendingBookings.map((b) => (
            <button key={b.id} onClick={() => go(`/bookings/${b.id}`)} className="w-full text-left px-4 py-3 hover:bg-muted transition-colors border-b border-border flex gap-3">
              <CalendarClock className="w-4 h-4 text-warning shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">Booking menunggu konfirmasi</p>
                <p className="text-xs text-muted-foreground truncate">{b.reference} · {b.customers?.full_name}</p>
              </div>
            </button>
          ))}

          {arrivals.map((b) => (
            <button key={`arr-${b.id}`} onClick={() => go(`/bookings/${b.id}`)} className="w-full text-left px-4 py-3 hover:bg-muted transition-colors border-b border-border flex gap-3">
              <LogIn className="w-4 h-4 text-info shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">Check-in hari ini</p>
                <p className="text-xs text-muted-foreground truncate">{b.reference} · {b.customers?.full_name}</p>
              </div>
            </button>
          ))}

          {followUps.map((c) => (
            <button key={`fu-${c.id}`} onClick={() => go(`/calls`)} className="w-full text-left px-4 py-3 hover:bg-muted transition-colors border-b border-border flex gap-3">
              <PhoneCall className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">Follow-up telepon</p>
                <p className="text-xs text-muted-foreground truncate">{c.caller_phone}{c.follow_up_due ? ` · jatuh tempo ${c.follow_up_due}` : ""}</p>
              </div>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
