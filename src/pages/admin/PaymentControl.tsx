import { useMemo, useState } from "react";
import { CreditCard, Search, Loader2, ShieldCheck, FlaskConical, Radio } from "lucide-react";
import PageTransition from "@/components/shared/PageTransition";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { tr } from "@/lib/i18n";
import {
  useHotelPayments, useSetHotelMode, useSetHotelPaymentsActive,
} from "@/hooks/useAdminPayments";
import type { HotelPaymentRow } from "@/services/adminPaymentService";

export default function PaymentControl() {
  const { user } = useAuth();
  const { toast } = useToast();
  const by = user?.email ?? user?.id ?? "admin";

  const { data: hotels = [], isLoading } = useHotelPayments();
  const setMode = useSetHotelMode();
  const setActive = useSetHotelPaymentsActive();
  const [q, setQ] = useState("");

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? hotels.filter((h) => (h.name + h.slug).toLowerCase().includes(s)) : hotels;
  }, [hotels, q]);

  const liveCount = hotels.filter((h) => h.mode === "live" && h.payments_active).length;

  async function toggleMode(h: HotelPaymentRow) {
    const next = h.mode === "live" ? "test" : "live";
    try {
      await setMode.mutateAsync({ tenantId: h.tenant_id, mode: next, by });
      toast({ title: `${h.name} → ${next === "live" ? tr("Live") : tr("Test")}` });
    } catch (e) {
      toast({ title: tr("Gagal mengubah mode"), description: (e as Error).message, variant: "destructive" });
    }
  }
  async function togglePaymentsActive(h: HotelPaymentRow) {
    try {
      await setActive.mutateAsync({ tenantId: h.tenant_id, active: !h.payments_active, by });
    } catch (e) {
      toast({ title: tr("Gagal mengubah status"), description: (e as Error).message, variant: "destructive" });
    }
  }

  return (
    <PageTransition>
      <div className="p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
              <CreditCard className="w-6 h-6 text-primary" /> {tr("Kontrol Pembayaran Hotel")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {tr("Atur mode pembayaran Live/Test tiap hotel. Hanya super admin Ventera.")}
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="px-3 py-1.5 rounded-lg bg-success/10 text-success font-medium flex items-center gap-1.5">
              <Radio className="w-4 h-4" /> {liveCount} {tr("hotel Live")}
            </span>
          </div>
        </div>

        {/* Warning banner */}
        <div className="bg-warning/10 border border-warning/20 rounded-xl p-3 mb-4 flex gap-2.5 text-sm text-foreground">
          <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-warning" />
          <p>{tr("Mode Live memproses uang asli lewat Xendit. Pastikan hotel siap sebelum diaktifkan.")}</p>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2 mb-4 max-w-sm">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Cari hotel...")}
            className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full" />
        </div>

        {/* Table */}
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
                    <th className="px-4 py-3 font-medium">Prefix</th>
                    <th className="px-4 py-3 font-medium text-center">{tr("Mode Pembayaran")}</th>
                    <th className="px-4 py-3 font-medium text-center">{tr("Pembayaran Aktif")}</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((h) => {
                    const isLive = h.mode === "live";
                    return (
                      <tr key={h.tenant_id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-3">
                          <p className="font-medium text-foreground">{h.name}</p>
                          {!h.is_active && <span className="text-xs text-destructive">{tr("Hotel nonaktif")}</span>}
                        </td>
                        <td className="px-4 py-3">
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">GOSTAY-{h.slug}</code>
                        </td>
                        <td className="px-4 py-3">
                          {/* Live / Test segmented toggle (Storo routing style) */}
                          <div className="flex items-center justify-center">
                            <div className="inline-flex rounded-lg border border-border overflow-hidden">
                              <button onClick={() => !isLive || toggleMode(h)} disabled={setMode.isPending}
                                className={cn("px-3 py-1.5 text-xs font-semibold flex items-center gap-1 transition-colors",
                                  !isLive ? "bg-warning/15 text-warning" : "text-muted-foreground hover:bg-muted")}>
                                <FlaskConical className="w-3.5 h-3.5" /> {tr("Test")}
                              </button>
                              <button onClick={() => isLive || toggleMode(h)} disabled={setMode.isPending}
                                className={cn("px-3 py-1.5 text-xs font-semibold flex items-center gap-1 transition-colors",
                                  isLive ? "bg-success/15 text-success" : "text-muted-foreground hover:bg-muted")}>
                                <Radio className="w-3.5 h-3.5" /> {tr("Live")}
                              </button>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center">
                            <button onClick={() => togglePaymentsActive(h)} disabled={setActive.isPending}
                              role="switch" aria-checked={h.payments_active}
                              className={cn("relative w-11 h-6 rounded-full transition-colors",
                                h.payments_active ? "bg-primary" : "bg-muted-foreground/30")}>
                              <span className={cn("absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform",
                                h.payments_active && "translate-x-5")} />
                            </button>
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
