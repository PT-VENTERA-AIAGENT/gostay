import { useMemo, useState } from "react";
import { ConciergeBell, Loader2 } from "lucide-react";
import PageTransition from "@/components/shared/PageTransition";
import { cn } from "@/lib/utils";
import { tr } from "@/lib/i18n";
import { usePlatformGuestRequests } from "@/hooks/usePlatform";
import { PageHeader, Table, Th, Td, EmptyState, StatusBadge, SearchBox } from "@/components/platform/widgets";

function fmtDate(s: string) { return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }

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
      <PageHeader
        icon={<ConciergeBell className="w-5 h-5" />}
        title={tr("Semua Permintaan Tamu")}
        description={tr("Permintaan tamu dari seluruh hotel.")}
        action={<SearchBox value={q} onChange={setQ} placeholder={tr("Cari permintaan / hotel...")} />}
      />

      <div className="p-4 md:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="px-3 py-1.5 rounded-lg bg-warning/10 text-warning font-medium text-sm">{openCount} {tr("aktif")}</span>
          <select value={hotel} onChange={(e) => setHotel(e.target.value)}
            className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground">
            <option value="">{tr("Semua hotel")}</option>
            {hotels.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : visible.length === 0 ? (
          <EmptyState message={tr("Tidak ada permintaan")} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{tr("Hotel")}</Th>
                <Th>{tr("Permintaan")}</Th>
                <Th>{tr("Tamu")}</Th>
                <Th>Status</Th>
                <Th>{tr("Waktu")}</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} className="hover:bg-muted/30">
                  <Td className="font-medium text-foreground">{r.hotel}</Td>
                  <Td className="whitespace-normal max-w-[260px]">
                    {r.title}
                    {r.priority === "high" && <span className={cn("ml-2 text-xs text-destructive")}>● {tr("prioritas")}</span>}
                  </Td>
                  <Td className="text-muted-foreground">{r.guest ?? "—"}{r.room ? ` · ${r.room}` : ""}</Td>
                  <Td><StatusBadge status={r.status} /></Td>
                  <Td className="text-muted-foreground">{fmtDate(r.created_at)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </PageTransition>
  );
}
