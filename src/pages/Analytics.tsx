import { TrendingUp, TrendingDown, Users, DollarSign, BedDouble, CalendarCheck, Download } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

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
  { month: "Oct", revenue: 280 }, { month: "Nov", revenue: 320 }, { month: "Dec", revenue: 450 },
  { month: "Jan", revenue: 380 }, { month: "Feb", revenue: 340 }, { month: "Mar", revenue: 420 },
];

function formatIDR(n: number) {
  if (n >= 1000000) return `IDR ${(n / 1000000).toFixed(0)}M`;
  return `IDR ${(n / 1000).toFixed(0)}K`;
}

const kpis = [
  { label: "Occupancy Rate", value: "82%", change: "+5.2%", up: true, icon: BedDouble },
  { label: "Revenue (Today)", value: "IDR 18.5M", change: "+12.3%", up: true, icon: DollarSign },
  { label: "Revenue (Month)", value: "IDR 420M", change: "+8.1%", up: true, icon: TrendingUp },
  { label: "Revenue (Year)", value: "IDR 2.19B", change: "+15.4%", up: true, icon: DollarSign },
  { label: "Arrivals Today", value: "8", change: "", up: true, icon: CalendarCheck },
  { label: "Departures Today", value: "5", change: "", up: true, icon: CalendarCheck },
];

export default function Analytics() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">Real-time operational metrics and performance analytics</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-card text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 xl:grid-cols-6 gap-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="bg-card rounded-xl border border-border p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">{kpi.label}</span>
              <kpi.icon className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="text-xl font-bold text-foreground">{kpi.value}</p>
            {kpi.change && (
              <div className="flex items-center gap-1 mt-1">
                {kpi.up ? <TrendingUp className="w-3 h-3 text-success" /> : <TrendingDown className="w-3 h-3 text-destructive" />}
                <span className={`text-xs font-medium ${kpi.up ? "text-success" : "text-destructive"}`}>{kpi.change}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Occupancy Trend */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="font-semibold text-foreground mb-4">30-Day Occupancy Trend</h2>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={occupancyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(45, 15%, 88%)" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
              <YAxis tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" unit="%" />
              <Tooltip />
              <Area type="monotone" dataKey="rate" stroke="hsl(72, 45%, 45%)" fill="hsl(72, 45%, 45%)" fillOpacity={0.2} name="Occupancy %" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Revenue by Room Type */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="font-semibold text-foreground mb-4">Revenue by Room Type</h2>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={revenueByType} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={3} dataKey="revenue" nameKey="name">
                {revenueByType.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => formatIDR(v)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly Revenue */}
      <div className="bg-card rounded-xl border border-border p-5">
        <h2 className="font-semibold text-foreground mb-4">Monthly Revenue (IDR Millions)</h2>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={monthlyRevenue}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(45, 15%, 88%)" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
            <YAxis tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
            <Tooltip formatter={(v: number) => `IDR ${v}M`} />
            <Bar dataKey="revenue" fill="hsl(72, 45%, 45%)" radius={[4, 4, 0, 0]} name="Revenue" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
