import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft, Loader2, BedDouble, CalendarCheck, Users, Wallet,
  MessageCircle, ShieldCheck, FlaskConical, Ban, ExternalLink,
} from "lucide-react";
import PageTransition from "@/components/shared/PageTransition";
import { cn } from "@/lib/utils";
import { tr } from "@/lib/i18n";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { usePlatformHotelDetail, useSetHotelPayment } from "@/hooks/usePlatform";
import {
  StatCard, Table, Th, Td, EmptyState, StatusBadge, ModeBadge, formatIDR,
} from "@/components/platform/widgets";

type PayState = "off" | "test" | "live";
function fmtDate(s: string) { return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short" }); }
function fmtWhen(s: string) {
  const d = new Date(s);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
}

const PAY_OPTIONS: { key: PayState; label: string; icon: typeof Ban }[] = [
  { key: "off", label: "Off", icon: Ban },
  { key: "test", label: "Test", icon: FlaskConical },
  { key: "live", label: "Live", icon: ShieldCheck },
];

export default function PlatformHotelDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const by = user?.email ?? user?.id ?? "admin";
  const { data: hotel, isLoading } = usePlatformHotelDetail(id);
  const setPayment = useSetHotelPayment();

  const current: PayState = !hotel ? "off" : !hotel.payments_active ? "off" : hotel.mode === "live" ? "live" : "test";

  async function setState(state: PayState) {
    if (!hotel || current === state) return;
    try {
      await setPayment.mutateAsync({ tenantId: hotel.tenant_id, state, by });
      toast({ title: `${hotel.name} → ${state === "off" ? tr("Nonaktif") : state === "live" ? "Live" : "Test"}` });
    } catch (e) {
      toast({ title: tr("Gagal mengubah mode"), description: (e as Error).message, variant: "destructive" });
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
    );
  }
  if (!hotel) {
    return (
      <div className="p-6">
        <Link to="/platform/hotels" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> {tr("Kembali ke daftar hotel")}
        </Link>
        <EmptyState message={tr("Hotel tidak ditemukan")} />
      </div>
    );
  }

  return (
    <PageTransition>
      {/* Header */}
      <div className="border-b border-border bg-card px-4 py-4 md:px-6 md:py-5">
        <Link to="/platform/hotels" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-2">
          <ArrowLeft className="w-3.5 h-3.5" /> {tr("Semua Hotel")}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
              {hotel.name}
              <ModeBadge mode={hotel.mode} active={hotel.payments_active} />
              {!hotel.is_active && <span className="text-xs text-destructive">({tr("nonaktif")})</span>}
            </h1>
            <p className="text-sm text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>/{hotel.slug}</span>
              {hotel.wa_linked && hotel.wa_number && (
                <span className="inline-flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" /> {hotel.wa_number}</span>
              )}
              {hotel.owner && (
                <span>{tr("Pemilik")}: {hotel.owner.full_name ?? hotel.owner.email ?? hotel.owner.phone ?? "—"}</span>
              )}
              <span>{hotel.staff_count} {tr("staf")}</span>
            </p>
          </div>
          <a
            href={`https://app.gostay.id/portal?hotel=${encodeURIComponent(hotel.slug)}`}
            target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" /> {tr("Portal tamu")}
          </a>
        </div>
      </div>

      <div className="space-y-6 p-4 md:p-6">
        {/* Kontrol mode pembayaran */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">{tr("Mode Pembayaran")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {tr("Off menonaktifkan pembayaran online. Live memproses uang asli lewat Xendit.")}
              </p>
            </div>
            <div className="inline-flex rounded-lg border border-border overflow-hidden">
              {PAY_OPTIONS.map((o) => {
                const active = current === o.key;
                return (
                  <button
                    key={o.key}
                    onClick={() => setState(o.key)}
                    disabled={setPayment.isPending}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60",
                      active
                        ? o.key === "live" ? "bg-success text-success-foreground"
                          : o.key === "test" ? "bg-warning text-warning-foreground"
                          : "bg-muted text-foreground"
                        : "bg-card text-muted-foreground hover:bg-muted",
                    )}
                  >
                    <o.icon className="w-4 h-4" /> {o.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Statistik operasional */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <StatCard label={tr("Terisi malam ini")} value={`${hotel.rooms_occupied_today}/${hotel.rooms_total}`} icon={<BedDouble className="w-4 h-4" />} />
          <StatCard label={tr("Total reservasi")} value={hotel.bookings_total} icon={<CalendarCheck className="w-4 h-4" />} />
          <StatCard label={tr("Total tamu")} value={hotel.customers_total} icon={<Users className="w-4 h-4" />} />
          <StatCard label={tr("Saldo")} value={formatIDR(hotel.balance)} sub={hotel.pending_payout > 0 ? `${formatIDR(hotel.pending_payout)} ${tr("menunggu")}` : undefined} icon={<Wallet className="w-4 h-4" />} />
        </div>

        {/* Aktivitas */}
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">{tr("Reservasi Terbaru")}</h2>
              <Link to="/platform/reservations" className="text-xs font-medium text-primary hover:underline">{tr("Lihat semua")}</Link>
            </div>
            {hotel.recent_reservations.length === 0 ? (
              <EmptyState message={tr("Belum ada reservasi")} />
            ) : (
              <Table>
                <thead><tr><Th>{tr("Tamu")}</Th><Th>{tr("Menginap")}</Th><Th className="text-right">{tr("Total")}</Th><Th>Status</Th></tr></thead>
                <tbody>
                  {hotel.recent_reservations.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/30">
                      <Td className="font-medium text-foreground">
                        {r.guest}
                        {r.room ? <span className="text-muted-foreground"> · {r.room}{r.room_type ? ` ${r.room_type}` : ""}</span> : null}
                      </Td>
                      <Td className="text-muted-foreground">{fmtDate(r.check_in)}–{fmtDate(r.check_out)}</Td>
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
              <h2 className="text-sm font-semibold text-foreground">{tr("Percakapan Terbaru")}</h2>
              <Link to="/platform/messages" className="text-xs font-medium text-primary hover:underline">{tr("Lihat semua")}</Link>
            </div>
            {hotel.recent_threads.length === 0 ? (
              <EmptyState message={tr("Belum ada percakapan")} />
            ) : (
              <Table>
                <thead><tr><Th>{tr("Tamu")}</Th><Th>Status</Th><Th>{tr("Terakhir")}</Th></tr></thead>
                <tbody>
                  {hotel.recent_threads.map((t) => (
                    <tr key={t.id} className="hover:bg-muted/30">
                      <Td className="font-medium text-foreground">{t.guest}</Td>
                      <Td><StatusBadge status={t.status} /></Td>
                      <Td className="text-muted-foreground">{fmtWhen(t.updated_at)}</Td>
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
