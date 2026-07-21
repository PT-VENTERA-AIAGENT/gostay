import { Link, useLocation } from "react-router-dom";
import { Search, Calendar, MessageSquare, User, UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

const nav = [
  { icon: Search, label: "Beranda", path: "/portal" },
  { icon: Calendar, label: "Booking", path: "/portal/my-account" },
  { icon: UtensilsCrossed, label: "Layanan", path: "/portal/order" },
  { icon: MessageSquare, label: "Pesan", path: "/portal/chat" },
  { icon: User, label: "Akun", path: "/portal/profile" },
];

export default function PortalBottomNav() {
  const { pathname } = useLocation();
  const t = useT();

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
              {t(item.label)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
