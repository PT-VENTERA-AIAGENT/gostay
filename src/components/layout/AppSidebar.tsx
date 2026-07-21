import {
  LayoutDashboard, CalendarCheck, DoorOpen, MessageSquare,
  CalendarDays, DollarSign, Star,
  Phone, Users, ChevronLeft, ChevronRight, Contact, MessageCircle, ConciergeBell, Store, Building2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { useChatThreads } from "@/hooks/useChat";
import { usePendingBookingsCount } from "@/hooks/useBookings";
import { useOpenRequestsCount } from "@/hooks/useGuestRequests";
import { useTenant } from "@/hooks/useTenant";

const navItems = [
  { icon: LayoutDashboard, label: "Dasbor", path: "/dashboard" },
  { icon: CalendarCheck, label: "Reservasi", path: "/bookings" },
  { icon: DoorOpen, label: "Kamar", path: "/rooms" },
  { icon: MessageSquare, label: "Pesan", path: "/chat" },
  { icon: Phone, label: "Log Panggilan", path: "/calls" },
  { icon: ConciergeBell, label: "Permintaan Tamu", path: "/requests" },
  { icon: Store, label: "Kasir (POS)", path: "/pos" },
  { icon: CalendarDays, label: "Kalender", path: "/bookings?view=calendar" },
  { icon: DollarSign, label: "Keuangan", path: "/analytics" },
];

const bottomItems = [
  { icon: Contact, label: "CRM Tamu", path: "/crm" },
  { icon: Building2, label: "Profil Hotel", path: "/settings/hotel" },
  { icon: MessageCircle, label: "Sambungkan WhatsApp", path: "/settings/whatsapp" },
  { icon: Users, label: "Manajemen Pengguna", path: "/users" },
  { icon: Star, label: "Ulasan", path: "/reviews" },
];

export default function AppSidebar() {
  const { pathname, search } = useLocation();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "true");

  // Real unread total for the Messages badge (was hardcoded to 7). Sums the
  // per-thread unread counts; realtime keeps it live across the app.
  const { data: threads = [] } = useChatThreads();
  const unreadTotal = threads.reduce((n, t) => n + (t.unread_count ?? 0), 0);

  // Pending reservations waiting on the front desk — same badge treatment as
  // unread Messages, so new bookings are visible from any page.
  const { data: pendingBookings = 0 } = usePendingBookingsCount();
  const { data: openRequests = 0 } = useOpenRequestsCount();

  // Brand the shell with the caller's actual hotel, not a hardcoded name.
  const { name: hotelName, initial: hotelInitial, tenant } = useTenant();
  const badgeFor = (path: string) =>
    path === "/chat" ? unreadTotal
    : path === "/bookings" ? pendingBookings
    : path === "/requests" ? openRequests
    : 0;

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebar-collapsed", String(next));
  };

  /**
   * Exactly one item highlights at a time.
   *
   * Reservations (/bookings) and Calendar (/bookings?view=calendar) share a
   * pathname, so comparing pathname alone lit both up. The query string is what
   * separates them, so it is part of the comparison: an item with ?view=... is
   * active only when that param matches, and a bare path is active only when no
   * competing view param is set.
   */
  const isActive = (path: string) => {
    const [base, query] = path.split("?");
    if (base === "/dashboard") return pathname === "/dashboard";
    if (!pathname.startsWith(base)) return false;
    const wantView = query ? new URLSearchParams(query).get("view") : null;
    const currentView = new URLSearchParams(search).get("view");
    return wantView ? currentView === wantView : !currentView;
  };

  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 224 }}
      transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
      className="hidden md:flex flex-col min-h-screen bg-card border-r border-sidebar-border px-2 py-6 shrink-0 relative"
    >
      <div className={cn("flex items-center gap-2 px-2 mb-8", collapsed && "justify-center")}>
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0 overflow-hidden">
          {tenant?.logo_url ? (
            <img src={tenant.logo_url} alt={hotelName} className="w-full h-full object-cover" />
          ) : (
            <span className="text-primary-foreground font-bold text-sm">{hotelInitial}</span>
          )}
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              title={hotelName}
              className="text-lg font-bold text-foreground tracking-tight overflow-hidden whitespace-nowrap"
            >
              {hotelName}
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
              {!collapsed && badgeFor(item.path) > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="bg-destructive text-destructive-foreground text-xs rounded-full min-w-[20px] h-5 px-1 flex items-center justify-center font-semibold"
                >
                  {badgeFor(item.path) > 9 ? "9+" : badgeFor(item.path)}
                </motion.span>
              )}
              {collapsed && badgeFor(item.path) > 0 && (
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
