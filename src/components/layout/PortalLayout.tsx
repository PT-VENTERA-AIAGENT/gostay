import { Outlet, Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { User, Calendar, MessageSquare, Search } from "lucide-react";

const portalNav = [
  { label: "Home", path: "/portal", icon: Search },
  { label: "My Bookings", path: "/portal/my-account", icon: Calendar },
  { label: "Messages", path: "/portal/chat", icon: MessageSquare },
  { label: "Account", path: "/portal/profile", icon: User },
];

export default function PortalLayout() {
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="bg-card border-b border-border px-8 py-4 flex items-center justify-between">
        <Link to="/portal" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">B</span>
          </div>
          <span className="text-lg font-bold text-foreground tracking-tight">BookMe</span>
        </Link>

        <nav className="flex items-center gap-1">
          {portalNav.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                pathname === item.path || (item.path !== "/portal" && pathname.startsWith(item.path))
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link to="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Sign In
          </Link>
          <Link to="/register" className="text-sm font-medium bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:opacity-90 transition-opacity">
            Register
          </Link>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="bg-card border-t border-border px-8 py-6 text-center text-sm text-muted-foreground">
        © 2026 BookMe Hotel. All rights reserved.
      </footer>
    </div>
  );
}
