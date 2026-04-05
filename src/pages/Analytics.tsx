import { TrendingUp, TrendingDown, BedDouble, DollarSign, Download, LogIn, LogOut, MessageSquare, Phone, Flag, FileText, CalendarRange } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line } from "recharts";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import PageTransition, { staggerContainer, staggerItem } from "@/components/shared/PageTransition";
import { exportCSV, exportPDF } from "@/components/analytics/ExportUtils";
import { useAnimatedCounter } from "@/hooks/use-animated-counter";
import { useState } from "react";

const occupancyData = [
  { date: "Mar 6", rate: 72 }, { date: "Mar 13", rate: 78 }, { date: "Mar 20", rate: 85 },
  { date: "Mar 27", rate: 80 }, { date: "Apr 3", rate: 88 }, { date: "Apr 5", rate: 82 },
];

const revenueByType = [
  { name: "Standard", revenue: 45000000, fill: "hsl(72, 45%, 45%)" },
  { name: "Deluxe", revenue: 62000000, fill: "hsl(210, 60%, 50%)" },
  { name: "Suite", revenue: 38000000, fill: "hsl(48, 90%, 55%)" },
  { name: "Family", revenue: 28000000, fill: "hsl(145, 63%, 42%)" },
  { name: "Presidential", revenue: 15000000, fill: "hsl(0, 72%, 51%)" },
];

const monthlyRevenue = [
  { month: "Oct", revenue: 280, bookings: 85 }, { month: "Nov", revenue: 320, bookings: 95 }, { month: "Dec", revenue: 450, bookings: 130 },
  { month: "Jan", revenue: 380, bookings: 110 }, { month: "Feb", revenue: 340, bookings: 100 }, { month: "Mar", revenue: 420, bookings: 125 },
];

const bookingSourceData = [
  { name: "Portal", value: 45, fill: "hsl(72, 45%, 45%)" },
  { name: "Phone", value: 25, fill: "hsl(210, 60%, 50%)" },
  { name: "Walk-in", value: 20, fill: "hsl(48, 90%, 55%)" },
  { name: "Staff", value: 10, fill: "hsl(145, 63%, 42%)" },
];

const weeklyTrend = [
  { day: "Mon", arrivals: 5, departures: 3 }, { day: "Tue", arrivals: 8, departures: 4 },
  { day: "Wed", arrivals: 6, departures: 7 }, { day: "Thu", arrivals: 4, departures: 5 },
  { day: "Fri", arrivals: 10, departures: 3 }, { day: "Sat", arrivals: 12, departures: 2 },
  { day: "Sun", arrivals: 3, departures: 8 },
];

const guestDemographics = [
  { country: "Indonesia", guests: 145 }, { country: "Singapore", guests: 42 },
  { country: "Malaysia", guests: 38 }, { country: "Japan", guests: 25 },
  { country: "Australia", guests: 22 }, { country: "Other", guests: 28 },
];

const adrTrend = [
  { date: "W1", adr: 1150000 }, { date: "W2", adr: 1220000 }, { date: "W3", adr: 1180000 },
  { date: "W4", adr: 1350000 }, { date: "W5", adr: 1280000 }, { date: "W6", adr: 1400000 },
];

const channelPerformance = [
  { channel: "Portal", revenue: 180, bookings: 55 },
  { channel: "Phone", revenue: 120, bookings: 30 },
  { channel: "Walk-in", revenue: 80, bookings: 25 },
  { channel: "Staff", revenue: 40, bookings: 15 },
];

function formatIDR(n: number) {
  if (n >= 1000000000) return `IDR ${(n / 1000000000).toFixed(2)}B`;
  if (n >= 1000000) return `IDR ${(n / 1000000).toFixed(0)}M`;
  return `IDR ${(n / 1000).toFixed(0)}K`;
}

const todayArrivals = [
  { guest: "Mike Johnson", room: "202", roomType: "Standard", time: "2:00 PM", status: "pending" },
  { guest: "Rachel Adams", room: "104", roomType: "Deluxe", time: "3:00 PM", status: "confirmed" },
  { guest: "Tom Harris", room: "101", roomType: "Standard", time: "4:00 PM", status: "confirmed" },
];

const todayDepartures = [
  { guest: "Robert Wilson", room: "205", roomType: "Suite", time: "11:00 AM", status: "checked_in" },
  { guest: "Anna Lee", room: "302", roomType: "Family", time: "12:00 PM", status: "checked_in" },
];

const statusCls: Record<string, string> = {
  pending: "badge-warning",
  confirmed: "badge-info",
  checked_in: "badge-primary",
};

type KPI = { label: string; numValue: number; format: (n: number) => string; change: string; up: boolean; icon: React.ElementType };

