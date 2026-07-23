import { useState } from "react";
import { BedDouble, Loader2, CalendarDays } from "lucide-react";
import PageTransition from "@/components/shared/PageTransition";
import { cn } from "@/lib/utils";
import { tr } from "@/lib/i18n";
import { usePlatformRoomAvailability } from "@/hooks/usePlatform";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function PlatformRoomAvailability() {
  const [date, setDate] = useState(todayISO());
  const { data: rows = [], isLoading } = usePlatformRoomAvailability(date);

  const totals = rows.reduce(
    (a, r) => ({ total: a.total + r.total, booked: a.booked + r.booked, available: a.available + r.available }),
    { total: 0, booked: 0, available: 0 },
  );

  return (
    <PageTransition>
      <div className="p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
              <BedDouble className="w-6 h-6 text-primary" /> {tr("Ketersediaan Kamar")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {tr("Kamar kosong vs terisi per tanggal, di semua hotel. AI WhatsApp memakai aturan ketersediaan yang sama.")}
            </p>
          </div>
          <label className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2 text-sm">
            <CalendarDays className="w-4 h-4 text-muted-foreground" />
            <input type="date" value={date} onChange={(e) => setDate(e.target.value || todayISO())}
              className="bg-transparent text-foreground outline-none" />
            {date === todayISO() && <span className="text-xs text-primary font-medium">{tr("hari ini")}</span>}
          </label>
        </div>

        {/* Totals across all hotels */}
        <div className="grid grid-cols-3 gap-3 md:gap-4 mb-5 max-w-xl">
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-xs text-muted-foreground">{tr("Total kamar")}</p>
            <p className="text-2xl font-bold text-foreground">{totals.total}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-xs text-muted-foreground">{tr("Terisi")}</p>
            <p className="text-2xl font-bold text-warning">{totals.booked}</p>
          </div>
          <div className="bg-card rounded-xl border border-primary/40 ring-1 ring-primary/20 p-4">
            <p className="text-xs text-muted-foreground">{tr("Tersedia")}</p>
            <p className="text-2xl font-bold text-success">{totals.available}</p>
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : rows.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-16">{tr("Tidak ada hotel")}</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="px-4 py-3 font-medium">{tr("Hotel")}</th>
                    <th className="px-4 py-3 font-medium text-center">{tr("Total kamar")}</th>
                    <th className="px-4 py-3 font-medium text-center">{tr("Terisi")}</th>
                    <th className="px-4 py-3 font-medium text-center">{tr("Tersedia")}</th>
                    <th className="px-4 py-3 font-medium w-40">{tr("Keterisian")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const pct = r.total > 0 ? Math.round((r.booked / r.total) * 100) : 0;
                    return (
                      <tr key={r.tenant_id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium text-foreground">{r.hotel}</td>
                        <td className="px-4 py-3 text-center text-muted-foreground">{r.total}</td>
                        <td className="px-4 py-3 text-center text-warning font-medium">{r.booked}</td>
                        <td className="px-4 py-3 text-center text-success font-semibold">{r.available}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                              <div className={cn("h-full rounded-full", pct >= 90 ? "bg-destructive" : pct >= 60 ? "bg-warning" : "bg-success")}
                                style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-muted-foreground w-9 text-right">{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
