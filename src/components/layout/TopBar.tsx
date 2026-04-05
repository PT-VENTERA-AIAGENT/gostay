import { Search, Bell, Menu } from "lucide-react";
import { useLocation } from "react-router-dom";

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/bookings": "Reservations",
  "/rooms": "Rooms",
  "/chat": "Messages",
  "/calls": "Call Logs",
  "/analytics": "Analytics",
  "/users": "User Management",
};

export default function TopBar() {
  const { pathname } = useLocation();
  const title = pageTitles[pathname] || "Dashboard";

  return (
    <header className="flex items-center justify-between px-4 md:px-8 py-3 md:py-4 bg-card border-b border-border">
      <h1 className="text-lg md:text-2xl font-bold text-foreground">{title}</h1>

      <div className="flex items-center gap-2 md:gap-4">
        <div className="hidden md:flex items-center gap-2 bg-muted rounded-lg px-4 py-2.5 w-72">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            placeholder="Search room, guest, book, etc"
            className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full"
          />
        </div>
        <button className="md:hidden w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
          <Search className="w-5 h-5" />
        </button>

        <div className="relative">
          <button className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:bg-accent transition-colors">
            <Bell className="w-5 h-5" />
          </button>
          <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-destructive rounded-full border-2 border-card" />
        </div>

        <div className="hidden sm:flex items-center gap-3 ml-2">
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-primary/20 flex items-center justify-center font-semibold text-sm text-primary">
            JD
          </div>
          <div className="hidden md:block text-right">
            <p className="text-sm font-semibold text-foreground">Jaylon Dorwart</p>
            <p className="text-xs text-muted-foreground">Admin</p>
          </div>
        </div>
      </div>
    </header>
  );
}
