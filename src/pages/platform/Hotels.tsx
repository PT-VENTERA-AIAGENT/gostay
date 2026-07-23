import { useMemo, useState } from "react";
import { Building2, Search, Loader2, ShieldCheck, FlaskConical, Radio, MessageCircle, Ban } from "lucide-react";
import PageTransition from "@/components/shared/PageTransition";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { tr } from "@/lib/i18n";
import { usePlatformHotels, useSetHotelPayment } from "@/hooks/usePlatform";
import type { HotelOverview } from "@/services/platformService";

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
      <div className="p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
              <Building2 className="w-6 h-6 text-primary" /> {tr("Semua Hotel")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {tr("Kelola mode pembayaran Live/Test setiap hotel dan pantau koneksi WhatsApp.")}
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="px-3 py-1.5 rounded-lg bg-muted text-foreground font-medium">{hotels.length} {tr("hotel")}</span>
            <span className="px-3 py-1.5 rounded-lg bg-success/10 text-success font-medium flex items-center gap-1.5">
              <Radio className="w-4 h-4" /> {liveCount} Live
            </span>
          </div>
        </div>

        <div className="bg-warning/10 border border-warning/20 rounded-xl p-3 mb-4 flex gap-2.5 text-sm text-foreground">
          <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-warning" />
          <p>{tr("Mode Live memproses uang asli lewat Xendit. Pastikan hotel siap sebelum diaktifkan.")}</p>
        </div>

        <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2 mb-4 max-w-sm">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Cari hotel...")}
            className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full" />
        </div>

        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : visible.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-16">{tr("Tidak ada hotel")}</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="px-4 py-3 font-medium">{tr("Hotel")}</th>
                    <th className="px-4 py-3 font-medium">{tr("Pemilik akun")}</th>
                    <th className="px-4 py-3 font-medium">WhatsApp</th>
                    <th className="px-4 py-3 font-medium text-center">{tr("Pembayaran")}</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((h) => {
                    const st = stateOf(h);
                    return (
                      <tr key={h.tenant_id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-3">
                          <p className="font-medium text-foreground">{h.name}</p>
                          <code className="text-xs text-muted-foreground">GOSTAY-{h.slug}</code>
                          {!h.is_active && <span className="ml-2 text-xs text-destructive">{tr("nonaktif")}</span>}
                        </td>
                        <td className="px-4 py-3">
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
                        </td>
                        <td className="px-4 py-3">
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
                        </td>
                        <td className="px-4 py-3">
                          {/* Single control: Off | Test | Live (no more separate active toggle) */}
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
