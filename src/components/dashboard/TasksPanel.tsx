import { Plus, MoreHorizontal, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";

const initialTasks = [
  { id: 1, date: "June 19, 2028", text: "Set Up Conference Room B for 10 AM Meeting", accent: false, done: false },
  { id: 2, date: "June 19, 2028", text: "Restock Housekeeping Supplies on 3rd Floor", accent: true, done: false },
  { id: 3, date: "June 20, 2028", text: "Inspect and Clean the Pool Area", accent: false, done: false },
  { id: 4, date: "June 20, 2028", text: "Check-In Assistance During Peak Hours (4 PM - 6 PM)", accent: true, done: false },
];

export default function TasksPanel() {
  const [tasks, setTasks] = useState(initialTasks);

  const toggleTask = (id: number) => {
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, done: !t.done } : t));
  };

  return (
    <div className="bg-card rounded-xl p-5 border border-border">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-foreground">Tasks</h3>
          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md tabular-nums">
            {tasks.filter((t) => !t.done).length}
          </span>
        </div>
        <button className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors btn-press" title="Add task">
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-col gap-3">
        <AnimatePresence>
          {tasks.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -20, height: 0 }}
              className={cn(
                "rounded-lg p-3 border transition-all",
                t.done ? "opacity-60 border-border" : t.accent ? "bg-secondary border-primary/20" : "border-border"
              )}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-2">
                  <button
                    onClick={() => toggleTask(t.id)}
                    className={cn(
                      "mt-0.5 w-4 h-4 rounded border flex items-center justify-center transition-all shrink-0",
                      t.done ? "bg-primary border-primary" : "border-muted-foreground/40 hover:border-primary"
                    )}
                  >
                    {t.done && <Check className="w-3 h-3 text-primary-foreground" />}
                  </button>
                  <div>
                    <p className="text-[10px] text-muted-foreground">{t.date}</p>
                    <p className={cn("text-xs font-medium text-foreground mt-0.5 leading-snug", t.done && "line-through")}>{t.text}</p>
                  </div>
                </div>
                <button className="text-muted-foreground hover:text-foreground w-6 h-6 rounded flex items-center justify-center hover:bg-muted transition-colors" title="More options">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
