import { MoreHorizontal } from "lucide-react";
import { motion } from "framer-motion";
import { staggerItem } from "@/components/shared/PageTransition";
import { useAnimatedCounter } from "@/hooks/use-animated-counter";

const rooms = [
  { label: "Occupied", value: 286, color: "bg-primary" },
  { label: "Reserved", value: 87, color: "bg-chart-yellow" },
  { label: "Available", value: 32, color: "bg-success" },
  { label: "Not Ready", value: 13, color: "bg-destructive" },
];

const total = rooms.reduce((a, b) => a + b.value, 0);

function AnimatedValue({ value }: { value: number }) {
  const animated = useAnimatedCounter(value);
  return <span>{animated}</span>;
}

export default function RoomAvailability() {
  return (
    <motion.div
      variants={staggerItem}
      initial="hidden"
      animate="show"
      className="bg-card rounded-xl p-5 border border-border card-hover"
    >
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-semibold text-foreground">Room Availability</h3>
        <button className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors" title="More options">
          <MoreHorizontal className="w-5 h-5" />
        </button>
      </div>

      <div className="flex rounded-lg overflow-hidden h-8 mb-5">
        {rooms.map((r) => (
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
        {rooms.map((r) => (
          <div key={r.label} className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-sm ${r.color}`} />
            <span className="text-xs text-muted-foreground">{r.label}</span>
            <span className="text-sm font-bold text-foreground ml-auto tabular-nums">
              <AnimatedValue value={r.value} />
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
