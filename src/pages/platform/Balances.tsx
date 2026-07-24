import { useMemo, useState } from "react";
import { Wallet, Search, Loader2 } from "lucide-react";
import PageTransition from "@/components/shared/PageTransition";
import { tr } from "@/lib/i18n";
import { usePlatformBalances } from "@/hooks/usePlatform";

function formatIDR(n: number) { return "Rp" + Math.round(n).toLocaleString("id-ID"); }

export default function PlatformBalances() {
  const { data: rows = [], isLoading } = usePlatformBalances();
  const [q, setQ] = useState("");

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => !s || r.hotel.toLowerCase().includes(s));
  }, [rows, q]);

  const totals = useMemo(() => visible.reduce(
    (a, r) => ({
      balance: a.balance + r.balance,
      pending: a.pending + r.pending_payout,
      lifetime: a.lifetime + r.lifetime_in,
    }),
    { balance: 0, pending: 0, lifetime: 0 },
  ), [visible]);

  return (
    <PageTransition>
      <div className="p-4 md:p-6">
        <div className="mb-5">
          <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
            <Wallet className="w-6 h-6 text-primary" /> {tr("Saldo Semua Hotel")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {tr("Saldo berjalan tiap hotel dan penarikan yang masih menunggu diproses.")}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          {[
            { label: tr("Total saldo hotel"), value: totals.balance },
            { label: tr("Menunggu penarikan"), value: totals.pending },
            { label: tr("Total masuk (akumulatif)"), value: totals.lifetime },
          ].map((c) => (
            <div key={c.label} className="bg-card rounded-xl border border-border p-4">
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className="text-lg font-bold text-foreground mt-1">{formatIDR(c.value)}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2 max-w-sm mb-4">
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
                    <th className="px-4 py-3 font-medium text-right">{tr("Saldo")}</th>
                    <th className="px-4 py-3 font-medium text-right">{tr("Menunggu penarikan")}</th>
                    <th className="px-4 py-3 font-medium text-right">{tr("Total masuk")}</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr key={r.tenant_id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium text-foreground">{r.hotel}</td>
                      <td className="px-4 py-3 text-right text-foreground whitespace-nowrap">{formatIDR(r.balance)}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {r.pending_payout > 0
                          ? <span className="text-warning font-medium">{formatIDR(r.pending_payout)}</span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap">{formatIDR(r.lifetime_in)}</td>
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
