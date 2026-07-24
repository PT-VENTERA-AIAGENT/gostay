import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Wallet, Loader2 } from "lucide-react";
import PageTransition from "@/components/shared/PageTransition";
import { tr } from "@/lib/i18n";
import { usePlatformBalances } from "@/hooks/usePlatform";
import { PageHeader, StatCard, Table, Th, Td, EmptyState, SearchBox, formatIDR } from "@/components/platform/widgets";

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
      <PageHeader
        icon={<Wallet className="w-5 h-5" />}
        title={tr("Saldo Semua Hotel")}
        description={tr("Saldo berjalan tiap hotel dan penarikan yang masih menunggu diproses.")}
        action={<SearchBox value={q} onChange={setQ} placeholder={tr("Cari hotel...")} />}
      />

      <div className="p-4 md:p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
          <StatCard label={tr("Total saldo hotel")} value={formatIDR(totals.balance)} />
          <StatCard label={tr("Menunggu penarikan")} value={formatIDR(totals.pending)} />
          <StatCard label={tr("Total masuk (akumulatif)")} value={formatIDR(totals.lifetime)} />
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
                <Th className="text-right">{tr("Saldo")}</Th>
                <Th className="text-right">{tr("Menunggu penarikan")}</Th>
                <Th className="text-right">{tr("Total masuk")}</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.tenant_id} className="hover:bg-muted/30">
                  <Td>
                    <Link to={`/platform/hotels/${r.tenant_id}`} className="font-medium text-foreground hover:text-primary">{r.hotel}</Link>
                  </Td>
                  <Td className="text-right tabular-nums">{formatIDR(r.balance)}</Td>
                  <Td className="text-right">
                    {r.pending_payout > 0
                      ? <span className="text-warning font-medium">{formatIDR(r.pending_payout)}</span>
                      : <span className="text-muted-foreground">—</span>}
                  </Td>
                  <Td className="text-right text-muted-foreground tabular-nums">{formatIDR(r.lifetime_in)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </PageTransition>
  );
}
