import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { motion } from "framer-motion";
import { useT } from "@/lib/i18n";
import { staggerItem } from "@/components/shared/PageTransition";
import { useAnimatedCounter } from "@/hooks/use-animated-counter";
import type { MonthlyPoint } from "@/services/analyticsService";

function formatIDR(n: number) {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(2)} M`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)} jt`;
  return `Rp ${n.toLocaleString("id-ID")}`;
}

function AnimatedRevenue({ total }: { total: number }) {
  const val = useAnimatedCounter(total);
  return <span>{formatIDR(val)}</span>;
}

export default function RevenueChart({ monthly }: { monthly: MonthlyPoint[] }) {
  const t = useT();
  const total = monthly.reduce((sum, m) => sum + m.revenue, 0);

  return (
    <motion.div
      variants={staggerItem}
      initial="hidden"
      animate="show"
      className="bg-card rounded-xl p-5 border border-border card-hover"
    >
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="font-semibold text-foreground">{t("Revenue")}</h3>
        <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">{t("Last 6 months")}</span>
      </div>

      <div className="mb-2">
        <span className="text-xs text-muted-foreground">{t("Total Revenue")}</span>
        <p className="text-2xl font-bold text-foreground tabular-nums"><AnimatedRevenue total={total} /></p>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={monthly}>
          <defs>
            <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(72, 45%, 45%)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="hsl(72, 45%, 45%)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(45, 15%, 88%)" />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(220, 10%, 46%)" }} axisLine={false} tickLine={false} />
          <YAxis
            tick={{ fontSize: 11, fill: "hsl(220, 10%, 46%)" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}jt`}
          />
          <Tooltip
            formatter={(v: number) => [formatIDR(v), t("Revenue")]}
            contentStyle={{ borderRadius: "0.5rem", border: "1px solid hsl(45, 15%, 88%)", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)" }}
          />
          <Area type="monotone" dataKey="revenue" stroke="hsl(72, 45%, 45%)" strokeWidth={2.5} fill="url(#revGrad)" animationDuration={1200} />
        </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
