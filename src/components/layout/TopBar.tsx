import { Search, Bell } from "lucide-react";
import { useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import ThemeToggle from "@/components/shared/ThemeToggle";
import { useAuth } from "@/contexts/AuthContext";

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/bookings": "Reservations",
  "/rooms": "Rooms",
  "/chat": "Messages",
  "/calls": "Call Logs",
  "/analytics": "Analytics",
  "/users": "User Management",
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

const roleLabels: Record<string, string> = {
  admin: "Admin",
  staff: "Staff",
  customer: "Guest",
};

export default function TopBar() {
  const { pathname } = useLocation();
  const title = pageTitles[pathname] || "Dashboard";
  const { user, role } = useAuth();

  const displayName = user?.name ?? user?.email ?? "Unknown user";
  const roleLabel = role ? roleLabels[role] : "No role";

  return (
    <header className="flex items-center justify-between px-4 md:px-8 py-3 md:py-4 bg-card border-b border-border">
      <motion.h1
        key={title}
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.25 }}
        className="text-lg md:text-2xl font-bold text-foreground"
      >
        {title}
      </motion.h1>

      <div className="flex items-center gap-2 md:gap-3">
        <div className="hidden md:flex items-center gap-2 bg-muted rounded-lg px-4 py-2.5 w-72 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1 focus-within:ring-offset-background transition-shadow">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            placeholder="Search room, guest, book, etc"
            className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full"
          />
          <kbd className="hidden lg:inline-flex items-center gap-0.5 text-[10px] text-muted-foreground/60 border border-border rounded px-1.5 py-0.5 font-mono">
            /
          </kbd>
        </div>
        <button className="md:hidden w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors touch-target btn-press">
          <Search className="w-5 h-5" />
        </button>

        <ThemeToggle />

        <div className="relative">
          <button className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:bg-accent transition-colors btn-press">
            <Bell className="w-5 h-5" />
          </button>
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-destructive rounded-full border-2 border-card"
          />
        </div>

        <div className="hidden sm:flex items-center gap-3 ml-1">
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-primary/20 flex items-center justify-center font-semibold text-sm text-primary">
            {initialsOf(displayName)}
          </div>
          <div className="hidden md:block text-right">
            <p className="text-sm font-semibold text-foreground">{displayName}</p>
            <p className="text-xs text-muted-foreground">{roleLabel}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
