import { LayoutDashboard, Building2, BedDouble, CalendarCheck, ConciergeBell, Target, Megaphone, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";

// Platform console = Ventera super-admin, cross-hotel. Deliberately a SEPARATE
// shell (its own dark-slate sidebar, "Platform Ventera" brand) so it never reads
// like a single hotel's dashboard.
const items = [
  { icon: LayoutDashboard, label: "Ringkasan", path: "/platform" },
  { icon: Building2, label: "Hotel", path: "/platform/hotels" },
  { icon: BedDouble, label: "Ketersediaan Kamar", path: "/platform/rooms" },
  { icon: CalendarCheck, label: "Reservasi", path: "/platform/reservations" },
  { icon: ConciergeBell, label: "Permintaan Tamu", path: "/platform/requests" },
  { icon: Target, label: "Lead Gen", path: "/admin/leads" },
  { icon: Megaphone, label: "Kampanye", path: "/admin/campaigns" },
];

export default function PlatformSidebar() {
  const { pathname } = useLocation();
  const isActive = (path: string) =>
    path === "/platform" ? pathname === "/platform" : pathname.startsWith(path);

  return (
    <aside className="hidden md:flex flex-col sticky top-0 h-screen self-start w-60 shrink-0 bg-slate-900 text-slate-100 px-3 py-6 overflow-y-auto">
      <div className="flex items-center gap-2 px-2 mb-8">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
          <span className="text-primary-foreground font-bold text-sm">V</span>
        </div>
        <div className="leading-tight">
          <p className="text-sm font-bold tracking-tight">Platform Ventera</p>
          <p className="text-[11px] text-slate-400">Super Admin</p>
        </div>
      </div>

      <nav className="flex-1 flex flex-col gap-1">
        {items.map((item) => (
          <motion.div key={item.label} whileHover={{ x: 2 }} whileTap={{ scale: 0.97 }}>
            <Link
              to={item.path}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive(item.path)
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              )}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              <span>{item.label}</span>
            </Link>
          </motion.div>
        ))}
      </nav>

      <Link
        to="/dashboard"
        className="mt-4 pt-4 border-t border-slate-800 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-5 h-5 shrink-0" /> Kembali ke Hotel
      </Link>
    </aside>
  );
}
