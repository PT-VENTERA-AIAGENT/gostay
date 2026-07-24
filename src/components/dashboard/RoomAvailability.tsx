import { motion } from "framer-motion";
import { BedDouble } from "lucide-react";
import { useT } from "@/lib/i18n";
import { staggerItem } from "@/components/shared/PageTransition";
import { useAnimatedCounter } from "@/hooks/use-animated-counter";
import { countRoomStatuses } from "@/lib/roomStatus";
import type { RoomWithType } from "@/types/database.types";

function AnimatedValue({ value }: { value: number }) {
  const animated = useAnimatedCounter(value);
  return <span>{animated}</span>;
}

export default function RoomAvailability({ rooms }: { rooms: RoomWithType[] }) {
  const t = useT();
  // `rooms` has no status column — status is derived from each room's live
  // booking. "Occupied" means a guest is in it; "Reserved" is confirmed but not
  // yet arrived; "Not Ready" is a deactivated room.
  const counts = countRoomStatuses(rooms);
  const segments = [
    { label: "Occupied", value: counts.checked_in, color: "bg-primary" },
    { label: "Reserved", value: counts.reserved, color: "bg-chart-yellow" },
    { label: "Available", value: counts.available, color: "bg-success" },
    { label: "Not Ready", value: counts.out_of_service, color: "bg-destructive" },
  ];
  const total = counts.total;

  return (
    <motion.div
      variants={staggerItem}
      initial="hidden"
      animate="show"
      className="bg-card rounded-xl p-5 border border-border card-hover h-full flex flex-col"
    >
      <div className="flex items-center justify-between gap-3 mb-5">
        <h3 className="font-semibold text-foreground min-w-0 truncate">{t("Room Availability")}</h3>
        <span className="text-xs text-muted-foreground tabular-nums shrink-0 whitespace-nowrap">{total} {t("rooms")}</span>
      </div>

      {total === 0 ? (
        // Center the empty state in the card's full height so the whitespace
        // reads as intentional — the card stretches to match the taller Revenue
        // chart beside it, and a top-aligned one-liner left an ugly gap below.
        <div className="flex-1 flex flex-col items-center justify-center gap-2 py-6 text-center">
          <div className="w-11 h-11 rounded-full bg-muted flex items-center justify-center">
            <BedDouble className="w-5 h-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">{t("No rooms configured yet.")}</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-center">
          <div className="flex rounded-lg overflow-hidden h-8 mb-5 bg-muted">
            {segments.map((r) => (
              <motion.div
                key={r.label}
                initial={{ width: 0 }}
                animate={{ width: `${(r.value / total) * 100}%` }}
                transition={{ duration: 0.8, delay: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                className={`${r.color} transition-all`}
              />
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
            {segments.map((r) => (
              <div key={r.label} className="flex items-center gap-2">
                <span className={`w-3 h-3 rounded-sm ${r.color}`} />
                <span className="text-xs text-muted-foreground truncate">{t(r.label)}</span>
                <span className="text-sm font-bold text-foreground ml-auto tabular-nums shrink-0 pl-2">
                  <AnimatedValue value={r.value} />
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
