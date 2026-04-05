import { Link } from "react-router-dom";
import { ArrowLeft, Phone, PhoneIncoming, PhoneOutgoing, Flag, User, CalendarPlus, Search } from "lucide-react";
import PageTransition from "@/components/shared/PageTransition";

export default function NewCallLog() {
  return (
    <PageTransition>
      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        <div className="flex items-center gap-4">
          <Link to="/calls" className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">Log a Call</h1>
            <p className="text-sm text-muted-foreground">Record an inbound or outbound phone call</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          <div className="lg:col-span-2 space-y-4 md:space-y-6">
            <div className="bg-card rounded-xl border border-border p-4 md:p-5">
              <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2"><Phone className="w-4 h-4" /> Call Information</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Phone Number</label>
                  <div className="relative"><Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input type="tel" placeholder="+62 812 3456 7890" className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" /></div>
                  <p className="text-xs text-muted-foreground mt-1.5">Auto-lookup will search for existing customer</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Direction</label>
                  <div className="flex gap-2">
                    <button className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 border-primary bg-primary/5 text-sm font-medium text-primary"><PhoneIncoming className="w-4 h-4" /> Inbound</button>
                    <button className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"><PhoneOutgoing className="w-4 h-4" /> Outbound</button>
                  </div>
                </div>
                <div><label className="text-sm font-medium text-foreground mb-1.5 block">Date & Time</label><input type="datetime-local" className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" /></div>
                <div><label className="text-sm font-medium text-foreground mb-1.5 block">Duration (mm:ss)</label><input type="text" placeholder="05:30" className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" /></div>
              </div>
            </div>

            <div className="bg-card rounded-xl border border-border p-4 md:p-5">
              <h2 className="font-semibold text-foreground mb-4">Call Summary</h2>
              <textarea rows={4} className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none" placeholder="Summarize what was discussed..." />
            </div>

            <div className="bg-card rounded-xl border border-border p-4 md:p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-foreground flex items-center gap-2"><Flag className="w-4 h-4" /> Follow-up</h2>
                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="w-4 h-4 rounded border-border text-primary focus:ring-ring" /><span className="text-sm text-foreground">Flag for follow-up</span></label>
              </div>
              <div><label className="text-sm font-medium text-foreground mb-1.5 block">Follow-up Date</label><input type="date" className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" /></div>
            </div>
          </div>

          <div className="space-y-4 md:space-y-6">
            <div className="bg-card rounded-xl border border-border p-4 md:p-5">
              <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2"><User className="w-4 h-4" /> Customer Match</h2>
              <div className="text-center py-6"><Search className="w-8 h-8 text-muted-foreground mx-auto mb-2" /><p className="text-sm text-muted-foreground">Enter phone to search customers</p></div>
            </div>
            <div className="bg-card rounded-xl border border-border p-4 md:p-5">
              <h2 className="font-semibold text-foreground mb-4">Quick Actions</h2>
              <Link to="/bookings/new" className="w-full flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors"><CalendarPlus className="w-4 h-4" /> Create Booking from Call</Link>
            </div>
            <button className="w-full bg-primary text-primary-foreground py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity">Save Call Log</button>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
