import { useMemo, useState } from "react";
import { CalendarRange, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import PageTransition from "@/components/shared/PageTransition";
import { cn } from "@/lib/utils";
import { tr } from "@/lib/i18n";
import { usePlatformCalendar } from "@/hooks/usePlatform";

const WINDOW_DAYS = 14;

function addDays(iso: string, n: number) {
  return new Date(new Date(iso + "T00:00:00Z").getTime() + n * 86400000).toISOString().slice(0, 10);
}
function dayLabel(iso: string) {
  const d = new Date(iso + "T00:00:00Z");
  return { dow: d.toLocaleDateString("id-ID", { weekday: "short", timeZone: "UTC" }), num: d.getUTCDate() };
}

/** Warna sel mengikuti tingkat hunian, bukan angka mentah — pola penuh/kosong
 *  antar hotel harus terbaca sekali lihat. */
function occupancyTone(pct: number) {
  if (pct >= 0.9) return "bg-destructive/20 text-destructive";
  if (pct >= 0.6) return "bg-warning/20 text-warning";
  if (pct > 0) return "bg-success/15 text-success";
  return "text-muted-foreground";
}

export default function PlatformCalendar() {
  const [from, setFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const { data, isLoading } = usePlatformCalendar(from, WINDOW_DAYS);

  const hotels = data?.hotels ?? [];
  const days = data?.days ?? [];
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  return (
    <PageTransition>
      <div className="p-4 md:p-6">
        <div className="mb-5">
          <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
            <CalendarRange className="w-6 h-6 text-primary" /> {tr("Kalender Hunian")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {tr("Kamar terisi per malam, seluruh hotel. Angka = kamar terisi dari total kamar aktif.")}
          </p>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => setFrom(addDays(from, -WINDOW_DAYS))}
            className="p-2 rounded-lg border border-border hover:bg-muted transition-colors" aria-label={tr("Mundur")}>
            <ChevronLeft className="w-4 h-4" />
          </button>
          <input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)}
            className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground" />
          <button onClick={() => setFrom(addDays(from, WINDOW_DAYS))}
            className="p-2 rounded-lg border border-border hover:bg-muted transition-colors" aria-label={tr("Maju")}>
            <ChevronRight className="w-4 h-4" />
          </button>
          <button onClick={() => setFrom(today)}
            className="px-3 py-2 rounded-lg border border-border text-sm hover:bg-muted transition-colors">
            {tr("Hari ini")}
          </button>
        </div>

        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : hotels.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-16">{tr("Tidak ada hotel")}</p>
            ) : (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b border-border">
                    <th className="px-4 py-3 font-medium text-left sticky left-0 bg-card z-10">{tr("Hotel")}</th>
                    {days.map((d) => {
                      const l = dayLabel(d.date);
                      return (
                        <th key={d.date} className={cn("px-2 py-2 font-medium text-center min-w-[46px]", d.date === today && "bg-primary/10 text-primary")}>
                          <span className="block">{l.dow}</span>
                          <span className="block text-sm text-foreground">{l.num}</span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {hotels.map((h) => (
                    <tr key={h.tenant_id} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-3 sticky left-0 bg-card z-10">
                        <span className="font-medium text-foreground">{h.name}</span>
                        <span className="block text-xs text-muted-foreground">{h.rooms} {tr("kamar")}</span>
                      </td>
                      {days.map((d) => {
                        const used = d.byHotel[h.tenant_id] ?? 0;
                        const pct = h.rooms > 0 ? used / h.rooms : 0;
                        return (
                          <td key={d.date} className="px-1 py-2 text-center">
                            <span className={cn(
                              "inline-block min-w-[34px] rounded-md px-1.5 py-1 text-xs font-medium",
                              occupancyTone(pct),
                            )}>
                              {h.rooms > 0 ? `${used}/${h.rooms}` : "—"}
                            </span>
                          </td>
                        );
                      })}
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
