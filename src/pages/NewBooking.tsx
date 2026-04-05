import { Link } from "react-router-dom";
import { ArrowLeft, Search, User, Calendar, MapPin } from "lucide-react";
import PageTransition from "@/components/shared/PageTransition";

export default function NewBooking() {
  return (
    <PageTransition>
      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        <div className="flex items-center gap-4">
          <Link to="/bookings" className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">New Booking</h1>
            <p className="text-sm text-muted-foreground">Create a reservation for a walk-in or phone guest</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          <div className="lg:col-span-2 space-y-4 md:space-y-6">
            <div className="bg-card rounded-xl border border-border p-4 md:p-5">
              <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2"><User className="w-4 h-4" /> Guest Information</h2>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4">
                <div className="flex items-center gap-2 bg-background border border-input rounded-lg px-4 py-2.5 flex-1 w-full">
                  <Search className="w-4 h-4 text-muted-foreground" />
                  <input placeholder="Search existing guest..." className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full" />
                </div>
                <button className="text-sm text-primary font-medium hover:underline whitespace-nowrap">New Guest</button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="text-sm font-medium text-foreground mb-1.5 block">Full Name</label><input type="text" className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" placeholder="Guest name" /></div>
                <div><label className="text-sm font-medium text-foreground mb-1.5 block">Email</label><input type="email" className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" placeholder="guest@email.com" /></div>
                <div><label className="text-sm font-medium text-foreground mb-1.5 block">Phone</label><input type="tel" className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" placeholder="+62..." /></div>
                <div><label className="text-sm font-medium text-foreground mb-1.5 block">Nationality</label><input type="text" className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" placeholder="Indonesia" /></div>
              </div>
            </div>

            <div className="bg-card rounded-xl border border-border p-4 md:p-5">
              <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2"><Calendar className="w-4 h-4" /> Stay Details</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="text-sm font-medium text-foreground mb-1.5 block">Check-in Date</label><input type="date" className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" /></div>
                <div><label className="text-sm font-medium text-foreground mb-1.5 block">Check-out Date</label><input type="date" className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" /></div>
                <div><label className="text-sm font-medium text-foreground mb-1.5 block">Adults</label><input type="number" defaultValue={1} min={1} className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" /></div>
                <div><label className="text-sm font-medium text-foreground mb-1.5 block">Children</label><input type="number" defaultValue={0} min={0} className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" /></div>
              </div>
            </div>

            <div className="bg-card rounded-xl border border-border p-4 md:p-5">
              <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2"><MapPin className="w-4 h-4" /> Room Selection</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div><label className="text-sm font-medium text-foreground mb-1.5 block">Room Type</label><select className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"><option>Select room type...</option><option>Standard Room</option><option>Deluxe Room</option><option>Suite</option><option>Family Room</option><option>Presidential Suite</option></select></div>
                <div><label className="text-sm font-medium text-foreground mb-1.5 block">Specific Room</label><select className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"><option>Auto-assign</option><option>Room 101</option><option>Room 104</option><option>Room 201</option></select></div>
              </div>
              <div><label className="text-sm font-medium text-foreground mb-1.5 block">Special Requests</label><textarea rows={3} className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none" placeholder="Any special requests..." /></div>
            </div>

            <div className="bg-card rounded-xl border border-border p-4 md:p-5">
              <h2 className="font-semibold text-foreground mb-4">Internal Notes</h2>
              <textarea rows={2} className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none" placeholder="Staff-only notes..." />
            </div>
          </div>

          <div>
            <div className="bg-card rounded-xl border border-border p-4 md:p-5 sticky top-6">
              <h2 className="font-semibold text-foreground mb-4">Price Summary</h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between text-muted-foreground"><span>Room type</span><span>—</span></div>
                <div className="flex justify-between text-muted-foreground"><span>Dates</span><span>—</span></div>
                <div className="flex justify-between text-muted-foreground"><span>Nights</span><span>—</span></div>
                <div className="flex justify-between text-muted-foreground"><span>Rate / night</span><span>—</span></div>
                <div className="border-t border-border pt-3 flex justify-between font-semibold text-foreground"><span>Total</span><span>—</span></div>
              </div>
              <button className="w-full bg-primary text-primary-foreground py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity mt-6">Create Booking</button>
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
