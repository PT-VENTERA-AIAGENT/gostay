import { Outlet } from "react-router-dom";
import AppSidebar from "./AppSidebar";
import TopBar from "./TopBar";
import MobileBottomNav from "@/components/shared/MobileBottomNav";
import RealtimeSync from "@/components/shared/RealtimeSync";

export default function StaffLayout() {
  return (
    <div className="flex min-h-screen bg-background">
      <RealtimeSync scope="staff" />
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        {/* No AnimatePresence wrapper: each page animates via its own
            <PageTransition>. Nesting that under an AnimatePresence mode="wait"
            made stagger animations occasionally not fire, leaving content stuck
            at opacity 0 (the "blank until refresh" bug). */}
        <main className="flex-1 overflow-auto pb-16 md:pb-0">
          <Outlet />
        </main>
      </div>
      <MobileBottomNav />
    </div>
  );
}
