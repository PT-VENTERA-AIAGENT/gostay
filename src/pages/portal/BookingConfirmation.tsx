import { Link } from "react-router-dom";
import { CheckCircle, Mail, Calendar, Home } from "lucide-react";
import PageTransition, { scaleIn } from "@/components/shared/PageTransition";
import { motion } from "framer-motion";

export default function BookingConfirmation() {
  return (
    <PageTransition>
      <div className="max-w-lg mx-auto px-4 md:px-8 py-12 md:py-16 text-center space-y-6">
        <motion.div variants={scaleIn} initial="hidden" animate="show" className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mx-auto">
          <CheckCircle className="w-8 h-8 text-success" />
        </motion.div>
        <div><h1 className="text-2xl font-bold text-foreground">Booking Confirmed!</h1><p className="text-muted-foreground mt-2">Your reservation has been successfully created</p></div>
        <div className="bg-card rounded-xl border border-border p-5 md:p-6 text-left space-y-3">
          <div className="text-center mb-4"><p className="text-sm text-muted-foreground">Booking Reference</p><p className="text-2xl font-bold font-mono text-primary">BK-20260410-X7Y8</p></div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-muted-foreground">Room</span><p className="font-medium text-foreground mt-0.5">Deluxe Room</p></div>
            <div><span className="text-muted-foreground">Dates</span><p className="font-medium text-foreground mt-0.5">Apr 10 – Apr 13, 2026</p></div>
            <div><span className="text-muted-foreground">Guests</span><p className="font-medium text-foreground mt-0.5">2 Adults</p></div>
            <div><span className="text-muted-foreground">Total</span><p className="font-medium text-primary mt-0.5">IDR 3,750,000</p></div>
          </div>
        </div>
        <div className="flex items-center gap-2 justify-center text-sm text-muted-foreground"><Mail className="w-4 h-4" /><span>Confirmation sent to john@example.com</span></div>
        <div className="flex flex-col sm:flex-row items-center gap-3 justify-center">
          <Link to="/portal/my-account" className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors"><Calendar className="w-4 h-4" /> My Bookings</Link>
          <Link to="/portal" className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"><Home className="w-4 h-4" /> Back to Home</Link>
        </div>
      </div>
    </PageTransition>
  );
}
