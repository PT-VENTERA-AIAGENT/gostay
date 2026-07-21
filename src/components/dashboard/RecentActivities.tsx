import { CalendarPlus, CheckCircle2, LogIn, LogOut, XCircle, Pencil, Loader2, Activity } from "lucide-react";
import { motion } from "framer-motion";
import { useT } from "@/lib/i18n";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { staggerContainer, staggerItem } from "@/components/shared/PageTransition";
import { getRecentActivity, type ActivityEntry } from "@/services/bookingService";

// booking_audit_log.action is free text written by bookingService; anything
// unrecognised still renders, just with the generic icon.
const actionMeta: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  created: { label: "Booking Created", icon: CalendarPlus, color: "text-info" },
  confirmed: { label: "Booking Confirmed", icon: CheckCircle2, color: "text-success" },
  checked_in: { label: "Guest Checked In", icon: LogIn, color: "text-primary" },
  checked_out: { label: "Guest Checked Out", icon: LogOut, color: "text-primary" },
  cancelled: { label: "Booking Cancelled", icon: XCircle, color: "text-destructive" },
  no_show: { label: "Marked No-Show", icon: XCircle, color: "text-destructive" },
  updated: { label: "Booking Updated", icon: Pencil, color: "text-warning" },
};

function metaFor(action: string) {
  return (
    actionMeta[action] ?? {
      label: action.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
      icon: Activity,
      color: "text-muted-foreground",
    }
  );
}

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return new Date(iso).toLocaleDateString("en", { day: "numeric", month: "short" });
}

function describe(a: ActivityEntry) {
  const ref = a.bookings?.reference;
  const room = a.bookings?.rooms?.number;
  const who = a.profiles?.full_name;
  const parts = [
    ref ? `Booking ${ref}` : null,
    room ? `Room ${room}` : null,
    who ? `by ${who}` : null,
  ].filter(Boolean);
  return a.note ? `${parts.join(" · ")}${parts.length ? " — " : ""}${a.note}` : parts.join(" · ");
}

export default function RecentActivities() {
  const t = useT();
  const { data, isLoading, error } = useQuery({
    queryKey: ["recent-activity"],
    queryFn: () => getRecentActivity(6),
  });

  const activities = data ?? [];

  return (
    <div className="bg-card rounded-xl p-5 border border-border">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground">{t("Recent Activities")}</h3>
        <Link to="/bookings" className="text-xs text-primary font-medium hover:underline px-2 py-1 rounded hover:bg-primary/5 transition-colors">
          {t("View All")}
        </Link>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <p className="text-xs text-destructive py-6 text-center">Could not load activity.</p>
      ) : activities.length === 0 ? (
        <p className="text-xs text-muted-foreground py-6 text-center">No booking activity yet.</p>
      ) : (
        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-4">
          {activities.map((a) => {
            const meta = metaFor(a.action);
            return (
              <motion.div key={a.id} variants={staggerItem} className="flex gap-3 group">
                <div className={`w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 ${meta.color} group-hover:scale-105 transition-transform`}>
                  <meta.icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground">{timeAgo(a.created_at)}</p>
                  <p className="text-xs font-semibold text-foreground">{t(meta.label)}</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5 break-words">{describe(a)}</p>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
