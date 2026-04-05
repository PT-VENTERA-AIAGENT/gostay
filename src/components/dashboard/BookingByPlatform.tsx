import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { MoreHorizontal } from "lucide-react";
import { motion } from "framer-motion";
import { staggerItem } from "@/components/shared/PageTransition";

const data = [
  { name: "Direct Booking", value: 61, color: "hsl(72, 45%, 45%)" },
  { name: "Booking.com", value: 12, color: "hsl(72, 40%, 65%)" },
  { name: "Agoda", value: 11, color: "hsl(72, 35%, 78%)" },
  { name: "Airbnb", value: 9, color: "hsl(48, 90%, 55%)" },
  { name: "Hotels.com", value: 5, color: "hsl(45, 15%, 80%)" },
  { name: "Others", value: 2, color: "hsl(45, 10%, 90%)" },
];

export default function BookingByPlatform() {
  return (
    <motion.div
      variants={staggerItem}
      initial="hidden"
      animate="show"
      className="bg-card rounded-xl p-5 border border-border card-hover"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground">Booking by Platform</h3>
        <button className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors" title="More options">
          <MoreHorizontal className="w-5 h-5" />
        </button>
      </div>

      <div className="flex items-center gap-4">
        <ResponsiveContainer width={140} height={140}>
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" strokeWidth={0} animationDuration={1000}>
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip formatter={(v: number) => `${v}%`} contentStyle={{ borderRadius: "0.5rem", border: "1px solid hsl(45, 15%, 88%)" }} />
          </PieChart>
        </ResponsiveContainer>

        <div className="flex flex-col gap-2">
          {data.map((d) => (
            <div key={d.name} className="flex items-center gap-2 text-xs group cursor-default">
              <span className="w-2.5 h-2.5 rounded-full shrink-0 group-hover:scale-125 transition-transform" style={{ backgroundColor: d.color }} />
              <span className="text-muted-foreground tabular-nums">{d.value}%</span>
              <span className="text-foreground font-medium group-hover:text-primary transition-colors">{d.name}</span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
