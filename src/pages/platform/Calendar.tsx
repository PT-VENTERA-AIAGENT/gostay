import { Fragment, useState } from "react";
import { CalendarRange, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import PageTransition from "@/components/shared/PageTransition";
import { cn } from "@/lib/utils";
import { tr } from "@/lib/i18n";
import { usePlatformRoomCalendar } from "@/hooks/usePlatform";
import { PageHeader } from "@/components/platform/widgets";

const WINDOW_DAYS = 14;

function addDays(iso: string, n: number) {
  return new Date(new Date(iso + "T00:00:00Z").getTime() + n * 86400000).toISOString().slice(0, 10);
}
function dayLabel(iso: string) {
  const d = new Date(iso + "T00:00:00Z");
  return { dow: d.toLocaleDateString("id-ID", { weekday: "short", timeZone: "UTC" }), num: d.getUTCDate() };
}

export default function PlatformCalendar() {
  const [from, setFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const { data, isLoading } = usePlatformRoomCalendar(from, WINDOW_DAYS);

  const hotels = data?.hotels ?? [];
  const days = data?.days ?? [];
  const occupied = data?.occupied ?? new Set<string>();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <PageTransition>
      <PageHeader
        icon={<CalendarRange className="w-5 h-5" />}
        title={tr("Kalender Hunian")}
        description={tr("Status tiap kamar (nomor & tipe) per malam, seluruh hotel. Hijau = kosong, oranye = terisi.")}
        action={
          <div className="flex items-center gap-2">
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
        }
      />

      <div className="p-4 md:p-6">
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
                    <th className="px-4 py-3 font-medium text-left sticky left-0 bg-card z-10 min-w-[160px]">{tr("Kamar")}</th>
                    {days.map((d) => {
                      const l = dayLabel(d);
                      return (
                        <th key={d} className={cn("px-1 py-2 font-medium text-center min-w-[42px]", d === today && "bg-primary/10 text-primary")}>
                          <span className="block">{l.dow}</span>
                          <span className="block text-sm text-foreground">{l.num}</span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {hotels.map((h) => (
                    <Fragment key={h.tenant_id}>
                      {/* Baris judul hotel */}
                      <tr className="bg-muted/40 border-b border-border">
                        <td className="px-4 py-2 sticky left-0 bg-muted/40 z-10 font-semibold text-foreground" colSpan={days.length + 1}>
                          {h.name} <span className="text-xs font-normal text-muted-foreground">· {h.rooms.length} {tr("kamar")}</span>
                        </td>
                      </tr>
                      {h.rooms.length === 0 ? (
                        <tr className="border-b border-border/60">
                          <td className="px-4 py-2 sticky left-0 bg-card z-10 text-xs text-muted-foreground" colSpan={days.length + 1}>
                            {tr("Belum ada kamar")}
                          </td>
                        </tr>
                      ) : (
                        h.rooms.map((room) => (
                          <tr key={room.id} className="border-b border-border/60 last:border-0 hover:bg-muted/20">
                            <td className="px-4 py-2 sticky left-0 bg-card z-10">
                              <span className="font-medium text-foreground">{room.number}</span>
                              {room.type && <span className="block text-xs text-muted-foreground">{room.type}</span>}
                            </td>
                            {days.map((d) => {
                              const busy = occupied.has(`${room.id}|${d}`);
                              return (
                                <td key={d} className="px-1 py-1.5 text-center">
                                  <span className={cn(
                                    "inline-block w-6 h-6 rounded-md",
                                    busy ? "bg-warning/25" : "bg-success/15",
                                    d === today && "ring-1 ring-primary/40",
                                  )} title={busy ? tr("Terisi") : tr("Kosong")} />
                                </td>
                              );
                            })}
                          </tr>
                        ))
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Legenda */}
        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-success/15 inline-block" /> {tr("Kosong")}</span>
          <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-warning/25 inline-block" /> {tr("Terisi")}</span>
        </div>
      </div>
    </PageTransition>
  );
}
