import { useMemo } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, Loader2, CheckCircle2, Plus, AlertTriangle, FlaskConical } from "lucide-react";
import PageTransition from "@/components/shared/PageTransition";
import { cn } from "@/lib/utils";
import { tr } from "@/lib/i18n";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useSubscriptions, useIssueInvoices, useSetInvoiceStatus } from "@/hooks/useSubscriptions";
import { usePaymentConfig } from "@/hooks/useSaldo";
import { periodOf, periodLabel } from "@/services/subscriptionService";
import { PageHeader, StatCard, Table, Th, Td, EmptyState, formatIDR } from "@/components/platform/widgets";

// Penagihan langganan bulanan, dilihat dari sisi Ventera.
//
// Hotel di halaman ini TIDAK dipotong 7%; mereka membayar biaya tetap tiap bulan
// lewat transfer di luar aplikasi. Karena uangnya tidak lewat GoStay, tidak ada
// yang bisa mengabarkan "sudah masuk" selain operator — jadi halaman ini adalah
// daftar tagih: siapa belum bayar bulan apa, dan tombol untuk mengakuinya.

export default function PlatformSubscriptions() {
  const { user } = useAuth();
  const { toast } = useToast();
  const by = user?.email ?? user?.id ?? "admin";

  const { data: hotels = [], isLoading } = useSubscriptions();
  const { data: config } = usePaymentConfig();
  const issue = useIssueInvoices();
  const setStatus = useSetInvoiceStatus();

  const thisPeriod = periodOf();
  // `aktif` = masih berlangganan. Sisanya adalah hotel yang sudah pindah ke
  // komisi tapi meninggalkan tagihan terbuka: tetap ditagih, tidak diterbitkan
  // tagihan baru, dan tidak dihitung sebagai pelanggan.
  const aktif = useMemo(() => hotels.filter((h) => h.billing_mode === "subscription"), [hotels]);
  const totals = useMemo(() => ({
    monthly: aktif.reduce((s, h) => s + h.subscription_amount, 0),
    unbilled: aktif.filter((h) => !h.current && h.subscription_amount > 0),
    paid: aktif.filter((h) => h.current?.status === "paid").length,
    overdue: hotels.reduce((s, h) => s + h.overdue_amount, 0),
  }), [hotels, aktif]);

  async function issueAll() {
    if (totals.unbilled.length === 0) return;
    try {
      const n = await issue.mutateAsync({ hotels: totals.unbilled, period: thisPeriod, by });
      toast({ title: `${n} ${tr("tagihan diterbitkan untuk")} ${periodLabel(thisPeriod)}` });
    } catch (e) {
      toast({ title: tr("Gagal menerbitkan tagihan"), description: (e as Error).message, variant: "destructive" });
    }
  }

  async function markPaid(id: number) {
    try {
      await setStatus.mutateAsync({ id, status: "paid", by });
      toast({ title: tr("Ditandai lunas") });
    } catch (e) {
      toast({ title: tr("Gagal mengubah status"), description: (e as Error).message, variant: "destructive" });
    }
  }

  return (
    <PageTransition>
      <PageHeader
        icon={<CalendarClock className="w-5 h-5" />}
        title={tr("Langganan Bulanan")}
        description={tr("Hotel yang membayar biaya tetap tiap bulan, bukan potongan per transaksi. Pembayarannya di luar aplikasi — tandai lunas setelah transfer diterima.")}
        action={
          <button
            onClick={issueAll}
            disabled={issue.isPending || totals.unbilled.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {issue.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {totals.unbilled.length > 0
              ? `${tr("Terbitkan")} ${totals.unbilled.length} ${tr("tagihan")}`
              : tr("Tagihan bulan ini lengkap")}
          </button>
        }
      />

      <div className="p-4 md:p-6 space-y-5">
        {/* Hotel bisa membayar tagihannya sendiri lewat Xendit (056). Selama
            lingkungan ini masih sandbox, tautan yang mereka buka TIDAK menerima
            uang sungguhan — dan itu tidak kelihatan dari layar mana pun kecuali
            disebut di sini. Saklarnya sengaja tidak ada di UI: payment_config
            memang disegel dari tulisan klien sejak 030, dan ini switch sekali
            seumur hidup. Pindahkan lewat psql:
              update payment_config set subscription_mode='live',
                     updated_by='<anda>' where id = true; */}
        {config?.subscriptionMode !== "live" && (
          <div className="bg-warning/10 border border-warning/20 rounded-xl p-3 flex gap-2.5 text-sm text-foreground">
            <FlaskConical className="w-4 h-4 shrink-0 mt-0.5 text-warning" />
            <p>
              {tr("Pembayaran langganan masih memakai Xendit sandbox — tautan yang dibuka hotel tidak menerima uang sungguhan.")}{" "}
              <code className="text-xs">payment_config.subscription_mode = 'live'</code> {tr("untuk menyalakannya.")}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <StatCard label={tr("Hotel berlangganan")} value={aktif.length} />
          <StatCard label={tr("Nilai per bulan")} value={formatIDR(totals.monthly)} />
          <StatCard label={`${tr("Lunas")} ${periodLabel(thisPeriod)}`} value={`${totals.paid}/${aktif.length}`} />
          <StatCard label={tr("Tunggakan bulan lalu")} value={formatIDR(totals.overdue)} />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : hotels.length === 0 ? (
          <EmptyState message={tr("Belum ada hotel yang memilih langganan bulanan. Ubah model tagihan di halaman detail hotel.")} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{tr("Hotel")}</Th>
                <Th className="text-right">{tr("Tarif/bulan")}</Th>
                <Th className="text-center">{tr("Jatuh tempo")}</Th>
                <Th className="capitalize">{periodLabel(thisPeriod)}</Th>
                <Th>{tr("Tunggakan")}</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {hotels.map((h) => {
                const inv = h.current;
                const mantan = h.billing_mode !== "subscription";
                return (
                  <tr key={h.tenant_id} className="hover:bg-muted/30">
                    <Td>
                      <Link to={`/platform/hotels/${h.tenant_id}`} className="font-medium text-foreground hover:text-primary">
                        {h.name}
                      </Link>
                      <div>
                        <code className="text-xs text-muted-foreground">/{h.slug}</code>
                        {mantan && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            ({tr("sudah kembali ke komisi")})
                          </span>
                        )}
                      </div>
                    </Td>
                    <Td className="text-right tabular-nums">
                      {mantan ? <span className="text-muted-foreground">—</span> : formatIDR(h.subscription_amount)}
                    </Td>
                    <Td className="text-center text-muted-foreground">{mantan ? "—" : `${tr("tgl")} ${h.subscription_day}`}</Td>
                    <Td>
                      {!inv ? (
                        <span className="text-xs text-muted-foreground">{tr("belum diterbitkan")}</span>
                      ) : (
                        <span className={cn(
                          "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                          inv.status === "paid" ? "bg-success/15 text-success"
                            : inv.status === "waived" ? "bg-muted text-muted-foreground"
                            : "bg-warning/15 text-warning",
                        )}>
                          {tr(inv.status === "paid" ? "Lunas" : inv.status === "waived" ? "Dibebaskan" : "Belum bayar")}
                        </span>
                      )}
                    </Td>
                    <Td>
                      {h.overdue_count > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          {h.overdue_count} {tr("bulan")} · {formatIDR(h.overdue_amount)}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </Td>
                    <Td className="text-right">
                      {inv && inv.status === "unpaid" && (
                        <button
                          onClick={() => markPaid(inv.id)}
                          disabled={setStatus.isPending}
                          className="inline-flex items-center gap-1 text-xs font-medium text-success hover:underline disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> {tr("Tandai lunas")}
                        </button>
                      )}
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
