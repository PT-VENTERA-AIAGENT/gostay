import {
  LayoutDashboard, CalendarCheck, DoorOpen, MessageSquare,
  Package, CalendarDays, DollarSign, Star, ConciergeBell, ChevronDown,
  Phone, Users, BarChart3
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link, useLocation } from "react-router-dom";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: CalendarCheck, label: "Reservations", path: "/bookings" },
  { icon: DoorOpen, label: "Rooms", path: "/rooms" },
  { icon: MessageSquare, label: "Messages", path: "/chat", badge: 7 },
  { icon: Phone, label: "Call Logs", path: "/calls" },
  { icon: Package, label: "Inventory", path: "/inventory" },
  { icon: CalendarDays, label: "Calendar", path: "/bookings?view=calendar" },
  { icon: DollarSign, label: "Financials", path: "/analytics", hasSubmenu: true },
];

const bottomItems = [
  { icon: Users, label: "User Management", path: "/users" },
  { icon: Star, label: "Reviews", path: "/reviews" },
  { icon: ConciergeBell, label: "Concierge", path: "/concierge" },
];

export default function AppSidebar() {
  const { pathname } = useLocation();

  const isActive = (path: string) => {
    if (path === "/") return pathname === "/";
    return pathname.startsWith(path.split("?")[0]);
  };

  return (
    <aside className="flex flex-col w-56 min-h-screen bg-card border-r border-sidebar-border px-3 py-6 shrink-0">
      <div className="flex items-center gap-2 px-3 mb-8">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
          <span className="text-primary-foreground font-bold text-sm">B</span>
        </div>
        <span className="text-lg font-bold text-foreground tracking-tight">BookMe</span>
      </div>

      <nav className="flex-1 flex flex-col gap-1">
        {navItems.map((item) => (
          <Link
            key={item.label}
            to={item.path}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              isActive(item.path)
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
          </Link>
        ))}
      </nav>

      <div className="flex flex-col gap-1 mt-4 pt-4 border-t border-sidebar-border">
        {bottomItems.map((item) => (
          <Link
            key={item.label}
            to={item.path}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              isActive(item.path)
                ? "bg-primary text-primary-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
          >
            <item.icon className="w-5 h-5" />
            <span>{item.label}</span>
          </Link>
        ))}
      </div>
    </aside>
  );
}
