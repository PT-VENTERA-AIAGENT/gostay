import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, Loader2, ShieldCheck, FlaskConical, Radio, MessageCircle, Ban, ChevronRight } from "lucide-react";
import PageTransition from "@/components/shared/PageTransition";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { tr } from "@/lib/i18n";
import { usePlatformHotels, useSetHotelPayment } from "@/hooks/usePlatform";
import type { HotelOverview } from "@/services/platformService";
import { PageHeader, Table, Th, Td, EmptyState, SearchBox } from "@/components/platform/widgets";

type PayState = "off" | "test" | "live";

export default function PlatformHotels() {
  const { user } = useAuth();
  const { toast } = useToast();
  const by = user?.email ?? user?.id ?? "admin";

  const { data: hotels = [], isLoading } = usePlatformHotels();
  const setPayment = useSetHotelPayment();
  const [q, setQ] = useState("");

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? hotels.filter((h) => (h.name + h.slug + (h.wa_number ?? "")).toLowerCase().includes(s)) : hotels;
  }, [hotels, q]);

  const liveCount = hotels.filter((h) => h.mode === "live" && h.payments_active).length;

  const stateOf = (h: HotelOverview): PayState => (!h.payments_active ? "off" : h.mode === "live" ? "live" : "test");

  async function set(h: HotelOverview, state: PayState) {
    if (stateOf(h) === state) return;
    try {
      await setPayment.mutateAsync({ tenantId: h.tenant_id, state, by });
      const label = state === "off" ? tr("Nonaktif") : state === "live" ? "Live" : "Test";
      toast({ title: `${h.name} → ${label}` });
    } catch (e) {
      toast({ title: tr("Gagal mengubah mode"), description: (e as Error).message, variant: "destructive" });
    }
  }

  return (
    <PageTransition>
      <PageHeader
        icon={<Building2 className="w-5 h-5" />}
        title={tr("Semua Hotel")}
        description={tr("Klik hotel untuk detail & kontrol. Atur mode pembayaran Off/Test/Live langsung dari sini.")}
        action={<SearchBox value={q} onChange={setQ} placeholder={tr("Cari hotel...")} />}
      />

      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="px-3 py-1.5 rounded-lg bg-muted text-foreground font-medium">{hotels.length} {tr("hotel")}</span>
          <span className="px-3 py-1.5 rounded-lg bg-success/10 text-success font-medium flex items-center gap-1.5">
            <Radio className="w-4 h-4" /> {liveCount} Live
          </span>
        </div>

        <div className="bg-warning/10 border border-warning/20 rounded-xl p-3 flex gap-2.5 text-sm text-foreground">
          <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-warning" />
          <p>{tr("Mode Live memproses uang asli lewat Xendit. Pastikan hotel siap sebelum diaktifkan.")}</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : visible.length === 0 ? (
          <EmptyState message={tr("Tidak ada hotel")} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{tr("Hotel")}</Th>
                <Th>{tr("Pemilik akun")}</Th>
                <Th>WhatsApp</Th>
                <Th className="text-center">{tr("Pembayaran")}</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((h) => {
                const st = stateOf(h);
                return (
                  <tr key={h.tenant_id} className="hover:bg-muted/30">
                    <Td>
                      <Link to={`/platform/hotels/${h.tenant_id}`} className="font-medium text-foreground hover:text-primary">
                        {h.name}
                      </Link>
                      <div><code className="text-xs text-muted-foreground">/{h.slug}</code>
                        {!h.is_active && <span className="ml-2 text-xs text-destructive">{tr("nonaktif")}</span>}</div>
                    </Td>
                    <Td>
                      {h.owner ? (
                        <div className="min-w-0">
                          <p className="text-foreground truncate max-w-[220px]">{h.owner.full_name ?? tr("Tanpa nama")}</p>
                          <p className="text-xs text-muted-foreground truncate max-w-[220px]">
                            {h.owner.email ?? h.owner.phone ?? "—"}
                            {h.staff_count > 1 && <span className="ml-1">· +{h.staff_count - 1} staf</span>}
                          </p>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">{tr("Belum ada")}</span>
                      )}
                    </Td>
                    <Td>
                      {h.wa_number ? (
                        <div className="min-w-0">
                          <p className="text-foreground font-mono text-xs">+{h.wa_number}</p>
                          <p className={cn("text-xs flex items-center gap-1", h.wa_linked ? "text-success" : "text-muted-foreground")}>
                            <MessageCircle className="w-3 h-3" /> {h.wa_linked ? tr("Tertaut") : tr("Terputus")}
                          </p>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><MessageCircle className="w-3.5 h-3.5" /> {tr("Belum")}</span>
                      )}
                    </Td>
                    <Td>
                      <div className="flex items-center justify-center">
                        <div className="inline-flex rounded-lg border border-border overflow-hidden">
                          <button onClick={() => set(h, "off")} disabled={setPayment.isPending}
                            className={cn("px-2.5 py-1.5 text-xs font-semibold flex items-center gap-1 transition-colors",
                              st === "off" ? "bg-muted-foreground/15 text-foreground" : "text-muted-foreground hover:bg-muted")}>
                            <Ban className="w-3.5 h-3.5" /> {tr("Nonaktif")}
                          </button>
                          <button onClick={() => set(h, "test")} disabled={setPayment.isPending}
                            className={cn("px-2.5 py-1.5 text-xs font-semibold flex items-center gap-1 border-l border-border transition-colors",
                              st === "test" ? "bg-warning/15 text-warning" : "text-muted-foreground hover:bg-muted")}>
                            <FlaskConical className="w-3.5 h-3.5" /> Test
                          </button>
                          <button onClick={() => set(h, "live")} disabled={setPayment.isPending}
                            className={cn("px-2.5 py-1.5 text-xs font-semibold flex items-center gap-1 border-l border-border transition-colors",
                              st === "live" ? "bg-success/15 text-success" : "text-muted-foreground hover:bg-muted")}>
                            <Radio className="w-3.5 h-3.5" /> Live
                          </button>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <Link to={`/platform/hotels/${h.tenant_id}`} className="text-muted-foreground hover:text-primary">
                        <ChevronRight className="w-4 h-4" />
                      </Link>
                    </Td>
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
