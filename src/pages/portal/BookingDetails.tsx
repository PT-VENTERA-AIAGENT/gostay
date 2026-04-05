import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, User, Mail, Phone, Check } from "lucide-react";
import { motion } from "framer-motion";
import PageTransition from "@/components/shared/PageTransition";

const steps = [
  { num: 1, label: "Room", done: true },
  { num: 2, label: "Details", active: true },
  { num: 3, label: "Review" },
  { num: 4, label: "Confirmation" },
];

export default function BookingDetails() {
  return (
    <PageTransition>
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-8 space-y-6">
        {/* Progress steps */}
        <div className="flex items-center justify-between">
          {steps.map((step, i) => (
            <div key={step.num} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                step.done ? "bg-primary text-primary-foreground" :
                step.active ? "bg-primary text-primary-foreground ring-4 ring-primary/20" :
                "bg-muted text-muted-foreground"
              }`}>
                {step.done ? <Check className="w-4 h-4" /> : step.num}
              </div>
              <span className={`text-sm font-medium hidden sm:inline ${step.active ? "text-primary" : step.done ? "text-foreground" : "text-muted-foreground"}`}>{step.label}</span>
              {i < steps.length - 1 && <div className={`w-8 sm:w-16 h-0.5 ml-2 ${step.done ? "bg-primary" : "bg-muted"}`} />}
            </div>
          ))}
        </div>

        <div><h1 className="text-xl md:text-2xl font-bold text-foreground">Guest Details</h1><p className="text-sm text-muted-foreground mt-1">Please provide your information</p></div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-xl border border-border p-4 md:p-6 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="text-sm font-medium text-foreground mb-1.5 block">First Name</label><div className="relative"><User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input type="text" placeholder="John" className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" /></div></div>
            <div><label className="text-sm font-medium text-foreground mb-1.5 block">Last Name</label><input type="text" placeholder="Doe" className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" /></div>
          </div>
          <div><label className="text-sm font-medium text-foreground mb-1.5 block">Email</label><div className="relative"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input type="email" placeholder="you@example.com" className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" /></div></div>
          <div><label className="text-sm font-medium text-foreground mb-1.5 block">Phone</label><div className="relative"><Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input type="tel" placeholder="+62 812 3456 7890" className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" /></div></div>
          <div><label className="text-sm font-medium text-foreground mb-1.5 block">Special Requests <span className="text-muted-foreground font-normal">(optional)</span></label><textarea rows={3} className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none" placeholder="Any special requests..." /></div>
        </motion.div>

        <div className="flex items-center justify-between">
          <Link to="/portal" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors btn-press"><ArrowLeft className="w-4 h-4" /> Back</Link>
          <motion.div whileTap={{ scale: 0.98 }}>
            <Link to="/portal/book/review" className="bg-primary text-primary-foreground px-5 md:px-6 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-2 touch-target">Review Booking <ArrowRight className="w-4 h-4" /></Link>
          </motion.div>
        </div>
      </div>
    </PageTransition>
  );
}
