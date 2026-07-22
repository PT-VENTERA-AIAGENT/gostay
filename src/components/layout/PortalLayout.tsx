import { Outlet, Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { User, Calendar, MessageSquare, Search, Menu, X, LogOut, UtensilsCrossed, MapPinned } from "lucide-react";
import ChatWidget from "@/components/portal/ChatWidget";
import PortalBottomNav from "@/components/shared/PortalBottomNav";
import ThemeToggle from "@/components/shared/ThemeToggle";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/hooks/useTenant";
import RealtimeSync from "@/components/shared/RealtimeSync";
import LanguageToggle from "@/components/shared/LanguageToggle";
import { useT } from "@/lib/i18n";

const portalNav = [
  { label: "Beranda", path: "/portal", icon: Search },
  { label: "Denah Hotel", path: "/portal/denah", icon: MapPinned },
  { label: "Booking Saya", path: "/portal/my-account", icon: Calendar },
  { label: "Room Service", path: "/portal/order", icon: UtensilsCrossed },
  { label: "Pesan", path: "/portal/chat", icon: MessageSquare },
  { label: "Akun", path: "/portal/profile", icon: User },
];

export default function PortalLayout() {
  const { pathname } = useLocation();
  const [mobileMenu, setMobileMenu] = useState(false);
  const { session, user, signOut } = useAuth();
  const { name: hotelName, initial: hotelInitial, tenant } = useTenant();
  const t = useT();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {session && <RealtimeSync scope="guest" />}
      {/* Header */}
      <header className="bg-card border-b border-border px-4 md:px-8 py-3 md:py-4 flex items-center justify-between sticky top-0 z-30 backdrop-blur-sm bg-card/95">
        <Link to="/portal" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center overflow-hidden">
            {tenant?.logo_url ? (
              <img src={tenant.logo_url} alt={hotelName} className="w-full h-full object-cover" />
            ) : (
              <span className="text-primary-foreground font-bold text-sm">{hotelInitial}</span>
            )}
          </div>
          <span className="text-lg font-bold text-foreground tracking-tight">{hotelName}</span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {portalNav.map((item) => {
            const active = pathname === item.path || (item.path !== "/portal" && pathname.startsWith(item.path));
            return (
              <Link
                key={item.path}
                to={item.path}
                title={t(item.label)}
                className={cn(
                  "relative flex items-center gap-2 px-3 lg:px-4 py-2 rounded-lg text-sm font-medium transition-colors btn-press",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                {/* Labels only from lg — at md the header (logo + 4 labelled
                    links + name + Keluar) ran past the viewport. */}
                <span className="hidden lg:inline">{t(item.label)}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 md:gap-3">
          <LanguageToggle />
          <ThemeToggle />
          {/* There is no "Register": Ventera SSO owns the accounts, so signing
              in is the only door — the old button led to a form that always
              failed with "Use SSO login". The header also used to offer Masuk
              to people who were already signed in. */}
          {session ? (
            <>
              <Link
                to="/portal/my-account"
                className="hidden lg:inline text-sm font-medium text-muted-foreground hover:text-foreground transition-colors max-w-[160px] truncate"
              >
                {user?.name ?? user?.email}
              </Link>
              <button
                onClick={signOut}
                className="hidden sm:inline-flex items-center gap-2 text-sm font-medium border border-border px-4 py-2 rounded-lg hover:bg-muted transition-colors btn-press"
              >
                <LogOut className="w-4 h-4" /> {t("Keluar")}
              </button>
            </>
          ) : (
            <Link to="/login" className="hidden sm:inline text-sm font-medium bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:opacity-90 transition-opacity btn-press">
              {t("Masuk")}
            </Link>
          )}
          <button className="md:hidden w-9 h-9 flex items-center justify-center text-muted-foreground touch-target" onClick={() => setMobileMenu(!mobileMenu)}>
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
            transition={{ duration: 0.2 }}
            className="md:hidden bg-card border-b border-border overflow-hidden z-20"
          >
            <div className="px-4 py-3 space-y-1">
              {portalNav.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenu(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors touch-target",
                    pathname === item.path ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  <item.icon className="w-4 h-4" />
                  {t(item.label)}
                </Link>
              ))}
              <div className="flex gap-2 pt-2 border-t border-border">
                {session ? (
                  <button
                    onClick={() => { setMobileMenu(false); signOut(); }}
                    className="flex-1 text-center text-sm font-medium border border-border py-2.5 rounded-lg hover:bg-muted touch-target"
                  >
                    {t("Keluar")}
                  </button>
                ) : (
                  <Link to="/login" className="flex-1 text-center text-sm font-medium bg-primary text-primary-foreground py-2.5 rounded-lg touch-target" onClick={() => setMobileMenu(false)}>{t("Masuk")}</Link>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main. No AnimatePresence wrapper here: each page already animates via
          its own <PageTransition>, and nesting that inside an AnimatePresence
          mode="wait" made the pages' stagger animations occasionally fail to
          fire, leaving content stuck at opacity 0 — the "blank until refresh"
          bug. Routing remounts the Outlet subtree per navigation anyway. */}
      <main className="flex-1 pb-16 md:pb-0">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="hidden md:block bg-card border-t border-border px-8 py-8">
        <div className="max-w-6xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center overflow-hidden">
                {tenant?.logo_url ? (
                  <img src={tenant.logo_url} alt={hotelName} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-primary-foreground font-bold text-xs">{hotelInitial}</span>
                )}
              </div>
              <span className="font-bold text-foreground">{hotelName}</span>
            </div>
            <p className="text-sm text-muted-foreground">{t("Menginap sempurnamu menanti. Booking langsung untuk harga terbaik dan keuntungan eksklusif.")}</p>
          </div>
          <div>
            <h4 className="font-semibold text-foreground text-sm mb-3">{t("Tautan Cepat")}</h4>
            <div className="space-y-2 text-sm text-muted-foreground">
              <Link to="/portal" className="block hover:text-foreground transition-colors">{t("Beranda")}</Link>
              <Link to="/portal/my-account" className="block hover:text-foreground transition-colors">{t("Booking Saya")}</Link>
              <Link to="/portal/chat" className="block hover:text-foreground transition-colors">{t("Hubungi Kami")}</Link>
            </div>
          </div>
          <div>
            <h4 className="font-semibold text-foreground text-sm mb-3">{t("Kontak")}</h4>
            <div className="space-y-2 text-sm text-muted-foreground">
              {(() => {
                const phone = tenant?.phone ?? "+62 21 1234 5678";
                const email = tenant?.email ?? "info@gostay.id";
                const address = tenant?.address ?? "Jl. Hotel No. 1, Jakarta";
                return (
                  <>
                    <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="block hover:text-foreground transition-colors">{phone}</a>
                    <a href={`mailto:${email}`} className="block hover:text-foreground transition-colors">{email}</a>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="block hover:text-foreground transition-colors"
                    >
                      {address}
                    </a>
                  </>
                );
              })()}
            </div>
          </div>
          <div>
            <h4 className="font-semibold text-foreground text-sm mb-3">{t("Kebijakan")}</h4>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="hover:text-foreground transition-colors cursor-pointer">{t("Kebijakan Privasi")}</p>
              <p className="hover:text-foreground transition-colors cursor-pointer">{t("Syarat Layanan")}</p>
              <p className="hover:text-foreground transition-colors cursor-pointer">{t("Kebijakan Pembatalan")}</p>
            </div>
          </div>
        </div>
        <div className="max-w-6xl mx-auto mt-6 pt-6 border-t border-border text-center text-sm text-muted-foreground">
          &copy; 2026 {hotelName}. {t("Semua hak dilindungi.")}
        </div>
      </footer>

      <PortalBottomNav />
      <ChatWidget />
    </div>
  );
}