const kpis: KPI[] = [
  { label: "Occupancy Rate", numValue: 82, format: (n) => `${n}%`, change: "+5.2%", up: true, icon: BedDouble },
  { label: "Revenue (Today)", numValue: 185, format: (n) => `IDR ${(n / 10).toFixed(1)}M`, change: "+12.3%", up: true, icon: DollarSign },
  { label: "Revenue (Month)", numValue: 420, format: (n) => `IDR ${n}M`, change: "+8.1%", up: true, icon: TrendingUp },
  { label: "Revenue (Year)", numValue: 219, format: (n) => `IDR ${(n / 100).toFixed(2)}B`, change: "+15.4%", up: true, icon: DollarSign },
  { label: "ADR", numValue: 14, format: (n) => `IDR ${(n / 10).toFixed(1)}M`, change: "+9.7%", up: true, icon: DollarSign },
  { label: "RevPAR", numValue: 115, format: (n) => `IDR ${(n / 100).toFixed(2)}M`, change: "+6.3%", up: true, icon: BedDouble },
];

const tooltipStyle = { borderRadius: "0.5rem", border: "1px solid hsl(45, 15%, 88%)", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)" };

function AnimatedKPI({ kpi }: { kpi: KPI }) {
  const animated = useAnimatedCounter(kpi.numValue);
  return (
    <p className="text-lg md:text-xl font-bold text-foreground tabular-nums">{kpi.format(animated)}</p>
  );
}

