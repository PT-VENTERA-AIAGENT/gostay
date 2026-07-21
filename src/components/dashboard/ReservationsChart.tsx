import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { motion } from "framer-motion";
import { useT } from "@/lib/i18n";
import { staggerItem } from "@/components/shared/PageTransition";
import type { ReservationPoint } from "@/services/analyticsService";

export default function ReservationsChart({ data }: { data: ReservationPoint[] }) {
  const t = useT();
  return (
    <motion.div
      variants={staggerItem}
      initial="hidden"
      animate="show"
      className="bg-card rounded-xl p-5 border border-border card-hover"
    >
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="font-semibold text-foreground min-w-0 truncate">{t("Reservations")}</h3>
        <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">{t("Last 7 days")}</span>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(45, 15%, 88%)" />
          <XAxis dataKey="day" tick={{ fontSize: 11, fill: "hsl(220, 10%, 46%)" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "hsl(220, 10%, 46%)" }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip contentStyle={{ borderRadius: "0.5rem", border: "1px solid hsl(45, 15%, 88%)", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)" }} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="booked" name={t("Booked")} fill="hsl(72, 45%, 45%)" radius={[4, 4, 0, 0]} animationDuration={1000} />
          <Bar dataKey="cancelled" name={t("Cancelled")} fill="hsl(72, 40%, 85%)" radius={[4, 4, 0, 0]} animationDuration={1000} />
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
