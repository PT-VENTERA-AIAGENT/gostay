import {
  LayoutDashboard, CalendarCheck, DoorOpen, MessageSquare, Sparkles,
  Package, CalendarDays, DollarSign, Star, ConciergeBell, ChevronDown
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", active: true },
  { icon: CalendarCheck, label: "Reservation" },
  { icon: DoorOpen, label: "Rooms" },
  { icon: MessageSquare, label: "Messages", badge: 7 },
  { icon: Sparkles, label: "Housekeeping" },
  { icon: Package, label: "Inventory" },
  { icon: CalendarDays, label: "Calendar" },
  { icon: DollarSign, label: "Financials", hasSubmenu: true },
];

const bottomItems = [
  { icon: Star, label: "Reviews" },
  { icon: ConciergeBell, label: "Concierge" },
];

export default function AppSidebar() {
  return (
    <aside className="flex flex-col w-56 min-h-screen bg-card border-r border-sidebar-border px-3 py-6">
      <div className="flex items-center gap-2 px-3 mb-8">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
          <span className="text-primary-foreground font-bold text-sm">B</span>
        </div>
        <span className="text-lg font-bold text-foreground tracking-tight">BookMe</span>
      </div>

      <nav className="flex-1 flex flex-col gap-1">
        {navItems.map((item) => (
          <button
            key={item.label}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              item.active
                ? "bg-primary text-primary-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
          >
            <item.icon className="w-5 h-5" />
            <span className="flex-1 text-left">{item.label}</span>
            {item.badge && (
              <span className="bg-destructive text-destructive-foreground text-xs rounded-full w-5 h-5 flex items-center justify-center font-semibold">
                {item.badge}
              </span>
            )}
            {item.hasSubmenu && <ChevronDown className="w-4 h-4" />}
          </button>
        ))}
      </nav>

      <div className="flex flex-col gap-1 mt-4 pt-4 border-t border-sidebar-border">
        {bottomItems.map((item) => (
          <button
            key={item.label}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          >
            <item.icon className="w-5 h-5" />
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
