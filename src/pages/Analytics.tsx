import { TrendingUp, TrendingDown, Users, DollarSign, BedDouble, CalendarCheck, Download, LogIn, LogOut, MessageSquare, Phone, Flag } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line } from "recharts";
import { cn } from "@/lib/utils";

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

function formatIDR(n: number) {
  if (n >= 1000000000) return `IDR ${(n / 1000000000).toFixed(2)}B`;
  if (n >= 1000000) return `IDR ${(n / 1000000).toFixed(0)}M`;
  return `IDR ${(n / 1000).toFixed(0)}K`;
}

const kpis = [
  { label: "Occupancy Rate", value: "82%", change: "+5.2%", up: true, icon: BedDouble },
  { label: "Revenue (Today)", value: "IDR 18.5M", change: "+12.3%", up: true, icon: DollarSign },
  { label: "Revenue (Month)", value: "IDR 420M", change: "+8.1%", up: true, icon: TrendingUp },
  { label: "Revenue (Year)", value: "IDR 2.19B", change: "+15.4%", up: true, icon: DollarSign },
  { label: "Arrivals Today", value: "8", change: "", up: true, icon: LogIn },
  { label: "Departures Today", value: "5", change: "", up: true, icon: LogOut },
];

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
  pending: "bg-warning/10 text-warning",
  confirmed: "bg-info/10 text-info",
  checked_in: "bg-primary/10 text-primary",
};

export default function Analytics() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Analytics & Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">Real-time operational metrics and performance analytics</p>
        </div>
        <div className="flex items-center gap-3">
          <select className="px-3 py-2 rounded-lg border border-border bg-card text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
            <option>Last 30 Days</option>
            <option>Last 7 Days</option>
            <option>This Month</option>
            <option>This Year</option>
          </select>
          <button className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-card text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
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

      <div className="grid grid-cols-3 gap-6">
        {/* Monthly Revenue & Bookings */}
        <div className="col-span-2 bg-card rounded-xl border border-border p-5">
          <h2 className="font-semibold text-foreground mb-4">Monthly Revenue & Bookings</h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={monthlyRevenue}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(45, 15%, 88%)" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
              <YAxis yAxisId="left" tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
              <Tooltip />
              <Legend />
              <Bar yAxisId="left" dataKey="revenue" fill="hsl(72, 45%, 45%)" radius={[4, 4, 0, 0]} name="Revenue (M IDR)" />
              <Line yAxisId="right" type="monotone" dataKey="bookings" stroke="hsl(210, 60%, 50%)" strokeWidth={2} name="Bookings" dot={{ r: 3 }} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Booking Source */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="font-semibold text-foreground mb-4">Booking Source</h2>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={bookingSourceData} cx="50%" cy="50%" outerRadius={80} dataKey="value" nameKey="name" label={({ name, value }) => `${name}: ${value}%`}>
                {bookingSourceData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Weekly Arrivals/Departures + Today's Lists */}
      <div className="grid grid-cols-3 gap-6">
        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="font-semibold text-foreground mb-4">Weekly Pattern</h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={weeklyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(45, 15%, 88%)" />
              <XAxis dataKey="day" tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
              <YAxis tick={{ fontSize: 12 }} stroke="hsl(220, 10%, 46%)" />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="arrivals" stroke="hsl(145, 63%, 42%)" strokeWidth={2} name="Arrivals" />
              <Line type="monotone" dataKey="departures" stroke="hsl(0, 72%, 51%)" strokeWidth={2} name="Departures" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="font-semibold text-foreground mb-3 flex items-center gap-2"><LogIn className="w-4 h-4" /> Today's Arrivals</h2>
          <div className="space-y-3">
            {todayArrivals.map((a, i) => (
              <div key={i} className="flex items-center justify-between p-2.5 bg-muted rounded-lg">
                <div>
                  <p className="text-sm font-medium text-foreground">{a.guest}</p>
                  <p className="text-xs text-muted-foreground">{a.room} · {a.roomType} · {a.time}</p>
                </div>
                <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", statusCls[a.status])}>{a.status}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="font-semibold text-foreground mb-3 flex items-center gap-2"><LogOut className="w-4 h-4" /> Today's Departures</h2>
          <div className="space-y-3">
            {todayDepartures.map((d, i) => (
              <div key={i} className="flex items-center justify-between p-2.5 bg-muted rounded-lg">
                <div>
                  <p className="text-sm font-medium text-foreground">{d.guest}</p>
                  <p className="text-xs text-muted-foreground">{d.room} · {d.roomType} · {d.time}</p>
                </div>
                <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", statusCls[d.status])}>checked in</span>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-border space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Quick Stats</h3>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-1.5"><MessageSquare className="w-3.5 h-3.5" /> Unread Chats</span>
              <span className="font-semibold text-foreground">3</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-1.5"><Flag className="w-3.5 h-3.5" /> Follow-up Calls</span>
              <span className="font-semibold text-foreground">2</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> Today's Calls</span>
              <span className="font-semibold text-foreground">6</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
