import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarCheck, Loader2 } from "lucide-react";
import PageTransition from "@/components/shared/PageTransition";
import { cn } from "@/lib/utils";
import { tr } from "@/lib/i18n";
import { usePlatformReservations, usePlatformHotels } from "@/hooks/usePlatform";
import { PageHeader, Table, Th, Td, EmptyState, StatusBadge, SearchBox, formatIDR } from "@/components/platform/widgets";

function fmtDate(s: string) { return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short" }); }

const payStyle: Record<string, string> = {
  paid: "text-success", partial: "text-warning", pending: "text-muted-foreground", refunded: "text-destructive",
};

export default function PlatformReservations() {
  const { data: rows = [], isLoading } = usePlatformReservations();
  const { data: hotelList = [] } = usePlatformHotels();
  const [q, setQ] = useState("");
  const [hotel, setHotel] = useState("");

  // Map hotel name → tenant_id so a row can link to the hotel's detail page.
  const idByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const h of hotelList) m.set(h.name, h.tenant_id);
    return m;
  }, [hotelList]);

  const hotels = useMemo(() => Array.from(new Set(rows.map((r) => r.hotel))).sort(), [rows]);
  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) =>
      (!hotel || r.hotel === hotel) &&
      (!s || (r.reference + r.guest + r.hotel).toLowerCase().includes(s)));
  }, [rows, q, hotel]);

  return (
    <PageTransition>
      <PageHeader
        icon={<CalendarCheck className="w-5 h-5" />}
        title={tr("Semua Reservasi")}
        description={tr("Reservasi terbaru dari seluruh hotel.")}
        action={<SearchBox value={q} onChange={setQ} placeholder={tr("Cari ref / tamu / hotel...")} />}
      />

      <div className="p-4 md:p-6 space-y-4">
        <div className="flex justify-end">
          <select value={hotel} onChange={(e) => setHotel(e.target.value)}
            className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground">
            <option value="">{tr("Semua hotel")}</option>
            {hotels.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : visible.length === 0 ? (
          <EmptyState message={tr("Tidak ada reservasi")} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{tr("Hotel")}</Th>
                <Th>Ref</Th>
                <Th>{tr("Tamu")}</Th>
                <Th>{tr("Kamar")}</Th>
                <Th>{tr("Menginap")}</Th>
                <Th>Status</Th>
                <Th className="text-right">{tr("Total")}</Th>
                <Th>{tr("Bayar")}</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const id = idByName.get(r.hotel);
                return (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <Td className="font-medium text-foreground">
                      {id ? <Link to={`/platform/hotels/${id}`} className="hover:text-primary">{r.hotel}</Link> : r.hotel}
                    </Td>
                    <Td><code className="text-xs text-muted-foreground">{r.reference}</code></Td>
                    <Td>{r.guest}</Td>
                    <Td>
                      {r.room ? (
                        <span className="text-foreground">{r.room}{r.room_type ? <span className="text-muted-foreground"> · {r.room_type}</span> : null}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </Td>
                    <Td className="text-muted-foreground">{fmtDate(r.check_in)} – {fmtDate(r.check_out)}</Td>
                    <Td><StatusBadge status={r.status} /></Td>
                    <Td className="text-right tabular-nums">{formatIDR(r.total_amount)}</Td>
                    <Td className={cn("capitalize", payStyle[r.payment_status] ?? "text-muted-foreground")}>{r.payment_status}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </div>
    </PageTransition>
  );
}
