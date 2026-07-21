import { useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { LogOut } from "lucide-react";
import ThemeToggle from "@/components/shared/ThemeToggle";
import { useAuth } from "@/contexts/AuthContext";
import GlobalSearch from "@/components/layout/GlobalSearch";
import NotificationsMenu from "@/components/layout/NotificationsMenu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/bookings/new": "New Booking",
  "/bookings": "Reservations",
  "/rooms/types": "Room Types",
  "/rooms": "Rooms",
  "/chat": "Messages",
  "/calls/new": "New Call Log",
  "/calls": "Call Logs",
  "/analytics": "Analytics",
  "/users": "User Management",
  "/reviews": "Reviews",
  "/crm": "CRM",
};

/**
 * Longest matching prefix wins, so nested routes (/rooms/types, /bookings/:id)
 * inherit a sensible title instead of falling back to "Dashboard" — which is
 * what an exact-match lookup did on every sub-page.
 */
function titleFor(pathname: string): string {
  const hit = Object.keys(pageTitles)
    .filter((p) => pathname === p || pathname.startsWith(p + "/"))
    .sort((a, b) => b.length - a.length)[0];
  return hit ? pageTitles[hit] : "Dashboard";
}

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
  const title = titleFor(pathname);
  const { user, role, signOut } = useAuth();

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
        <GlobalSearch />

        <ThemeToggle />

        <NotificationsMenu />

        <DropdownMenu>
          <DropdownMenuTrigger
            className="hidden sm:flex items-center gap-3 ml-1 rounded-full pr-1 md:pr-2 hover:bg-muted transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            aria-label="Account menu"
          >
            <div className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-primary/20 flex items-center justify-center font-semibold text-sm text-primary">
              {initialsOf(displayName)}
            </div>
            <div className="hidden md:block text-right">
              <p className="text-sm font-semibold text-foreground">{displayName}</p>
              <p className="text-xs text-muted-foreground">{roleLabel}</p>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="truncate">{displayName}</span>
              <span className="text-xs font-normal text-muted-foreground">{roleLabel}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
              <LogOut className="w-4 h-4" />
              Keluar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
