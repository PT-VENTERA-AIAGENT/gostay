import { MoreHorizontal } from "lucide-react";
import { motion } from "framer-motion";
import { staggerItem } from "@/components/shared/PageTransition";

const categories = [
  { label: "Facilities", score: 4.4 },
  { label: "Cleanliness", score: 4.7 },
  { label: "Services", score: 4.6 },
  { label: "Comfort", score: 4.8 },
  { label: "Location", score: 4.5 },
];

export default function OverallRating() {
  return (
    <div className="bg-card rounded-xl p-5 border border-border card-hover">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground">Overall Rating</h3>
        <button className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors" title="More options">
          <MoreHorizontal className="w-5 h-5" />
        </button>
      </div>

      <div className="flex items-center gap-3 mb-5">
        <span className="text-4xl font-bold text-foreground tabular-nums">4.6</span>
        <div>
          <p className="text-sm font-semibold text-foreground">/5 &nbsp;Impressive</p>
          <p className="text-xs text-muted-foreground">from 2,546 reviews</p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {categories.map((c, i) => (
          <div key={c.label} className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-20">{c.label}</span>
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-primary rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${(c.score / 5) * 100}%` }}
                transition={{ duration: 0.8, delay: 0.1 * i, ease: [0.25, 0.1, 0.25, 1] }}
              />
            </div>
            <span className="text-xs font-semibold text-foreground w-7 text-right tabular-nums">{c.score}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
