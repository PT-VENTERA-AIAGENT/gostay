import { CalendarPlus, LogIn, LogOut, DollarSign, TrendingUp, TrendingDown } from "lucide-react";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/shared/PageTransition";
import { useAnimatedCounter } from "@/hooks/use-animated-counter";
import type { AnalyticsData } from "@/services/analyticsService";

type Stat = {
  label: string;
  value: number;
  format: (n: number) => string;
  /** Percent change, or null when there is no honest comparison to draw. */
  delta: number | null;
  icon: React.ElementType;
};

function formatIDR(n: number) {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(2)}M`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)}jt`;
  if (n >= 1_000) return `Rp ${(n / 1_000).toFixed(0)}rb`;
  return `Rp ${Math.round(n)}`;
}

function AnimatedStat({ value, format }: { value: number; format: (n: number) => string }) {
  const animated = useAnimatedCounter(value);
  return <span>{format(animated)}</span>;
}

export default function StatCards({ data }: { data: AnalyticsData }) {
  const stats: Stat[] = [
    {
      label: "New Bookings",
      value: data.quickStats.bookingsCreatedToday,
      format: String,
      delta: null,
      icon: CalendarPlus,
    },
    { label: "Check-In", value: data.arrivalsToday.length, format: String, delta: null, icon: LogIn },
    { label: "Check-Out", value: data.departuresToday.length, format: String, delta: null, icon: LogOut },
    {
      label: "Revenue (Month)",
      value: Math.round(data.summary.revenueMonth),
      format: formatIDR,
      delta: data.summary.revenueMonthDelta,
      icon: DollarSign,
    },
  ];

  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
      {stats.map((stat) => (
        <motion.div
          key={stat.label}
          variants={staggerItem}
          whileHover={{ scale: 1.02, y: -2 }}
          whileTap={{ scale: 0.98 }}
          className="bg-secondary rounded-xl p-4 md:p-5 flex flex-col gap-2 md:gap-3 cursor-default card-hover"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs md:text-sm font-medium text-secondary-foreground/70">{stat.label}</span>
            <div className="w-8 h-8 rounded-lg bg-secondary-foreground/5 flex items-center justify-center">
              <stat.icon className="w-4 h-4 md:w-5 md:h-5 text-secondary-foreground/50" />
            </div>
          </div>
          <span className="text-2xl md:text-3xl font-bold text-secondary-foreground tabular-nums">
            <AnimatedStat value={stat.value} format={stat.format} />
          </span>
          {/* Today's counts have no comparable prior figure, so they carry no
              trend rather than an invented one. */}
          {stat.delta !== null && (
            <div className="flex items-center gap-1.5">
              {stat.delta >= 0 ? (
                <TrendingUp className="w-4 h-4 text-success" />
              ) : (
                <TrendingDown className="w-4 h-4 text-destructive" />
              )}
              <span className={`text-xs font-semibold ${stat.delta >= 0 ? "text-success" : "text-destructive"}`}>
                {stat.delta >= 0 ? "+" : ""}{stat.delta.toFixed(1)}%
              </span>
              <span className="text-xs text-muted-foreground hidden sm:inline">vs last month</span>
            </div>
          )}
        </motion.div>
      ))}
    </motion.div>
  );
}
