import { TrendingUp, TrendingDown, BedDouble, DollarSign, Download, LogIn, LogOut, MessageSquare, Phone, Flag, FileText, CalendarRange, Loader2 } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line, ComposedChart } from "recharts";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import PageTransition, { staggerContainer, staggerItem } from "@/components/shared/PageTransition";
import { exportCSV, exportPDF } from "@/components/analytics/ExportUtils";
import { useAnimatedCounter } from "@/hooks/use-animated-counter";
import { useAnalytics } from "@/hooks/useAnalytics";
import type { MovementRow } from "@/services/analyticsService";
import { useState } from "react";

const CHART_COLORS = [
  "hsl(72, 45%, 45%)",
  "hsl(210, 60%, 50%)",
  "hsl(48, 90%, 55%)",
  "hsl(145, 63%, 42%)",
  "hsl(0, 72%, 51%)",
  "hsl(280, 45%, 55%)",
];

const RANGES: Record<string, { label: string; days: number }> = {
  "7d": { label: "Last 7 Days", days: 7 },
  "30d": { label: "Last 30 Days", days: 30 },
  "90d": { label: "Last 90 Days", days: 90 },
  "365d": { label: "Last 12 Months", days: 365 },
};

function formatIDR(n: number) {
  if (n >= 1_000_000_000) return `IDR ${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `IDR ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `IDR ${(n / 1_000).toFixed(0)}K`;
  return `IDR ${Math.round(n)}`;
}

function shortDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

const statusCls: Record<string, string> = {
  pending: "badge-warning",
  confirmed: "badge-info",
  checked_in: "badge-primary",
  checked_out: "badge-info",
};

const tooltipStyle = { borderRadius: "0.5rem", border: "1px solid hsl(45, 15%, 88%)", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)" };

type KPI = {
  label: string;
  value: number;
  format: (n: number) => string;
  delta: number | null;
  icon: React.ElementType;
};

function AnimatedKPI({ value, format }: { value: number; format: (n: number) => string }) {
  const animated = useAnimatedCounter(Math.round(value));
  return <p className="text-lg md:text-xl font-bold text-foreground tabular-nums">{format(animated)}</p>;
}

function KpiCard({ kpi }: { kpi: KPI }) {
  return (
    <motion.div variants={staggerItem} whileHover={{ scale: 1.02, y: -2 }} className="bg-card rounded-xl border border-border p-3 md:p-4 card-hover">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">{kpi.label}</span>
        <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center">
          <kpi.icon className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
      </div>
      <AnimatedKPI value={kpi.value} format={kpi.format} />
      {/* A null delta means there was no honest comparison to draw — show
          nothing rather than a placeholder. */}
      {kpi.delta !== null && (
        <div className="flex items-center gap-1 mt-1">
          {kpi.delta >= 0 ? (
            <TrendingUp className="w-3 h-3 text-success" />
          ) : (
            <TrendingDown className="w-3 h-3 text-destructive" />
          )}
          <span className={cn("text-xs font-medium", kpi.delta >= 0 ? "text-success" : "text-destructive")}>
            {kpi.delta >= 0 ? "+" : ""}{kpi.delta.toFixed(1)}%
          </span>
          <span className="text-[10px] text-muted-foreground hidden lg:inline">vs prev</span>
        </div>
      )}
    </motion.div>
  );
}

function MovementList({ rows, empty }: { rows: MovementRow[]; empty: string }) {
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground py-4 text-center">{empty}</p>;
  }
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <motion.div
          key={`${r.room}-${i}`}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.08 }}
          className="flex items-center justify-between p-2.5 bg-muted rounded-lg hover:bg-accent transition-colors"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{r.guest}</p>
            <p className="text-xs text-muted-foreground">{r.room} · {r.roomType}</p>
          </div>
          <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full shrink-0", statusCls[r.status] ?? "badge-info")}>
            {r.status.replace("_", " ")}
          </span>
        </motion.div>
      ))}
    </div>
  );
}

