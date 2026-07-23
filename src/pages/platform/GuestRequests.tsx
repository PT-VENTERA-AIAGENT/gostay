import { useMemo, useState } from "react";
import { ConciergeBell, Search, Loader2 } from "lucide-react";
import PageTransition from "@/components/shared/PageTransition";
import { cn } from "@/lib/utils";
import { tr } from "@/lib/i18n";
import { usePlatformGuestRequests } from "@/hooks/usePlatform";

function fmtDate(s: string) { return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }

const statusStyle: Record<string, string> = {
  open: "bg-warning/15 text-warning", in_progress: "bg-primary/15 text-primary",
  done: "bg-success/15 text-success", cancelled: "bg-muted text-muted-foreground",
};
const prioStyle: Record<string, string> = {
  high: "text-destructive", normal: "text-muted-foreground", low: "text-muted-foreground",
};

export default function PlatformGuestRequests() {
  const { data: rows = [], isLoading } = usePlatformGuestRequests();
  const [q, setQ] = useState("");
  const [hotel, setHotel] = useState("");

  const hotels = useMemo(() => Array.from(new Set(rows.map((r) => r.hotel))).sort(), [rows]);
  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) =>
      (!hotel || r.hotel === hotel) &&
      (!s || (r.title + r.hotel + (r.guest ?? "")).toLowerCase().includes(s)));
  }, [rows, q, hotel]);

  const openCount = rows.filter((r) => r.status === "open" || r.status === "in_progress").length;

  return (
    <PageTransition>
      <div className="p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
              <ConciergeBell className="w-6 h-6 text-primary" /> {tr("Semua Permintaan Tamu")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">{tr("Permintaan tamu dari seluruh hotel.")}</p>
          </div>
          <span className="px-3 py-1.5 rounded-lg bg-warning/10 text-warning font-medium text-sm">{openCount} {tr("aktif")}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2 flex-1 min-w-[200px] max-w-sm">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Cari permintaan / hotel...")}
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
              <p className="text-center text-sm text-muted-foreground py-16">{tr("Tidak ada permintaan")}</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="px-4 py-3 font-medium">{tr("Hotel")}</th>
                    <th className="px-4 py-3 font-medium">{tr("Permintaan")}</th>
                    <th className="px-4 py-3 font-medium">{tr("Tamu")}</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">{tr("Waktu")}</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr key={r.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">{r.hotel}</td>
                      <td className="px-4 py-3 text-foreground">
                        {r.title}
                        {r.priority === "high" && <span className={cn("ml-2 text-xs", prioStyle.high)}>● {tr("prioritas")}</span>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{r.guest ?? "—"}{r.room ? ` · ${r.room}` : ""}</td>
                      <td className="px-4 py-3"><span className={cn("text-xs px-2 py-1 rounded-full font-medium capitalize", statusStyle[r.status] ?? "bg-muted text-muted-foreground")}>{r.status.replace("_", " ")}</span></td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtDate(r.created_at)}</td>
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
