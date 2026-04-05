import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { motion } from "framer-motion";
import { staggerItem } from "@/components/shared/PageTransition";
import { useAnimatedCounter } from "@/hooks/use-animated-counter";

const data = [
  { month: "Dec 2027", revenue: 180000 },
  { month: "Jan 2028", revenue: 240000 },
  { month: "Feb 2028", revenue: 280000 },
  { month: "Mar 2028", revenue: 315060 },
  { month: "Apr 2028", revenue: 290000 },
  { month: "May 2028", revenue: 270000 },
];

function AnimatedRevenue() {
  const val = useAnimatedCounter(315060);
  return <span>${val.toLocaleString()}</span>;
}

export default function RevenueChart() {
  return (
    <motion.div
      variants={staggerItem}
      initial="hidden"
      animate="show"
      className="bg-card rounded-xl p-5 border border-border card-hover"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground">Revenue</h3>
        <select className="text-sm bg-muted rounded-lg px-3 py-1.5 text-foreground border-none outline-none cursor-pointer hover:bg-accent transition-colors">
          <option>Last 6 Months</option>
          <option>Last 3 Months</option>
          <option>This Year</option>
        </select>
      </div>

      <div className="mb-2">
        <span className="text-xs text-muted-foreground">Total Revenue</span>
        <p className="text-2xl font-bold text-foreground tabular-nums"><AnimatedRevenue /></p>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(72, 45%, 45%)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="hsl(72, 45%, 45%)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(45, 15%, 88%)" />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'hsl(220, 10%, 46%)' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: 'hsl(220, 10%, 46%)' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v / 1000}K`} />
          <Tooltip
            formatter={(v: number) => [`$${v.toLocaleString()}`, "Revenue"]}
            contentStyle={{ borderRadius: "0.5rem", border: "1px solid hsl(45, 15%, 88%)", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)" }}
          />
          <Area type="monotone" dataKey="revenue" stroke="hsl(72, 45%, 45%)" strokeWidth={2.5} fill="url(#revGrad)" animationDuration={1200} />
        </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
