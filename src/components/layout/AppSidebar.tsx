import {
  LayoutDashboard, CalendarCheck, DoorOpen, MessageSquare,
  Package, CalendarDays, DollarSign, Star, ConciergeBell, ChevronDown,
  Phone, Users, ChevronLeft, ChevronRight, Contact
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";

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
  { icon: Contact, label: "CRM Tamu", path: "/crm" },
  { icon: Users, label: "User Management", path: "/users" },
  { icon: Star, label: "Reviews", path: "/reviews" },
  { icon: ConciergeBell, label: "Concierge", path: "/concierge" },
];

export default function AppSidebar() {
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "true");

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebar-collapsed", String(next));
  };

  const isActive = (path: string) => {
    if (path === "/") return pathname === "/";
    return pathname.startsWith(path.split("?")[0]);
  };

  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 224 }}
      transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
      className="hidden md:flex flex-col min-h-screen bg-card border-r border-sidebar-border px-2 py-6 shrink-0 relative"
    >
      <div className={cn("flex items-center gap-2 px-2 mb-8", collapsed && "justify-center")}>
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
          <span className="text-primary-foreground font-bold text-sm">B</span>
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              className="text-lg font-bold text-foreground tracking-tight overflow-hidden whitespace-nowrap"
            >
              GoStay
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <nav className="flex-1 flex flex-col gap-1">
        {navItems.map((item) => (
          <motion.div key={item.label} whileHover={{ x: collapsed ? 0 : 2 }} whileTap={{ scale: 0.97 }}>
            <Link
              to={item.path}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg text-sm font-medium transition-colors",
                collapsed ? "px-2 py-2.5 justify-center" : "px-3 py-2.5",
                isActive(item.path)
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              <AnimatePresence>
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: "auto" }}
                    exit={{ opacity: 0, width: 0 }}
                    className="flex-1 text-left overflow-hidden whitespace-nowrap"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
              {!collapsed && item.badge && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="bg-destructive text-destructive-foreground text-xs rounded-full w-5 h-5 flex items-center justify-center font-semibold"
                >
                  {item.badge}
                </motion.span>
              )}
              {!collapsed && item.hasSubmenu && <ChevronDown className="w-4 h-4" />}
              {collapsed && item.badge && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full" />
              )}
            </Link>
          </motion.div>
        ))}
      </nav>

      <div className="flex flex-col gap-1 mt-4 pt-4 border-t border-sidebar-border">
        {bottomItems.map((item) => (
          <motion.div key={item.label} whileHover={{ x: collapsed ? 0 : 2 }} whileTap={{ scale: 0.97 }}>
            <Link
              to={item.path}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg text-sm font-medium transition-colors",
                collapsed ? "px-2 py-2.5 justify-center" : "px-3 py-2.5",
                isActive(item.path)
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              <AnimatePresence>
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: "auto" }}
                    exit={{ opacity: 0, width: 0 }}
                    className="overflow-hidden whitespace-nowrap"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </Link>
          </motion.div>
        ))}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={toggleCollapsed}
        className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors shadow-sm z-10"
      >
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>
    </motion.aside>
  );
}
