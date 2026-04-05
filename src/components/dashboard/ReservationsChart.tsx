import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

const data = [
  { day: "12 Jun", booked: 70, cancelled: 10 },
  { day: "13 Jun", booked: 55, cancelled: 20 },
  { day: "14 Jun", booked: 85, cancelled: 8 },
  { day: "15 Jun", booked: 60, cancelled: 15 },
  { day: "16 Jun", booked: 90, cancelled: 5 },
  { day: "17 Jun", booked: 40, cancelled: 12 },
  { day: "18 Jun", booked: 75, cancelled: 18 },
];

export default function ReservationsChart() {
  return (
    <div className="bg-card rounded-xl p-5 border border-border">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground">Reservations</h3>
        <select className="text-sm bg-muted rounded-lg px-3 py-1.5 text-foreground border-none outline-none">
          <option>Last 7 Days</option>
        </select>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(45, 15%, 88%)" />
          <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'hsl(220, 10%, 46%)' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: 'hsl(220, 10%, 46%)' }} axisLine={false} tickLine={false} />
          <Tooltip />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="booked" name="Booked" fill="hsl(72, 45%, 45%)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="cancelled" name="Cancelled" fill="hsl(72, 40%, 85%)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
