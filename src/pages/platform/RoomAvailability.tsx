import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BedDouble, Loader2, CalendarDays, ChevronRight, ChevronDown } from "lucide-react";
import PageTransition from "@/components/shared/PageTransition";
import { cn } from "@/lib/utils";
import { tr } from "@/lib/i18n";
import { usePlatformRoomBoard } from "@/hooks/usePlatform";
import { PageHeader, StatCard, Table, Th, Td, EmptyState } from "@/components/platform/widgets";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function PlatformRoomAvailability() {
  const [date, setDate] = useState(todayISO());
  const { data: rows = [], isLoading } = usePlatformRoomBoard(date);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const totals = useMemo(() => rows.reduce(
    (a, r) => ({ total: a.total + r.total, booked: a.booked + r.booked, available: a.available + r.available }),
    { total: 0, booked: 0, available: 0 },
  ), [rows]);

  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }));

  return (
    <PageTransition>
      <PageHeader
        icon={<BedDouble className="w-5 h-5" />}
        title={tr("Ketersediaan Kamar")}
        description={tr("Kamar kosong vs terisi per tanggal, di semua hotel. Klik hotel untuk melihat nomor & tipe tiap kamar.")}
        action={
          <label className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2 text-sm">
            <CalendarDays className="w-4 h-4 text-muted-foreground" />
            <input type="date" value={date} onChange={(e) => setDate(e.target.value || todayISO())}
              className="bg-transparent text-foreground outline-none" />
            {date === todayISO() && <span className="text-xs text-primary font-medium">{tr("hari ini")}</span>}
          </label>
        }
      />

      <div className="p-4 md:p-6 space-y-5">
        <div className="grid grid-cols-3 gap-3 md:gap-4 max-w-xl">
          <StatCard label={tr("Total kamar")} value={totals.total} />
          <StatCard label={tr("Terisi")} value={<span className="text-warning">{totals.booked}</span>} />
          <StatCard label={tr("Tersedia")} value={<span className="text-success">{totals.available}</span>} />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <EmptyState message={tr("Tidak ada hotel")} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{tr("Hotel")}</Th>
                <Th className="text-center">{tr("Total kamar")}</Th>
                <Th className="text-center">{tr("Terisi")}</Th>
                <Th className="text-center">{tr("Tersedia")}</Th>
                <Th className="w-40">{tr("Keterisian")}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const pct = r.total > 0 ? Math.round((r.booked / r.total) * 100) : 0;
                const isOpen = open[r.tenant_id];
                return (
                  <Fragment key={r.tenant_id}>
                    <tr className={cn("hover:bg-muted/30", r.total > 0 && "cursor-pointer")}
                      onClick={() => r.total > 0 && toggle(r.tenant_id)}>
                      <Td>
                        <div className="flex items-center gap-1.5">
                          {r.total > 0 ? (
                            isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          ) : <span className="w-4" />}
                          <Link to={`/platform/hotels/${r.tenant_id}`} onClick={(e) => e.stopPropagation()}
                            className="font-medium text-foreground hover:text-primary">{r.hotel}</Link>
                        </div>
                      </Td>
                      <Td className="text-center text-muted-foreground">{r.total}</Td>
                      <Td className="text-center text-warning font-medium">{r.booked}</Td>
                      <Td className="text-center text-success font-semibold">{r.available}</Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden min-w-[80px]">
                            <div className={cn("h-full rounded-full", pct >= 90 ? "bg-destructive" : pct >= 60 ? "bg-warning" : "bg-success")}
                              style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground w-9 text-right">{pct}%</span>
                        </div>
                      </Td>
                    </tr>
                    {isOpen && r.rooms.length > 0 && (
                      <tr className="bg-muted/20">
                        <td colSpan={5} className="px-4 py-3 border-b border-border/60">
                          <div className="flex flex-wrap gap-2">
                            {r.rooms.map((room) => (
                              <span key={room.id}
                                className={cn(
                                  "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs",
                                  room.occupied
                                    ? "border-warning/30 bg-warning/10 text-warning"
                                    : "border-success/30 bg-success/10 text-success",
                                )}>
                                <span className="font-semibold text-foreground">{room.number}</span>
                                {room.type && <span className="text-muted-foreground">{room.type}</span>}
                                <span className="font-medium">· {room.occupied ? tr("Terisi") : tr("Kosong")}</span>
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </Table>
        )}
      </div>
    </PageTransition>
  );
}
