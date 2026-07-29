import { useMemo, useState } from "react";
import { AlertTriangle, Loader2, Check } from "lucide-react";
import PageTransition from "@/components/shared/PageTransition";
import { tr } from "@/lib/i18n";
import { usePlatformIncidents, useResolveIncident } from "@/hooks/usePlatform";
import { PageHeader, Table, Th, Td, EmptyState, SearchBox } from "@/components/platform/widgets";

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("id-ID", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

/**
 * Turn a technical reason into something an operator can act on.
 *
 * `send_failed_500` is true but useless; what matters is whether this guest can
 * ever be reached (a LID has no phone number behind it, so no retry will help)
 * or whether the gateway was merely down at that moment.
 */
function explain(reason: string): string {
  if (reason.startsWith("unroutable_lid")) {
    return tr("Nomor tamu disembunyikan WhatsApp (LID) — balasan tidak bisa dikirim ke nomor ini.");
  }
  if (reason.startsWith("exception:")) {
    return tr("Bot gagal memproses pesan tamu. Tamu sudah diberi tahu untuk mencoba lagi.");
  }
  if (reason === "send_not_configured") return tr("Gateway WhatsApp belum dikonfigurasi.");
  if (reason === "network_error") return tr("Gateway WhatsApp tidak dapat dihubungi.");
  if (reason.startsWith("send_failed_")) {
    return tr("Gateway menolak pengiriman") + ` (${reason.replace("send_failed_", "HTTP ")}).`;
  }
  return reason;
}

export default function PlatformIncidents() {
  const { data: rows = [], isLoading } = usePlatformIncidents();
  const resolve = useResolveIncident();
  const [q, setQ] = useState("");
  const [hotel, setHotel] = useState("");
  const [onlyOpen, setOnlyOpen] = useState(true);

  const hotels = useMemo(() => Array.from(new Set(rows.map((r) => r.hotel))).sort(), [rows]);
  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) =>
      (!hotel || r.hotel === hotel) &&
      (!onlyOpen || !r.resolved_at) &&
      (!s || (r.hotel + (r.guest ?? "") + (r.guestWa ?? "") + r.reason).toLowerCase().includes(s)));
  }, [rows, q, hotel, onlyOpen]);

  const openCount = rows.filter((r) => !r.resolved_at).length;
  const unreachable = rows.filter((r) => r.unroutable && !r.resolved_at).length;

  return (
    <PageTransition>
      <PageHeader
        icon={<AlertTriangle className="w-5 h-5" />}
        title={tr("Kendala WhatsApp")}
        description={tr("Balasan yang gagal terkirim dan pesan yang gagal diproses, di semua hotel.")}
        action={<SearchBox value={q} onChange={setQ} placeholder={tr("Cari tamu / hotel...")} />}
      />

      <div className="p-4 md:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive font-medium text-sm">
              {openCount} {tr("belum ditangani")}
            </span>
            {unreachable > 0 && (
              <span className="px-3 py-1.5 rounded-lg bg-warning/10 text-warning font-medium text-sm">
                {unreachable} {tr("tamu tak bisa dihubungi")}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
              {tr("Hanya yang belum ditangani")}
            </label>
            <select value={hotel} onChange={(e) => setHotel(e.target.value)}
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground">
              <option value="">{tr("Semua hotel")}</option>
              {hotels.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : visible.length === 0 ? (
          <EmptyState message={tr("Tidak ada kendala")} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{tr("Waktu")}</Th>
                <Th>{tr("Hotel")}</Th>
                <Th>{tr("Tamu")}</Th>
                <Th>{tr("Kendala")}</Th>
                <Th>{tr("Pesan")}</Th>
                <Th>{tr("Aksi")}</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} className={r.resolved_at ? "opacity-50" : undefined}>
                  <Td>{fmtDate(r.created_at)}</Td>
                  <Td>{r.hotel}</Td>
                  <Td>
                    <span className="font-medium text-foreground">{r.guest ?? tr("(belum terdaftar)")}</span>
                    {r.guestWa && (
                      <span className="block text-xs text-muted-foreground">WA: {r.guestWa}</span>
                    )}
                    {r.target_jid && (
                      <span className="block text-xs text-muted-foreground">{r.target_jid}</span>
                    )}
                  </Td>
                  <Td>
                    <span className={r.unroutable ? "text-warning" : "text-destructive"}>
                      {explain(r.reason)}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-muted-foreground line-clamp-2">{r.message_preview ?? "—"}</span>
                  </Td>
                  <Td>
                    {r.resolved_at ? (
                      <span className="text-xs text-muted-foreground">{tr("Sudah ditangani")}</span>
                    ) : (
                      <button
                        onClick={() => resolve.mutate(r.id)}
                        disabled={resolve.isPending}
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50"
                      >
                        <Check className="w-3 h-3" /> {tr("Tandai ditangani")}
                      </button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </PageTransition>
  );
}
