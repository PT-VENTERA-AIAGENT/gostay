import { Link, useLocation } from "react-router-dom";
import { Search, Calendar, MessageSquare, User } from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { icon: Search, label: "Home", path: "/portal" },
  { icon: Calendar, label: "Bookings", path: "/portal/my-account" },
  { icon: MessageSquare, label: "Chat", path: "/portal/chat" },
  { icon: User, label: "Account", path: "/portal/profile" },
];

export default function PortalBottomNav() {
  const { pathname } = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-sm border-t border-border z-40 md:hidden safe-area-bottom">
      <div className="flex items-center justify-around py-1.5 px-2">
        {nav.map((item) => {
          const active = item.path === "/portal" ? pathname === "/portal" : pathname.startsWith(item.path);
          return (
            <Link
              key={item.label}
              to={item.path}
              className={cn(
                "flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg text-[10px] font-medium transition-colors min-w-[56px] touch-target active:scale-95",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
