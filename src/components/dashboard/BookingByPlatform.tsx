import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { motion } from "framer-motion";
import { staggerItem } from "@/components/shared/PageTransition";
import type { SourcePoint } from "@/services/analyticsService";

// The schema's booking_source enum is portal | phone | walk_in | staff. The
// mockup this replaces showed Booking.com, Agoda and Airbnb — OTA channels the
// system has no integration with (channel manager is v2.0, PRD §1.4).
const SOURCE_LABELS: Record<string, string> = {
  portal: "Direct (Portal)",
  phone: "Phone",
  walk_in: "Walk-in",
  staff: "Staff",
};

const COLORS = [
  "hsl(72, 45%, 45%)",
  "hsl(72, 40%, 65%)",
  "hsl(48, 90%, 55%)",
  "hsl(45, 15%, 80%)",
];

export default function BookingByPlatform({ bySource }: { bySource: SourcePoint[] }) {
  const total = bySource.reduce((sum, s) => sum + s.count, 0);
  const data = bySource.map((s, i) => ({
    name: SOURCE_LABELS[s.source] ?? s.source,
    value: s.count,
    pct: total > 0 ? Math.round((s.count / total) * 100) : 0,
    color: COLORS[i % COLORS.length],
  }));

  return (
    <motion.div
      variants={staggerItem}
      initial="hidden"
      animate="show"
      className="bg-card rounded-xl p-5 border border-border card-hover"
    >
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="font-semibold text-foreground min-w-0 truncate">Booking by Source</h3>
        <span className="text-xs text-muted-foreground tabular-nums shrink-0 whitespace-nowrap">{total} bookings</span>
      </div>

      {total === 0 ? (
        <p className="text-xs text-muted-foreground py-12 text-center">No bookings in this period.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-4">
          <ResponsiveContainer width={140} height={140}>
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" strokeWidth={0} animationDuration={1000}>
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => `${v} bookings`} contentStyle={{ borderRadius: "0.5rem", border: "1px solid hsl(45, 15%, 88%)" }} />
            </PieChart>
          </ResponsiveContainer>

          <div className="flex flex-col gap-2">
            {data.map((d) => (
              <div key={d.name} className="flex items-center gap-2 text-xs group cursor-default">
                <span className="w-2.5 h-2.5 rounded-full shrink-0 group-hover:scale-125 transition-transform" style={{ backgroundColor: d.color }} />
                <span className="text-muted-foreground tabular-nums">{d.pct}%</span>
                <span className="text-foreground font-medium group-hover:text-primary transition-colors">{d.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
