import { useMemo, useState } from "react";
import { CalendarCheck, Search, Loader2 } from "lucide-react";
import PageTransition from "@/components/shared/PageTransition";
import { cn } from "@/lib/utils";
import { tr } from "@/lib/i18n";
import { usePlatformReservations } from "@/hooks/usePlatform";

function formatIDR(n: number) { return "Rp" + Math.round(n).toLocaleString("id-ID"); }
function fmtDate(s: string) { return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short" }); }

const statusStyle: Record<string, string> = {
  pending: "bg-warning/15 text-warning", confirmed: "bg-primary/15 text-primary",
  checked_in: "bg-success/15 text-success", checked_out: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/15 text-destructive", no_show: "bg-destructive/15 text-destructive",
};
const payStyle: Record<string, string> = {
  paid: "text-success", partial: "text-warning", pending: "text-muted-foreground", refunded: "text-destructive",
};

export default function PlatformReservations() {
  const { data: rows = [], isLoading } = usePlatformReservations();
  const [q, setQ] = useState("");
  const [hotel, setHotel] = useState("");

  const hotels = useMemo(() => Array.from(new Set(rows.map((r) => r.hotel))).sort(), [rows]);
  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) =>
      (!hotel || r.hotel === hotel) &&
      (!s || (r.reference + r.guest + r.hotel).toLowerCase().includes(s)));
  }, [rows, q, hotel]);

  return (
    <PageTransition>
      <div className="p-4 md:p-6">
        <div className="mb-5">
          <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
            <CalendarCheck className="w-6 h-6 text-primary" /> {tr("Semua Reservasi")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{tr("Reservasi terbaru dari seluruh hotel.")}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2 flex-1 min-w-[200px] max-w-sm">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Cari ref / tamu / hotel...")}
              className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full" />
          </div>
          <select value={hotel} onChange={(e) => setHotel(e.target.value)}
            className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground">
            <option value="">{tr("Semua hotel")}</option>
            {hotels.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>

        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : visible.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-16">{tr("Tidak ada reservasi")}</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="px-4 py-3 font-medium">{tr("Hotel")}</th>
                    <th className="px-4 py-3 font-medium">Ref</th>
                    <th className="px-4 py-3 font-medium">{tr("Tamu")}</th>
                    <th className="px-4 py-3 font-medium">{tr("Menginap")}</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium text-right">{tr("Total")}</th>
                    <th className="px-4 py-3 font-medium">{tr("Bayar")}</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr key={r.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">{r.hotel}</td>
                      <td className="px-4 py-3"><code className="text-xs text-muted-foreground">{r.reference}</code></td>
                      <td className="px-4 py-3 text-foreground">{r.guest}{r.room ? <span className="text-muted-foreground"> · {r.room}</span> : null}</td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtDate(r.check_in)} – {fmtDate(r.check_out)}</td>
                      <td className="px-4 py-3"><span className={cn("text-xs px-2 py-1 rounded-full font-medium capitalize", statusStyle[r.status] ?? "bg-muted text-muted-foreground")}>{r.status.replace("_", " ")}</span></td>
                      <td className="px-4 py-3 text-right text-foreground whitespace-nowrap">{formatIDR(r.total_amount)}</td>
                      <td className={cn("px-4 py-3 capitalize", payStyle[r.payment_status] ?? "text-muted-foreground")}>{r.payment_status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
