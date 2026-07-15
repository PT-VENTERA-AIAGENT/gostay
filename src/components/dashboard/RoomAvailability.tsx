import { motion } from "framer-motion";
import { staggerItem } from "@/components/shared/PageTransition";
import { useAnimatedCounter } from "@/hooks/use-animated-counter";
import { countRoomStatuses } from "@/lib/roomStatus";
import type { RoomWithType } from "@/types/database.types";

function AnimatedValue({ value }: { value: number }) {
  const animated = useAnimatedCounter(value);
  return <span>{animated}</span>;
}

export default function RoomAvailability({ rooms }: { rooms: RoomWithType[] }) {
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
      className="bg-card rounded-xl p-5 border border-border card-hover"
    >
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-semibold text-foreground">Room Availability</h3>
        <span className="text-xs text-muted-foreground tabular-nums">{total} rooms</span>
      </div>

      {total === 0 ? (
        <p className="text-xs text-muted-foreground py-8 text-center">No rooms configured yet.</p>
      ) : (
        <>
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

          <div className="grid grid-cols-2 gap-3">
            {segments.map((r) => (
              <div key={r.label} className="flex items-center gap-2">
                <span className={`w-3 h-3 rounded-sm ${r.color}`} />
                <span className="text-xs text-muted-foreground">{r.label}</span>
                <span className="text-sm font-bold text-foreground ml-auto tabular-nums">
                  <AnimatedValue value={r.value} />
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </motion.div>
  );
}
