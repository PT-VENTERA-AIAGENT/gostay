import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, CalendarCheck, DoorOpen, MessageSquare, MoreHorizontal, Phone, Users, BarChart3, Package, CalendarDays, Star, ConciergeBell } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const mainNav = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: CalendarCheck, label: "Bookings", path: "/bookings" },
  { icon: DoorOpen, label: "Rooms", path: "/rooms" },
  { icon: MessageSquare, label: "Chat", path: "/chat" },
  { icon: MoreHorizontal, label: "More", path: "" },
];

const moreNav = [
  { icon: Phone, label: "Call Logs", path: "/calls" },
  { icon: Package, label: "Inventory", path: "/inventory" },
  { icon: CalendarDays, label: "Calendar", path: "/bookings?view=calendar" },
  { icon: BarChart3, label: "Analytics", path: "/analytics" },
  { icon: Users, label: "Users", path: "/users" },
  { icon: Star, label: "Reviews", path: "/reviews" },
  { icon: ConciergeBell, label: "Concierge", path: "/concierge" },
];

export default function MobileBottomNav() {
  const { pathname } = useLocation();
  const [showMore, setShowMore] = useState(false);

  const isActive = (path: string) => {
    if (path === "/") return pathname === "/";
    return pathname.startsWith(path.split("?")[0]);
  };

  return (
    <>
      <AnimatePresence>
        {showMore && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-foreground/30 z-40 md:hidden"
              onClick={() => setShowMore(false)}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed bottom-16 left-0 right-0 bg-card border-t border-border rounded-t-2xl p-4 z-50 md:hidden"
            >
              <div className="grid grid-cols-3 gap-3">
                {moreNav.map((item) => (
                  <Link
                    key={item.label}
                    to={item.path}
                    onClick={() => setShowMore(false)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl text-xs font-medium transition-colors",
                      isActive(item.path) ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
                    )}
                  >
                    <item.icon className="w-5 h-5" />
                    {item.label}
                  </Link>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-40 md:hidden">
        <div className="flex items-center justify-around py-2 px-2">
          {mainNav.map((item) => {
            if (item.label === "More") {
              return (
                <button
                  key="more"
                  onClick={() => setShowMore(!showMore)}
                  className={cn(
                    "flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-[10px] font-medium transition-colors min-w-[56px]",
                    showMore ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </button>
              );
            }
            return (
              <Link
                key={item.label}
                to={item.path}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-[10px] font-medium transition-colors min-w-[56px]",
                  isActive(item.path) ? "text-primary" : "text-muted-foreground"
                )}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
