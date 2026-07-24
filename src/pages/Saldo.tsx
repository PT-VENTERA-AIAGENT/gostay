import { useState } from "react";
import { Wallet, ArrowDownToLine, TrendingUp, Scissors, Banknote, Loader2, Info } from "lucide-react";
import { motion } from "framer-motion";
import PageTransition, { staggerContainer, staggerItem } from "@/components/shared/PageTransition";
import { useT } from "@/lib/i18n";
import { useBalance, useLedger, usePayouts, usePaymentConfig } from "@/hooks/useSaldo";
import WithdrawDialog from "@/components/saldo/WithdrawDialog";

function formatIDR(n: number): string {
  return "Rp" + Math.round(n).toLocaleString("id-ID");
}
function formatDate(s: string): string {
  return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const payoutStatusStyle: Record<string, string> = {
  pending: "bg-warning/15 text-warning",
  paid: "bg-success/15 text-success",
  rejected: "bg-destructive/15 text-destructive",
};
const payoutStatusLabel: Record<string, string> = {
  pending: "Menunggu", paid: "Dibayar", rejected: "Ditolak",
};

export default function Saldo() {
  const t = useT();
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const { data: balance, isLoading: balLoading } = useBalance();
  const { data: ledger = [] } = useLedger();
  const { data: payouts = [] } = usePayouts();
  const { data: config } = usePaymentConfig();

  const feePct = (config?.feeBps ?? 700) / 100;
  const available = balance?.available ?? 0;
  const stats = [
    { icon: Wallet, label: t("Saldo tersedia"), value: available, accent: "text-primary", highlight: true },
    { icon: TrendingUp, label: t("Total pendapatan reservasi"), value: balance?.lifetime_gross ?? 0, accent: "text-foreground" },
    { icon: Scissors, label: `${t("Fee Ventera")} (${feePct}%)`, value: balance?.lifetime_fee ?? 0, accent: "text-destructive" },
    { icon: Banknote, label: t("Total ditarik"), value: balance?.lifetime_withdrawn ?? 0, accent: "text-foreground" },
  ];

  return (
    <PageTransition>
      <div className="p-4 md:p-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
              <Wallet className="w-6 h-6 text-primary" /> {t("Saldo")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t("Pendapatan reservasi masuk ke saldo setelah dipotong fee Ventera")} {feePct}%.
            </p>
          </div>
          <button
            onClick={() => setWithdrawOpen(true)}
            disabled={available <= 0}
            className="px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
          >
            <ArrowDownToLine className="w-4 h-4" /> {t("Tarik Saldo")}
          </button>
        </div>

        {/* Stat cards */}
        <motion.div variants={staggerContainer} initial="hidden" animate="show"
          className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4 mb-5">
          {stats.map((s) => (
            <motion.div key={s.label} variants={staggerItem}
              className={`bg-card rounded-xl border p-4 ${s.highlight ? "border-primary/40 ring-1 ring-primary/20" : "border-border"}`}>
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <s.icon className="w-4 h-4" /> <span className="text-xs">{s.label}</span>
              </div>
              {balLoading ? (
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              ) : (
                <p className={`text-xl md:text-2xl font-bold ${s.accent}`}>{formatIDR(s.value)}</p>
              )}
            </motion.div>
          ))}
        </motion.div>

        {/* How the cut works */}
        <div className="bg-muted/40 border border-border rounded-xl p-4 mb-5 flex gap-3 text-sm text-muted-foreground">
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
          <p>
            {t("Setiap pembayaran reservasi otomatis dipotong")} <span className="font-semibold text-destructive">{feePct}%</span> {t("untuk pemeliharaan Ventera")}.{" "}
            {t("Contoh: pembayaran")} <span className="font-medium text-foreground">{formatIDR(1_000_000)}</span> → {t("fee")} <span className="font-medium text-destructive">{formatIDR(1_000_000 * feePct / 100)}</span>, {t("masuk saldo")} <span className="font-medium text-success">{formatIDR(1_000_000 * (1 - feePct / 100))}</span>.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Ledger */}
          <div className="lg:col-span-2 bg-card rounded-xl border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h2 className="font-semibold text-foreground text-sm">{t("Riwayat saldo")}</h2>
            </div>
            <div className="overflow-x-auto">
              {ledger.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-10">{t("Belum ada transaksi")}</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b border-border">
                      <th className="px-4 py-2 font-medium">{t("Tanggal")}</th>
                      <th className="px-4 py-2 font-medium">{t("Keterangan")}</th>
                      <th className="px-4 py-2 font-medium text-right">{t("Bruto")}</th>
                      <th className="px-4 py-2 font-medium text-right">{t("Fee")}</th>
                      <th className="px-4 py-2 font-medium text-right">{t("Saldo")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.map((e) => {
                      const income = e.entry_type === "reservation_income";
                      return (
                        <tr key={e.id} className="border-b border-border/60 last:border-0">
                          <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{formatDate(e.created_at)}</td>
                          <td className="px-4 py-2.5 text-foreground">{e.description}</td>
                          <td className="px-4 py-2.5 text-right text-muted-foreground">{income ? formatIDR(e.gross_amount) : "—"}</td>
                          <td className="px-4 py-2.5 text-right text-destructive">{income ? "−" + formatIDR(e.fee_amount) : "—"}</td>
                          <td className={`px-4 py-2.5 text-right font-medium ${e.net_amount >= 0 ? "text-success" : "text-foreground"}`}>
                            {e.net_amount >= 0 ? "+" : "−"}{formatIDR(Math.abs(e.net_amount))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Payout history */}
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h2 className="font-semibold text-foreground text-sm">{t("Penarikan")}</h2>
            </div>
            <div className="divide-y divide-border/60">
              {payouts.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-10">{t("Belum ada penarikan")}</p>
              ) : (
                payouts.map((p) => (
                  <div key={p.id} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{formatIDR(p.amount)}</p>
                      <p className="text-xs text-muted-foreground truncate">{p.bank_name} · {formatDate(p.created_at)}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium shrink-0 ${payoutStatusStyle[p.status] ?? "bg-muted text-muted-foreground"}`}>
                      {t(payoutStatusLabel[p.status] ?? p.status)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <WithdrawDialog open={withdrawOpen} onOpenChange={setWithdrawOpen} available={available} />
    </PageTransition>
  );
}
