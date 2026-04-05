import { CalendarPlus, LogIn, LogOut, DollarSign, TrendingUp, TrendingDown } from "lucide-react";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/shared/PageTransition";

const stats = [
  { label: "New Bookings", value: "840", change: "+8.70%", trend: "up" as const, icon: CalendarPlus },
  { label: "Check-In", value: "231", change: "+3.56%", trend: "up" as const, icon: LogIn },
  { label: "Check-Out", value: "124", change: "-1.06%", trend: "down" as const, icon: LogOut },
  { label: "Total Revenue", value: "$123,980", change: "+5.70%", trend: "up" as const, icon: DollarSign },
];

export default function StatCards() {
  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
      {stats.map((stat) => (
        <motion.div
          key={stat.label}
          variants={staggerItem}
          whileHover={{ scale: 1.02, y: -2 }}
          className="bg-secondary rounded-xl p-4 md:p-5 flex flex-col gap-2 md:gap-3 cursor-default"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs md:text-sm font-medium text-secondary-foreground/70">{stat.label}</span>
            <stat.icon className="w-4 h-4 md:w-5 md:h-5 text-secondary-foreground/50" />
          </div>
          <span className="text-2xl md:text-3xl font-bold text-secondary-foreground">{stat.value}</span>
          <div className="flex items-center gap-1.5">
            {stat.trend === "up" ? (
              <TrendingUp className="w-4 h-4 text-success" />
            ) : (
              <TrendingDown className="w-4 h-4 text-destructive" />
            )}
            <span className={`text-xs font-semibold ${stat.trend === "up" ? "text-success" : "text-destructive"}`}>
              {stat.change}
            </span>
            <span className="text-xs text-muted-foreground hidden sm:inline">from last week</span>
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}
