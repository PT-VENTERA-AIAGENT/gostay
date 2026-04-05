import { MoreHorizontal } from "lucide-react";

const rooms = [
  { label: "Occupied", value: 286, color: "bg-primary" },
  { label: "Reserved", value: 87, color: "bg-chart-yellow" },
  { label: "Available", value: 32, color: "bg-success" },
  { label: "Not Ready", value: 13, color: "bg-destructive" },
];

const total = rooms.reduce((a, b) => a + b.value, 0);

export default function RoomAvailability() {
  return (
    <div className="bg-card rounded-xl p-5 border border-border">
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-semibold text-foreground">Room Availability</h3>
        <button className="text-muted-foreground hover:text-foreground">
          <MoreHorizontal className="w-5 h-5" />
        </button>
      </div>

      <div className="flex rounded-lg overflow-hidden h-8 mb-5">
        {rooms.map((r) => (
          <div
            key={r.label}
            className={`${r.color} transition-all`}
            style={{ width: `${(r.value / total) * 100}%` }}
          />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {rooms.map((r) => (
          <div key={r.label} className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-sm ${r.color}`} />
            <span className="text-xs text-muted-foreground">{r.label}</span>
            <span className="text-sm font-bold text-foreground ml-auto">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
