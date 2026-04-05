import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, User, Mail, Phone } from "lucide-react";
import PageTransition from "@/components/shared/PageTransition";

export default function BookingDetails() {
  return (
    <PageTransition>
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-8 space-y-6">
        <div className="flex items-center gap-3 text-sm flex-wrap">
          <span className="text-muted-foreground">1. Room</span><span className="text-muted-foreground">→</span>
          <span className="text-primary font-semibold">2. Details</span><span className="text-muted-foreground">→</span>
          <span className="text-muted-foreground">3. Review</span><span className="text-muted-foreground">→</span>
          <span className="text-muted-foreground">4. Confirmation</span>
        </div>
        <div><h1 className="text-xl md:text-2xl font-bold text-foreground">Guest Details</h1><p className="text-sm text-muted-foreground mt-1">Please provide your information</p></div>
        <div className="bg-card rounded-xl border border-border p-4 md:p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="text-sm font-medium text-foreground mb-1.5 block">First Name</label><div className="relative"><User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input type="text" placeholder="John" className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" /></div></div>
            <div><label className="text-sm font-medium text-foreground mb-1.5 block">Last Name</label><input type="text" placeholder="Doe" className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" /></div>
          </div>
          <div><label className="text-sm font-medium text-foreground mb-1.5 block">Email</label><div className="relative"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input type="email" placeholder="you@example.com" className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" /></div></div>
          <div><label className="text-sm font-medium text-foreground mb-1.5 block">Phone</label><div className="relative"><Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input type="tel" placeholder="+62 812 3456 7890" className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" /></div></div>
          <div><label className="text-sm font-medium text-foreground mb-1.5 block">Special Requests <span className="text-muted-foreground font-normal">(optional)</span></label><textarea rows={3} className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none" placeholder="Any special requests..." /></div>
        </div>
        <div className="flex items-center justify-between">
          <Link to="/portal" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"><ArrowLeft className="w-4 h-4" /> Back</Link>
          <Link to="/portal/book/review" className="bg-primary text-primary-foreground px-5 md:px-6 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-2">Review Booking <ArrowRight className="w-4 h-4" /></Link>
        </div>
      </div>
    </PageTransition>
  );
}
