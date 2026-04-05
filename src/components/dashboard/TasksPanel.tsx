import { Plus, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

const tasks = [
  { date: "June 19, 2028", text: "Set Up Conference Room B for 10 AM Meeting", accent: false },
  { date: "June 19, 2028", text: "Restock Housekeeping Supplies on 3rd Floor", accent: true },
  { date: "June 20, 2028", text: "Inspect and Clean the Pool Area", accent: false },
  { date: "June 20, 2028", text: "Check-In Assistance During Peak Hours (4 PM - 6 PM)", accent: true },
];

export default function TasksPanel() {
  return (
    <div className="bg-card rounded-xl p-5 border border-border">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground">Tasks</h3>
        <button className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors">
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {tasks.map((t, i) => (
          <div
            key={i}
            className={cn(
              "rounded-lg p-3 border transition-colors",
              t.accent ? "bg-secondary border-primary/20" : "border-border"
            )}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-2">
                <input type="checkbox" className="mt-1 accent-primary" />
                <div>
                  <p className="text-[10px] text-muted-foreground">{t.date}</p>
                  <p className="text-xs font-medium text-foreground mt-0.5 leading-snug">{t.text}</p>
                </div>
              </div>
              <button className="text-muted-foreground hover:text-foreground">
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
