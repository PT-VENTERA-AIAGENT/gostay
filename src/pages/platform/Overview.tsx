import { Link } from "react-router-dom";
import { Building2, Radio, CalendarCheck, ConciergeBell, MessageCircle, ArrowRight } from "lucide-react";
import PageTransition from "@/components/shared/PageTransition";
import { tr } from "@/lib/i18n";
import { usePlatformHotels, usePlatformReservations, usePlatformGuestRequests } from "@/hooks/usePlatform";

function formatIDR(n: number) { return "Rp" + Math.round(n).toLocaleString("id-ID"); }

export default function PlatformOverview() {
  const { data: hotels = [] } = usePlatformHotels();
  const { data: reservations = [] } = usePlatformReservations();
  const { data: requests = [] } = usePlatformGuestRequests();

  const liveHotels = hotels.filter((h) => h.mode === "live" && h.payments_active).length;
  const waLinked = hotels.filter((h) => h.wa_linked).length;
  const openReq = requests.filter((r) => r.status === "open" || r.status === "in_progress").length;
  const revToday = reservations
    .filter((r) => new Date(r.created_at).toDateString() === new Date().toDateString())
    .reduce((s, r) => s + r.total_amount, 0);

  const cards = [
    { icon: Building2, label: tr("Hotel"), value: `${hotels.length}`, sub: `${liveHotels} Live`, to: "/platform/hotels" },
    { icon: MessageCircle, label: tr("WhatsApp tertaut"), value: `${waLinked}/${hotels.length}`, sub: tr("hotel"), to: "/platform/hotels" },
    { icon: CalendarCheck, label: tr("Reservasi (terbaru)"), value: `${reservations.length}`, sub: `${formatIDR(revToday)} ${tr("hari ini")}`, to: "/platform/reservations" },
    { icon: ConciergeBell, label: tr("Permintaan tamu aktif"), value: `${openReq}`, sub: tr("perlu ditangani"), to: "/platform/requests" },
  ];

  return (
    <PageTransition>
      <div className="p-4 md:p-6">
        <div className="mb-5">
          <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
            <Radio className="w-6 h-6 text-primary" /> {tr("Ringkasan Platform")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{tr("Pantauan lintas hotel untuk super admin Ventera.")}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
          {cards.map((c) => (
            <Link key={c.label} to={c.to}
              className="bg-card rounded-xl border border-border p-4 hover:border-primary/40 transition-colors group">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <c.icon className="w-4 h-4" /> <span className="text-xs">{c.label}</span>
                <ArrowRight className="w-3.5 h-3.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <p className="text-2xl font-bold text-foreground">{c.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{c.sub}</p>
            </Link>
          ))}
        </div>
      </div>
    </PageTransition>
  );
}
