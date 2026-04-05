import { Settings, LogOut, SprayCan, Wrench } from "lucide-react";

const activities = [
  { time: "12:00 PM", title: "Conference Room Setup", desc: "Events Team set up Conference Room B for 10 AM meeting, including AV equipment and refreshments.", icon: Settings, color: "text-info" },
  { time: "11:00 AM", title: "Guest Check-Out", desc: "Sarah Johnson completed check-out process and updated room availability for Room 305.", icon: LogOut, color: "text-primary" },
  { time: "11:00 AM", title: "Room Cleaning Completed", desc: "Maria Gonzalez cleaned and prepared Room 204 for new guests.", icon: SprayCan, color: "text-success" },
  { time: "10:30 AM", title: "Maintenance Request Logged", desc: "Broken toilet in Room 109, maintenance request assigned to technician.", icon: Wrench, color: "text-warning" },
];

export default function RecentActivities() {
  return (
    <div className="bg-card rounded-xl p-5 border border-border">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground">Recent Activities</h3>
        <button className="text-xs text-primary font-medium hover:underline">•••</button>
      </div>

      <div className="flex flex-col gap-4">
        {activities.map((a, i) => (
          <div key={i} className="flex gap-3">
            <div className={`w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 ${a.color}`}>
              <a.icon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground">{a.time}</p>
              <p className="text-xs font-semibold text-foreground">{a.title}</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">{a.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
