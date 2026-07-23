import { Outlet, Link, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import PlatformSidebar from "./PlatformSidebar";
import RealtimeSync from "@/components/shared/RealtimeSync";

// Separate shell for the Ventera platform console (admin-only). Intentionally
// does NOT render the hotel AppSidebar/TopBar — the whole point is that the
// super-admin, cross-hotel area is distinct from a single hotel's dashboard.
export default function PlatformLayout() {
  const { pathname } = useLocation();
  return (
    <div className="flex min-h-screen bg-background">
      <RealtimeSync scope="staff" />
      <PlatformSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Compact mobile header with a back-to-hotel link */}
        <div className="md:hidden flex items-center justify-between px-4 h-14 border-b border-border bg-slate-900 text-slate-100">
          <span className="font-bold text-sm">Platform Ventera</span>
          <Link to="/dashboard" className="text-xs flex items-center gap-1 text-slate-300"><ArrowLeft className="w-4 h-4" /> Hotel</Link>
        </div>
        <main className="flex-1 overflow-auto" key={pathname}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
