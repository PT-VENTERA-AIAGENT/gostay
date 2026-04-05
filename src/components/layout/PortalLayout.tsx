import { Outlet, Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { User, Calendar, MessageSquare, Search, Menu, X } from "lucide-react";
import ChatWidget from "@/components/portal/ChatWidget";
import PortalBottomNav from "@/components/shared/PortalBottomNav";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const portalNav = [
  { label: "Home", path: "/portal", icon: Search },
  { label: "My Bookings", path: "/portal/my-account", icon: Calendar },
  { label: "Messages", path: "/portal/chat", icon: MessageSquare },
  { label: "Account", path: "/portal/profile", icon: User },
];

export default function PortalLayout() {
  const { pathname } = useLocation();
  const [mobileMenu, setMobileMenu] = useState(false);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="bg-card border-b border-border px-4 md:px-8 py-3 md:py-4 flex items-center justify-between">
        <Link to="/portal" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">B</span>
          </div>
          <span className="text-lg font-bold text-foreground tracking-tight">BookMe</span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {portalNav.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                pathname === item.path || (item.path !== "/portal" && pathname.startsWith(item.path))
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 md:gap-3">
          <Link to="/login" className="hidden md:inline text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Sign In
          </Link>
          <Link to="/register" className="hidden sm:inline text-sm font-medium bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:opacity-90 transition-opacity">
            Register
          </Link>
          <button className="md:hidden w-9 h-9 flex items-center justify-center text-muted-foreground" onClick={() => setMobileMenu(!mobileMenu)}>
            {mobileMenu ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileMenu && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="md:hidden bg-card border-b border-border overflow-hidden"
          >
            <div className="px-4 py-3 space-y-1">
              {portalNav.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenu(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    pathname === item.path ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </Link>
              ))}
              <div className="flex gap-2 pt-2 border-t border-border">
                <Link to="/login" className="flex-1 text-center text-sm font-medium text-muted-foreground py-2 rounded-lg hover:bg-muted" onClick={() => setMobileMenu(false)}>Sign In</Link>
                <Link to="/register" className="flex-1 text-center text-sm font-medium bg-primary text-primary-foreground py-2 rounded-lg" onClick={() => setMobileMenu(false)}>Register</Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main */}
      <main className="flex-1 pb-16 md:pb-0">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="hidden md:block bg-card border-t border-border px-8 py-8">
        <div className="max-w-6xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-xs">B</span>
              </div>
              <span className="font-bold text-foreground">BookMe</span>
            </div>
            <p className="text-sm text-muted-foreground">Your perfect stay awaits. Book directly for the best rates and exclusive perks.</p>
          </div>
          <div>
            <h4 className="font-semibold text-foreground text-sm mb-3">Quick Links</h4>
            <div className="space-y-2 text-sm text-muted-foreground">
              <Link to="/portal" className="block hover:text-foreground transition-colors">Home</Link>
              <Link to="/portal/my-account" className="block hover:text-foreground transition-colors">My Bookings</Link>
              <Link to="/portal/chat" className="block hover:text-foreground transition-colors">Contact Us</Link>
            </div>
          </div>
          <div>
            <h4 className="font-semibold text-foreground text-sm mb-3">Contact</h4>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>+62 21 1234 5678</p>
              <p>info@bookme.id</p>
              <p>Jl. Hotel No. 1, Jakarta</p>
            </div>
          </div>
          <div>
            <h4 className="font-semibold text-foreground text-sm mb-3">Policies</h4>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="hover:text-foreground transition-colors cursor-pointer">Privacy Policy</p>
              <p className="hover:text-foreground transition-colors cursor-pointer">Terms of Service</p>
              <p className="hover:text-foreground transition-colors cursor-pointer">Cancellation Policy</p>
            </div>
          </div>
        </div>
        <div className="max-w-6xl mx-auto mt-6 pt-6 border-t border-border text-center text-sm text-muted-foreground">
          © 2026 BookMe Hotel. All rights reserved.
        </div>
      </footer>

      <PortalBottomNav />
      <ChatWidget />
    </div>
  );
}
