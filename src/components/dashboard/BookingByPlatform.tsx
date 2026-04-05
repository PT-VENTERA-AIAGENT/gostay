import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { MoreHorizontal } from "lucide-react";

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
    <div className="bg-card rounded-xl p-5 border border-border">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground">Booking by Platform</h3>
        <button className="text-muted-foreground hover:text-foreground">
          <MoreHorizontal className="w-5 h-5" />
        </button>
      </div>

      <div className="flex items-center gap-4">
        <ResponsiveContainer width={140} height={140}>
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" strokeWidth={0}>
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        <div className="flex flex-col gap-2">
          {data.map((d) => (
            <div key={d.name} className="flex items-center gap-2 text-xs">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
              <span className="text-muted-foreground">{d.value}%</span>
              <span className="text-foreground font-medium">{d.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
