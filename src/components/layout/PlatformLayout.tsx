import { Outlet, Link, useLocation } from "react-router-dom";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import PlatformSidebar from "./PlatformSidebar";
import RealtimeSync from "@/components/shared/RealtimeSync";
import { useAuth } from "@/contexts/AuthContext";
import { tr } from "@/lib/i18n";

// Separate shell for the Ventera platform console (operator-only). Intentionally
// does NOT render the hotel AppSidebar/TopBar — the whole point (035) is that the
// cross-hotel super-admin world is distinct from a single hotel's dashboard.
// An operator (e.g. rafli.ventera) has TWO modes: here they monitor every hotel;
// on /dashboard they act as staff of their own hotel to view/test the hotel side.
export default function PlatformLayout() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const operator = user?.name || user?.email || null;

  return (
    <div className="flex min-h-screen bg-background">
      <RealtimeSync scope="staff" />
      <PlatformSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Desktop topbar — makes the "you are in the cross-hotel console" mode
            unmistakable, and carries the operator identity + a way back to the
            hotel side. Mirrors Chatly's "Platform Console · Full Access" bar. */}
        <header className="hidden md:flex h-16 shrink-0 items-center justify-between border-b border-border bg-card px-6">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{tr("Konsol Platform")}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
              <ShieldCheck className="w-3 h-3" /> {tr("Akses Penuh")}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {operator && <span className="text-xs text-muted-foreground">{operator}</span>}
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> {tr("Mode Staf Hotel")}
            </Link>
          </div>
        </header>

        {/* Compact mobile header with a back-to-hotel link */}
        <div className="md:hidden flex items-center justify-between px-4 h-14 border-b border-border bg-slate-900 text-slate-100">
          <span className="font-bold text-sm">{tr("Konsol Platform")}</span>
          <Link to="/dashboard" className="text-xs flex items-center gap-1 text-slate-300"><ArrowLeft className="w-4 h-4" /> Hotel</Link>
        </div>
        <main className="flex-1 overflow-auto" key={pathname}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
