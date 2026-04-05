import { Link } from "react-router-dom";
import { Calendar, Settings, Eye, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import PageTransition, { staggerContainer, staggerItem } from "@/components/shared/PageTransition";

const myBookings = [
  { id: "1", reference: "BK-20260410-X7Y8", roomType: "Deluxe Room", checkIn: "Apr 10, 2026", checkOut: "Apr 13, 2026", status: "confirmed", total: "IDR 3,750,000" },
  { id: "2", reference: "BK-20260301-A1B2", roomType: "Standard Room", checkIn: "Mar 1, 2026", checkOut: "Mar 3, 2026", status: "checked_out", total: "IDR 1,700,000" },
  { id: "3", reference: "BK-20260215-C3D4", roomType: "Suite", checkIn: "Feb 15, 2026", checkOut: "Feb 18, 2026", status: "checked_out", total: "IDR 7,500,000" },
  { id: "4", reference: "BK-20260120-E5F6", roomType: "Deluxe Room", checkIn: "Jan 20, 2026", checkOut: "Jan 22, 2026", status: "cancelled", total: "IDR 2,500,000" },
];
const statusConfig: Record<string, { label: string; cls: string }> = { confirmed: { label: "Upcoming", cls: "bg-info/10 text-info" }, checked_in: { label: "In Stay", cls: "bg-primary/10 text-primary" }, checked_out: { label: "Completed", cls: "bg-muted text-muted-foreground" }, cancelled: { label: "Cancelled", cls: "bg-destructive/10 text-destructive" } };

export default function MyAccount() {
  const upcoming = myBookings.filter((b) => b.status === "confirmed" || b.status === "checked_in");
  const past = myBookings.filter((b) => b.status === "checked_out" || b.status === "cancelled");
  return (
    <PageTransition>
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-6 md:py-8 space-y-6 md:space-y-8">
        <div><h1 className="text-xl md:text-2xl font-bold text-foreground">My Account</h1><p className="text-sm text-muted-foreground mt-1">Manage your bookings and profile</p></div>
        <div className="bg-card rounded-xl border border-border p-4 md:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4"><div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-primary/20 flex items-center justify-center text-base md:text-lg font-bold text-primary">JD</div><div><p className="font-semibold text-foreground">John Doe</p><p className="text-sm text-muted-foreground">john@example.com</p><p className="text-xs text-muted-foreground mt-0.5">Member since March 2026</p></div></div>
          <div className="flex items-center gap-2"><Link to="/portal/chat" className="flex items-center gap-2 px-3 md:px-4 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"><MessageSquare className="w-4 h-4" /> <span className="hidden sm:inline">Messages</span></Link><Link to="/portal/profile" className="flex items-center gap-2 px-3 md:px-4 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"><Settings className="w-4 h-4" /> <span className="hidden sm:inline">Edit Profile</span></Link></div>
        </div>
        <div><h2 className="text-lg font-semibold text-foreground mb-4">Upcoming Stays</h2>
          {upcoming.length === 0 ? <div className="bg-card rounded-xl border border-border p-8 text-center"><Calendar className="w-10 h-10 text-muted-foreground mx-auto mb-3" /><p className="font-medium text-foreground mb-1">No upcoming bookings</p><Link to="/portal" className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity mt-3">Browse Rooms</Link></div> : (
            <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-3">{upcoming.map((b) => { const sc = statusConfig[b.status] || statusConfig.confirmed; return (<motion.div key={b.id} variants={staggerItem} className="bg-card rounded-xl border border-border p-4 md:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:shadow-sm transition-shadow"><div className="flex items-center gap-3 md:gap-4"><div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><Calendar className="w-4 h-4 md:w-5 md:h-5 text-primary" /></div><div><div className="flex items-center gap-2 flex-wrap"><p className="font-medium text-foreground">{b.roomType}</p><span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", sc.cls)}>{sc.label}</span></div><p className="text-sm text-muted-foreground">{b.checkIn} → {b.checkOut}</p><p className="text-xs text-muted-foreground mt-0.5">{b.reference}</p></div></div><div className="flex items-center gap-3 md:gap-4 self-end sm:self-auto"><span className="text-sm font-semibold text-foreground">{b.total}</span><Link to={`/portal/my-account/bookings/${b.id}`} className="text-muted-foreground hover:text-foreground transition-colors"><Eye className="w-4 h-4" /></Link></div></motion.div>); })}</motion.div>
          )}
        </div>
        <div><h2 className="text-lg font-semibold text-foreground mb-4">Past Stays</h2>
          <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-3">{past.map((b) => { const sc = statusConfig[b.status] || statusConfig.checked_out; return (<motion.div key={b.id} variants={staggerItem} className="bg-card rounded-xl border border-border p-4 md:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:shadow-sm transition-shadow"><div className="flex items-center gap-3 md:gap-4"><div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-muted flex items-center justify-center shrink-0"><Calendar className="w-4 h-4 md:w-5 md:h-5 text-muted-foreground" /></div><div><div className="flex items-center gap-2 flex-wrap"><p className="font-medium text-foreground">{b.roomType}</p><span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", sc.cls)}>{sc.label}</span></div><p className="text-sm text-muted-foreground">{b.checkIn} → {b.checkOut}</p><p className="text-xs text-muted-foreground mt-0.5">{b.reference}</p></div></div><div className="flex items-center gap-3 md:gap-4 self-end sm:self-auto"><span className="text-sm font-semibold text-foreground">{b.total}</span><Link to={`/portal/my-account/bookings/${b.id}`} className="text-muted-foreground hover:text-foreground transition-colors"><Eye className="w-4 h-4" /></Link></div></motion.div>); })}</motion.div>
        </div>
      </div>
    </PageTransition>
  );
}