export default function Analytics() {
  const [dateRange, setDateRange] = useState("30d");

  const handleExportCSV = () => {
    exportCSV(
      ["Month", "Revenue (M IDR)", "Bookings"],
      monthlyRevenue.map((r) => [r.month, r.revenue, r.bookings]),
      "bookme-analytics.csv"
    );
  };

  return (
    <PageTransition>
      <div className="p-4 md:p-6 space-y-4 md:space-y-6 print:p-0">
        {/* Print header */}
        <div className="hidden print:block mb-6">
          <h1 className="text-2xl font-bold">BookMe Hotel — Analytics Report</h1>
          <p className="text-sm text-muted-foreground">Generated: {new Date().toLocaleDateString()}</p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">Analytics & Reports</h1>
            <p className="text-sm text-muted-foreground mt-1">Real-time operational metrics</p>
          </div>
          <div className="flex items-center gap-2 md:gap-3 flex-wrap">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card text-sm">
              <CalendarRange className="w-4 h-4 text-muted-foreground" />
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className="bg-transparent font-medium text-foreground focus:outline-none cursor-pointer"
              >
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
                <option value="month">This Month</option>
                <option value="year">This Year</option>
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
          {kpis.map((kpi) => (
            <motion.div key={kpi.label} variants={staggerItem} whileHover={{ scale: 1.02, y: -2 }} className="bg-card rounded-xl border border-border p-3 md:p-4 card-hover">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">{kpi.label}</span>
                <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center">
                  <kpi.icon className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
              </div>
              <AnimatedKPI kpi={kpi} />
              {kpi.change && (
                <div className="flex items-center gap-1 mt-1">
                  {kpi.up ? <TrendingUp className="w-3 h-3 text-success" /> : <TrendingDown className="w-3 h-3 text-destructive" />}
                  <span className={`text-xs font-medium ${kpi.up ? "text-success" : "text-destructive"}`}>{kpi.change}</span>
                  <span className="text-[10px] text-muted-foreground hidden lg:inline">vs prev</span>
                </div>
              )}
            </motion.div>
          ))}
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          <motion.div variants={staggerItem} initial="hidden" animate="show" className="bg-card rounded-xl border border-border p-4 md:p-5 card-hover">
            <h2 className="font-semibold text-foreground mb-4">30-Day Occupancy Trend</h2>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={occupancyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(45, 15%, 88%)" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
                <YAxis tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" unit="%" />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="rate" stroke="hsl(72, 45%, 45%)" fill="hsl(72, 45%, 45%)" fillOpacity={0.2} name="Occupancy %" animationDuration={1000} />
              </AreaChart>
            </ResponsiveContainer>
          </motion.div>

          <motion.div variants={staggerItem} initial="hidden" animate="show" className="bg-card rounded-xl border border-border p-4 md:p-5 card-hover">
            <h2 className="font-semibold text-foreground mb-4">Revenue by Room Type</h2>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={revenueByType} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={3} dataKey="revenue" nameKey="name" animationDuration={1000}>
                  {revenueByType.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Pie>
                <Tooltip formatter={(v: number) => formatIDR(v)} contentStyle={tooltipStyle} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 print:break-before-page">
          <div className="lg:col-span-2 bg-card rounded-xl border border-border p-4 md:p-5 card-hover">
            <h2 className="font-semibold text-foreground mb-4">Monthly Revenue & Bookings</h2>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={monthlyRevenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(45, 15%, 88%)" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
                <YAxis yAxisId="left" tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                <Bar yAxisId="left" dataKey="revenue" fill="hsl(72, 45%, 45%)" radius={[4, 4, 0, 0]} name="Revenue (M IDR)" animationDuration={1000} />
                <Line yAxisId="right" type="monotone" dataKey="bookings" stroke="hsl(210, 60%, 50%)" strokeWidth={2} name="Bookings" dot={{ r: 3 }} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-card rounded-xl border border-border p-4 md:p-5 card-hover">
            <h2 className="font-semibold text-foreground mb-4">Booking Source</h2>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={bookingSourceData} cx="50%" cy="50%" outerRadius={80} dataKey="value" nameKey="name" label={({ name, value }) => `${name}: ${value}%`} animationDuration={1000}>
                  {bookingSourceData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          <div className="bg-card rounded-xl border border-border p-4 md:p-5 card-hover">
            <h2 className="font-semibold text-foreground mb-4">Guest Demographics</h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={guestDemographics} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(45, 15%, 88%)" />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(220, 10%, 46%)" />
                <YAxis dataKey="country" type="category" tick={{ fontSize: 11 }} stroke="hsl(220, 10%, 46%)" width={80} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="guests" fill="hsl(72, 45%, 45%)" radius={[0, 4, 4, 0]} name="Guests" animationDuration={1000} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-card rounded-xl border border-border p-4 md:p-5 card-hover">
            <h2 className="font-semibold text-foreground mb-4">ADR Trend (Weekly)</h2>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={adrTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(45, 15%, 88%)" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(220, 10%, 46%)" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(220, 10%, 46%)" tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} />
                <Tooltip formatter={(v: number) => formatIDR(v)} contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="adr" stroke="hsl(210, 60%, 50%)" strokeWidth={2} dot={{ r: 4 }} name="ADR" animationDuration={1000} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-card rounded-xl border border-border p-4 md:p-5 card-hover">
            <h2 className="font-semibold text-foreground mb-4">Channel Performance</h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={channelPerformance}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(45, 15%, 88%)" />
                <XAxis dataKey="channel" tick={{ fontSize: 11 }} stroke="hsl(220, 10%, 46%)" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(220, 10%, 46%)" />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                <Bar dataKey="revenue" fill="hsl(72, 45%, 45%)" radius={[4, 4, 0, 0]} name="Revenue (M)" animationDuration={1000} />
                <Bar dataKey="bookings" fill="hsl(210, 60%, 50%)" radius={[4, 4, 0, 0]} name="Bookings" animationDuration={1000} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          <div className="bg-card rounded-xl border border-border p-4 md:p-5 card-hover">
            <h2 className="font-semibold text-foreground mb-4">Weekly Pattern</h2>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={weeklyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(45, 15%, 88%)" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
                <YAxis tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                <Line type="monotone" dataKey="arrivals" stroke="hsl(145, 63%, 42%)" strokeWidth={2} name="Arrivals" animationDuration={1000} />
                <Line type="monotone" dataKey="departures" stroke="hsl(0, 72%, 51%)" strokeWidth={2} name="Departures" animationDuration={1000} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-card rounded-xl border border-border p-4 md:p-5 card-hover">
            <h2 className="font-semibold text-foreground mb-3 flex items-center gap-2"><LogIn className="w-4 h-4" /> Today's Arrivals</h2>
            <div className="space-y-3">
              {todayArrivals.map((a, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }} className="flex items-center justify-between p-2.5 bg-muted rounded-lg hover:bg-accent transition-colors">
                  <div>
                    <p className="text-sm font-medium text-foreground">{a.guest}</p>
                    <p className="text-xs text-muted-foreground">{a.room} · {a.roomType} · {a.time}</p>
                  </div>
                  <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", statusCls[a.status])}>{a.status}</span>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border p-4 md:p-5 card-hover">
            <h2 className="font-semibold text-foreground mb-3 flex items-center gap-2"><LogOut className="w-4 h-4" /> Today's Departures</h2>
            <div className="space-y-3">
              {todayDepartures.map((d, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }} className="flex items-center justify-between p-2.5 bg-muted rounded-lg hover:bg-accent transition-colors">
                  <div>
                    <p className="text-sm font-medium text-foreground">{d.guest}</p>
                    <p className="text-xs text-muted-foreground">{d.room} · {d.roomType} · {d.time}</p>
                  </div>
                  <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", statusCls[d.status])}>checked in</span>
                </motion.div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-border space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Quick Stats</h3>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1.5"><MessageSquare className="w-3.5 h-3.5" /> Unread Chats</span>
                <span className="font-semibold text-foreground tabular-nums">3</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1.5"><Flag className="w-3.5 h-3.5" /> Follow-up Calls</span>
                <span className="font-semibold text-foreground tabular-nums">2</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> Today's Calls</span>
                <span className="font-semibold text-foreground tabular-nums">6</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