export default function Analytics() {
  const [rangeKey, setRangeKey] = useState("30d");
  const rangeDays = RANGES[rangeKey].days;
  const { data, isLoading, error } = useAnalytics(rangeDays);

  const handleExportCSV = () => {
    if (!data) return;
    exportCSV(
      ["Month", "Revenue (IDR)", "Bookings"],
      data.monthlyRevenue.map((r) => [r.month, r.revenue, r.bookings]),
      "gostay-analytics.csv",
    );
  };

  if (isLoading) {
    return (
      <PageTransition>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </PageTransition>
    );
  }

  if (error || !data) {
    return (
      <PageTransition>
        <div className="p-4 md:p-6">
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
            <p className="text-sm text-destructive">
              Could not load analytics{error ? `: ${(error as Error).message}` : "."}
            </p>
          </div>
        </div>
      </PageTransition>
    );
  }

  const { summary, quickStats } = data;

  const kpis: KPI[] = [
    { label: "Occupancy Rate", value: summary.occupancyRate, format: (n) => `${n}%`, delta: summary.occupancyDelta, icon: BedDouble },
    { label: "Revenue (Today)", value: summary.revenueToday, format: formatIDR, delta: summary.revenueTodayDelta, icon: DollarSign },
    { label: "Revenue (Month)", value: summary.revenueMonth, format: formatIDR, delta: summary.revenueMonthDelta, icon: TrendingUp },
    { label: "Revenue (Year)", value: summary.revenueYear, format: formatIDR, delta: null, icon: DollarSign },
    { label: "ADR", value: summary.adr, format: formatIDR, delta: summary.adrDelta, icon: DollarSign },
    { label: "RevPAR", value: summary.revpar, format: formatIDR, delta: summary.revparDelta, icon: BedDouble },
  ];

  const sourceChart = data.bySource.map((s, i) => ({
    name: s.source.replace("_", " "),
    count: s.count,
    revenue: s.revenue,
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }));

  const roomTypeChart = data.revenueByRoomType.map((r, i) => ({
    ...r,
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }));

  const occupancyChart = data.occupancyTrend.map((p) => ({ ...p, label: shortDate(p.date) }));

  return (
    <PageTransition>
      <div className="p-4 md:p-6 space-y-4 md:space-y-6 print:p-0">
        {/* Print header */}
        <div className="hidden print:block mb-6">
          <h1 className="text-2xl font-bold">GoStay Hotel — Analytics Report</h1>
          <p className="text-sm text-muted-foreground">Generated: {new Date().toLocaleDateString()}</p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">Analytics &amp; Reports</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {summary.totalRooms} active rooms · {RANGES[rangeKey].label.toLowerCase()}
            </p>
          </div>
          <div className="flex items-center gap-2 md:gap-3 flex-wrap">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card text-sm">
              <CalendarRange className="w-4 h-4 text-muted-foreground" />
              <select
                value={rangeKey}
                onChange={(e) => setRangeKey(e.target.value)}
                aria-label="Date range"
                className="bg-transparent font-medium text-foreground focus:outline-none cursor-pointer"
              >
                {Object.entries(RANGES).map(([key, r]) => (
                  <option key={key} value={key}>{r.label}</option>
                ))}
              </select>
            </div>
            <button onClick={handleExportCSV} className="flex items-center gap-2 px-3 md:px-4 py-2 md:py-2.5 rounded-lg border border-border bg-card text-sm font-medium text-muted-foreground hover:bg-muted transition-colors btn-press">
              <Download className="w-4 h-4" /> CSV
            </button>
            <button onClick={exportPDF} className="flex items-center gap-2 px-3 md:px-4 py-2 md:py-2.5 rounded-lg border border-border bg-card text-sm font-medium text-muted-foreground hover:bg-muted transition-colors btn-press">
              <FileText className="w-4 h-4" /> PDF
            </button>
          </div>
        </div>

        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-4">
          {kpis.map((kpi) => <KpiCard key={kpi.label} kpi={kpi} />)}
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          <motion.div variants={staggerItem} initial="hidden" animate="show" className="bg-card rounded-xl border border-border p-4 md:p-5 card-hover">
            <h2 className="font-semibold text-foreground mb-4">Occupancy Trend</h2>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={occupancyChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(45, 15%, 88%)" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" minTickGap={24} />
                <YAxis tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" unit="%" />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="occupancy" stroke="hsl(72, 45%, 45%)" fill="hsl(72, 45%, 45%)" fillOpacity={0.2} name="Occupancy %" animationDuration={1000} />
              </AreaChart>
            </ResponsiveContainer>
          </motion.div>

          <motion.div variants={staggerItem} initial="hidden" animate="show" className="bg-card rounded-xl border border-border p-4 md:p-5 card-hover">
            <h2 className="font-semibold text-foreground mb-4">Revenue by Room Type</h2>
            {roomTypeChart.length === 0 ? (
              <p className="text-xs text-muted-foreground py-20 text-center">No revenue in this range.</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={roomTypeChart} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={3} dataKey="revenue" nameKey="name" animationDuration={1000}>
                    {roomTypeChart.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatIDR(v)} contentStyle={tooltipStyle} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </motion.div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 print:break-before-page">
          <div className="lg:col-span-2 bg-card rounded-xl border border-border p-4 md:p-5 card-hover">
            <h2 className="font-semibold text-foreground mb-4">Monthly Revenue &amp; Bookings</h2>
            <ResponsiveContainer width="100%" height={250}>
              <ComposedChart data={data.monthlyRevenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(45, 15%, 88%)" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
                <YAxis yAxisId="left" tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}M`} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number, name) => (name === "Revenue" ? formatIDR(v) : v)} />
                <Legend />
                <Bar yAxisId="left" dataKey="revenue" fill="hsl(72, 45%, 45%)" radius={[4, 4, 0, 0]} name="Revenue" animationDuration={1000} />
                <Line yAxisId="right" type="monotone" dataKey="bookings" stroke="hsl(210, 60%, 50%)" strokeWidth={2} name="Bookings" dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-card rounded-xl border border-border p-4 md:p-5 card-hover">
            <h2 className="font-semibold text-foreground mb-4">Booking Source</h2>
            {sourceChart.length === 0 ? (
              <p className="text-xs text-muted-foreground py-20 text-center">No bookings in this range.</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  {/* dataKey is "count", so recharts passes it through as `value`. */}
                  <Pie data={sourceChart} cx="50%" cy="50%" outerRadius={80} dataKey="count" nameKey="name" label={({ name, value }) => `${name}: ${value}`} animationDuration={1000}>
                    {sourceChart.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          <div className="bg-card rounded-xl border border-border p-4 md:p-5 card-hover">
            <h2 className="font-semibold text-foreground mb-4">Guest Demographics</h2>
            {data.demographics.length === 0 ? (
              <p className="text-xs text-muted-foreground py-16 text-center">No guests in this range.</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.demographics} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(45, 15%, 88%)" />
                  <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(220, 10%, 46%)" allowDecimals={false} />
                  <YAxis dataKey="country" type="category" tick={{ fontSize: 11 }} stroke="hsl(220, 10%, 46%)" width={80} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="guests" fill="hsl(72, 45%, 45%)" radius={[0, 4, 4, 0]} name="Bookings" animationDuration={1000} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="bg-card rounded-xl border border-border p-4 md:p-5 card-hover">
            <h2 className="font-semibold text-foreground mb-4">ADR Trend (Weekly)</h2>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={data.adrTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(45, 15%, 88%)" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(220, 10%, 46%)" minTickGap={16} />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(220, 10%, 46%)" tickFormatter={(v) => `${(v / 1_000_000).toFixed(1)}M`} />
                <Tooltip formatter={(v: number) => formatIDR(v)} contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="adr" stroke="hsl(210, 60%, 50%)" strokeWidth={2} dot={{ r: 3 }} name="ADR" animationDuration={1000} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-card rounded-xl border border-border p-4 md:p-5 card-hover">
            <h2 className="font-semibold text-foreground mb-4">Channel Performance</h2>
            {sourceChart.length === 0 ? (
              <p className="text-xs text-muted-foreground py-16 text-center">No bookings in this range.</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={sourceChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(45, 15%, 88%)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(220, 10%, 46%)" />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="hsl(220, 10%, 46%)" tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}M`} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} stroke="hsl(220, 10%, 46%)" allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number, name) => (name === "Revenue" ? formatIDR(v) : v)} />
                  <Legend />
                  <Bar yAxisId="left" dataKey="revenue" fill="hsl(72, 45%, 45%)" radius={[4, 4, 0, 0]} name="Revenue" animationDuration={1000} />
                  <Bar yAxisId="right" dataKey="count" fill="hsl(210, 60%, 50%)" radius={[4, 4, 0, 0]} name="Bookings" animationDuration={1000} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          <div className="bg-card rounded-xl border border-border p-4 md:p-5 card-hover">
            <h2 className="font-semibold text-foreground mb-4">Weekly Pattern</h2>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={data.weekdayTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(45, 15%, 88%)" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
                <YAxis tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                <Line type="monotone" dataKey="arrivals" stroke="hsl(145, 63%, 42%)" strokeWidth={2} name="Arrivals" animationDuration={1000} />
                <Line type="monotone" dataKey="departures" stroke="hsl(0, 72%, 51%)" strokeWidth={2} name="Departures" animationDuration={1000} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-card rounded-xl border border-border p-4 md:p-5 card-hover">
            <h2 className="font-semibold text-foreground mb-3 flex items-center gap-2"><LogIn className="w-4 h-4" /> Today's Arrivals</h2>
            <MovementList rows={data.arrivalsToday} empty="No arrivals today." />
          </div>

          <div className="bg-card rounded-xl border border-border p-4 md:p-5 card-hover">
            <h2 className="font-semibold text-foreground mb-3 flex items-center gap-2"><LogOut className="w-4 h-4" /> Today's Departures</h2>
            <MovementList rows={data.departuresToday} empty="No departures today." />
            <div className="mt-4 pt-4 border-t border-border space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Quick Stats</h3>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1.5"><MessageSquare className="w-3.5 h-3.5" /> Unread Chats</span>
                <span className="font-semibold text-foreground tabular-nums">{quickStats.unreadChats}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1.5"><Flag className="w-3.5 h-3.5" /> Follow-up Calls</span>
                <span className="font-semibold text-foreground tabular-nums">{quickStats.followUpCalls}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> Today's Calls</span>
                <span className="font-semibold text-foreground tabular-nums">{quickStats.callsToday}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
