import { CheckCircle2, RotateCcw, Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { tr } from "@/lib/i18n";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useHotelInvoices, useIssueInvoices, useSetInvoiceStatus } from "@/hooks/useSubscriptions";
import { periodOf, periodLabel } from "@/services/subscriptionService";
import { Table, Th, Td, EmptyState, formatIDR } from "./widgets";

// Buku tagihan langganan satu hotel, di dalam halaman detail hotel.
//
// Pembayarannya offline (transfer ke Ventera), jadi yang bisa dilakukan di sini
// hanya dua: menerbitkan tagihan bulan berjalan, dan mengakui uangnya sudah
// masuk. Tidak ada tombol yang menggerakkan uang — saldo hotel tidak tersentuh
// sama sekali oleh langganan.

const STATUS_TONE: Record<string, string> = {
  paid: "bg-success/15 text-success",
  unpaid: "bg-warning/15 text-warning",
  waived: "bg-muted text-muted-foreground",
};
const STATUS_LABEL: Record<string, string> = {
  paid: "Lunas", unpaid: "Belum bayar", waived: "Dibebaskan",
};

export default function SubscriptionInvoices({
  tenantId,
  amount,
}: {
  tenantId: string;
  amount: number;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const by = user?.email ?? user?.id ?? "admin";

  const { data: invoices = [], isLoading } = useHotelInvoices(tenantId);
  const issue = useIssueInvoices();
  const setStatus = useSetInvoiceStatus();

  const thisPeriod = periodOf();
  const hasCurrent = invoices.some((i) => i.period === thisPeriod);

  async function issueCurrent() {
    if (amount <= 0) {
      toast({ title: tr("Tarif langganan belum diisi"), variant: "destructive" });
      return;
    }
    try {
      const n = await issue.mutateAsync({
        hotels: [{ tenant_id: tenantId, subscription_amount: amount }],
        period: thisPeriod,
        by,
      });
      toast({
        title: n > 0
          ? `${tr("Tagihan diterbitkan")} — ${periodLabel(thisPeriod)}`
          : tr("Tagihan bulan ini sudah ada"),
      });
    } catch (e) {
      toast({ title: tr("Gagal menerbitkan tagihan"), description: (e as Error).message, variant: "destructive" });
    }
  }

  async function mark(id: number, paid: boolean) {
    try {
      await setStatus.mutateAsync({ id, status: paid ? "paid" : "unpaid", by });
      toast({ title: paid ? tr("Ditandai lunas") : tr("Status dikembalikan ke belum bayar") });
    } catch (e) {
      toast({ title: tr("Gagal mengubah status"), description: (e as Error).message, variant: "destructive" });
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">{tr("Tagihan Langganan")}</h2>
        <button
          onClick={issueCurrent}
          disabled={issue.isPending || hasCurrent}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
        >
          {issue.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          {hasCurrent ? tr("Tagihan bulan ini sudah ada") : `${tr("Terbitkan tagihan")} ${periodLabel(thisPeriod)}`}
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : invoices.length === 0 ? (
        <EmptyState message={tr("Belum ada tagihan langganan")} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{tr("Periode")}</Th>
              <Th className="text-right">{tr("Tagihan")}</Th>
              <Th>Status</Th>
              <Th>{tr("Dibayar")}</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} className="hover:bg-muted/30">
                <Td className="font-medium text-foreground capitalize">
                  {periodLabel(inv.period)}
                  {/* Uang yang masuk tapi tidak melunasi apa pun — kurang bayar,
                      bayar ganda, atau bayar atas tagihan yang sudah dibebaskan.
                      Ditampilkan di sini karena inilah tempat operator memang
                      melihat tagihan; di log server ia tidak pernah terbaca. */}
                  {inv.gateway_note && (
                    <p className="text-xs font-normal text-warning mt-0.5 whitespace-normal max-w-xs">
                      {inv.gateway_note}
                    </p>
                  )}
                </Td>
                <Td className="text-right tabular-nums">{formatIDR(inv.amount)}</Td>
                <Td>
                  <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-medium", STATUS_TONE[inv.status])}>
                    {tr(STATUS_LABEL[inv.status] ?? inv.status)}
                  </span>
                </Td>
                <Td className="text-muted-foreground text-xs">
                  {inv.paid_at
                    ? `${new Date(inv.paid_at).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}${inv.paid_method ? ` · ${inv.paid_method}` : ""}`
                    : "—"}
                </Td>
                <Td className="text-right">
                  {inv.status === "paid" ? (
                    <button
                      onClick={() => mark(inv.id, false)}
                      disabled={setStatus.isPending}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> {tr("Batalkan")}
                    </button>
                  ) : (
                    <button
                      onClick={() => mark(inv.id, true)}
                      disabled={setStatus.isPending}
                      className="inline-flex items-center gap-1 text-xs font-medium text-success hover:underline disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> {tr("Tandai lunas")}
                    </button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
