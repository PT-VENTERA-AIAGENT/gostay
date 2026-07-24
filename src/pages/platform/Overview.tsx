import { Link } from "react-router-dom";
import {
  Building2, Radio, CalendarCheck, ConciergeBell, MessageCircle, BedDouble, Wallet,
} from "lucide-react";
import PageTransition from "@/components/shared/PageTransition";
import { tr } from "@/lib/i18n";
import {
  usePlatformHotels, usePlatformReservations, usePlatformGuestRequests,
  usePlatformRoomAvailability, usePlatformBalances,
} from "@/hooks/usePlatform";
import {
  PageHeader, StatCard, Table, Th, Td, EmptyState, StatusBadge, formatIDR,
} from "@/components/platform/widgets";

function todayISO() { return new Date().toISOString().slice(0, 10); }

export default function PlatformOverview() {
  const { data: hotels = [] } = usePlatformHotels();
  const { data: reservations = [] } = usePlatformReservations();
  const { data: requests = [] } = usePlatformGuestRequests();
  const { data: availability = [] } = usePlatformRoomAvailability(todayISO());
  const { data: balances = [] } = usePlatformBalances();

  const liveHotels = hotels.filter((h) => h.mode === "live" && h.payments_active).length;
  const testHotels = hotels.filter((h) => h.mode !== "live" && h.payments_active).length;
  const offHotels = hotels.filter((h) => !h.payments_active).length;
  const waLinked = hotels.filter((h) => h.wa_linked).length;
  const openReq = requests.filter((r) => r.status === "open" || r.status === "in_progress").length;
  const revToday = reservations
    .filter((r) => new Date(r.created_at).toDateString() === new Date().toDateString())
    .reduce((s, r) => s + r.total_amount, 0);
  const roomsAvail = availability.reduce((s, r) => s + r.available, 0);
  const roomsTotal = availability.reduce((s, r) => s + r.total, 0);
  const totalBalance = balances.reduce((s, b) => s + b.balance, 0);
  const pendingPayout = balances.reduce((s, b) => s + b.pending_payout, 0);

  const recentReservations = reservations.slice(0, 6);
  const recentRequests = requests.slice(0, 6);

  const dist = [
    { label: "Live", value: liveHotels, tone: "text-success" },
    { label: "Test", value: testHotels, tone: "text-warning" },
    { label: "Off", value: offHotels, tone: "text-muted-foreground" },
  ];

  return (
    <PageTransition>
      <PageHeader
        icon={<Radio className="w-5 h-5" />}
        title={tr("Ringkasan Platform")}
        description={tr("Pantauan lintas hotel untuk super admin Ventera.")}
      />

      <div className="space-y-6 p-4 md:p-6">
        {/* KPI utama */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <StatCard label={tr("Hotel")} value={hotels.length} sub={`${liveHotels} Live`} to="/platform/hotels" icon={<Building2 className="w-4 h-4" />} />
          <StatCard label={tr("Kamar tersedia hari ini")} value={`${roomsAvail}/${roomsTotal}`} to="/platform/rooms" icon={<BedDouble className="w-4 h-4" />} />
          <StatCard label={tr("WhatsApp tertaut")} value={`${waLinked}/${hotels.length}`} sub={tr("hotel")} to="/platform/hotels" icon={<MessageCircle className="w-4 h-4" />} />
          <StatCard label={tr("Saldo semua hotel")} value={formatIDR(totalBalance)} sub={pendingPayout > 0 ? `${formatIDR(pendingPayout)} ${tr("menunggu penarikan")}` : undefined} to="/platform/balances" icon={<Wallet className="w-4 h-4" />} />
        </div>

        {/* KPI sekunder */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          <StatCard label={tr("Reservasi (terbaru)")} value={reservations.length} sub={`${formatIDR(revToday)} ${tr("hari ini")}`} to="/platform/reservations" icon={<CalendarCheck className="w-4 h-4" />} />
          <StatCard label={tr("Permintaan tamu aktif")} value={openReq} sub={tr("perlu ditangani")} to="/platform/requests" icon={<ConciergeBell className="w-4 h-4" />} />
          <StatCard label={tr("Kalender hunian")} value={`${roomsTotal - roomsAvail}/${roomsTotal}`} sub={tr("terisi malam ini")} to="/platform/calendar" icon={<BedDouble className="w-4 h-4" />} />
        </div>

        {/* Distribusi mode pembayaran */}
        <div>
          <h2 className="mb-2 text-sm font-semibold text-foreground">{tr("Distribusi Mode Pembayaran")}</h2>
          <div className="grid grid-cols-3 gap-3 md:gap-4">
            {dist.map((d) => (
              <div key={d.label} className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
                <span className={`text-sm font-medium ${d.tone}`}>{d.label}</span>
                <span className="text-2xl font-bold tabular-nums text-foreground">{d.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Aktivitas terbaru */}
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">{tr("Reservasi Terbaru")}</h2>
              <Link to="/platform/reservations" className="text-xs font-medium text-primary hover:underline">{tr("Lihat semua")}</Link>
            </div>
            {recentReservations.length === 0 ? (
              <EmptyState message={tr("Belum ada reservasi")} />
            ) : (
              <Table>
                <thead><tr><Th>{tr("Hotel")}</Th><Th>{tr("Tamu")}</Th><Th className="text-right">{tr("Total")}</Th><Th>Status</Th></tr></thead>
                <tbody>
                  {recentReservations.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/30">
                      <Td className="font-medium text-foreground">{r.hotel}</Td>
                      <Td>{r.guest}</Td>
                      <Td className="text-right tabular-nums">{formatIDR(r.total_amount)}</Td>
                      <Td><StatusBadge status={r.status} /></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">{tr("Permintaan Tamu Terbaru")}</h2>
              <Link to="/platform/requests" className="text-xs font-medium text-primary hover:underline">{tr("Lihat semua")}</Link>
            </div>
            {recentRequests.length === 0 ? (
              <EmptyState message={tr("Belum ada permintaan")} />
            ) : (
              <Table>
                <thead><tr><Th>{tr("Hotel")}</Th><Th>{tr("Permintaan")}</Th><Th>Status</Th></tr></thead>
                <tbody>
                  {recentRequests.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/30">
                      <Td className="font-medium text-foreground">{r.hotel}</Td>
                      <Td className="max-w-[180px] truncate">{r.title}</Td>
                      <Td><StatusBadge status={r.status} /></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
