import { useState } from "react";
import { CheckCircle2, RotateCcw, Plus, Loader2, BanknoteX, Trash2, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { tr } from "@/lib/i18n";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  useHotelInvoices, useIssueInvoices, useRecordPayment, useUndoPayments,
  useCreateInvoice, useSetInvoiceWaived, useDeleteInvoice,
} from "@/hooks/useSubscriptions";
import { periodOf, periodLabel } from "@/services/subscriptionService";
import { Table, Th, Td, EmptyState, formatIDR } from "./widgets";

// Buku tagihan langganan satu hotel, di dalam halaman detail hotel.
//
// Uang langganan tidak lewat GoStay, jadi semua yang bisa dilakukan di sini
// adalah pencatatan: menerbitkan tagihan, mengakui uangnya masuk, dan melepas
// tagihan yang tidak jadi ditagih. Tidak ada tombol yang menggerakkan uang —
// saldo hotel tidak tersentuh sama sekali oleh langganan.
//
// Tiga jalan melepas tagihan, dan bedanya penting:
//   • Bebaskan  — barisnya tetap ada beserta alasannya, keluar dari gerbang.
//                 Ini yang dipakai kalau memang tidak jadi ditagih.
//   • Hapus     — hanya untuk tagihan yang SALAH TERBIT. Ditolak database
//                 begitu ada pembayaran, karena menghapusnya ikut menghapus
//                 catatan uang yang sudah diterima.
//   • Tandai lunas — bukan melepas: itu mencatat uang yang benar-benar masuk.

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
  const record = useRecordPayment();
  const undo = useUndoPayments();
  const create = useCreateInvoice();
  const waive = useSetInvoiceWaived();
  const hapus = useDeleteInvoice();

  const thisPeriod = periodOf();
  const hasCurrent = invoices.some((i) => i.period === thisPeriod);

  // Form tagih manual — disembunyikan sampai diminta, supaya jalur normalnya
  // tetap satu tombol dan yang di luar kebiasaan terasa memang di luar kebiasaan.
  const [manualOpen, setManualOpen] = useState(false);
  const [bulan, setBulan] = useState(thisPeriod.slice(0, 7));
  const [nominal, setNominal] = useState(amount > 0 ? String(amount) : "");
  const [catatan, setCatatan] = useState("");

  function gagal(e: unknown, judul: string) {
    toast({ title: tr(judul), description: (e as Error).message, variant: "destructive" });
  }

  async function issueCurrent() {
    if (amount <= 0) {
      toast({ title: tr("Tarif langganan belum diisi"), variant: "destructive" });
      return;
    }
    try {
      const n = await issue.mutateAsync({ tenantId });
      toast({ title: n > 0 ? `${n} ${tr("tagihan diterbitkan")}` : tr("Semua bulan sudah tertagih") });
    } catch (e) { gagal(e, "Gagal menerbitkan tagihan"); }
  }

  async function tagihManual() {
    const jumlah = Number(nominal.replace(/[^\d]/g, ""));
    if (!/^\d{4}-\d{2}$/.test(bulan)) {
      toast({ title: tr("Bulan tagihan belum benar"), variant: "destructive" });
      return;
    }
    if (!(jumlah > 0)) {
      toast({ title: tr("Nominal tagihan harus lebih dari nol"), variant: "destructive" });
      return;
    }
    try {
      await create.mutateAsync({
        tenantId, period: `${bulan}-01`, amount: jumlah, by,
        note: catatan.trim() || undefined,
      });
      toast({ title: `${tr("Tagihan diterbitkan")} — ${periodLabel(`${bulan}-01`)}` });
      setManualOpen(false);
      setCatatan("");
    } catch (e) {
      // Bulan yang sudah punya tagihan ditolak UNIQUE (tenant_id, period).
      // Kode SQL-nya, bukan teks pesannya: 23505 = unique_violation, dan teks
      // PostgREST bisa berubah antar versi.
      const kembar = (e as { code?: string }).code === "23505";
      gagal(e, kembar ? "Bulan ini sudah punya tagihan" : "Gagal menerbitkan tagihan");
    }
  }

  async function mark(inv: (typeof invoices)[number], lunas: boolean) {
    try {
      if (lunas) await record.mutateAsync({ invoice: inv, by });
      else await undo.mutateAsync({ invoiceId: inv.id });
      toast({ title: lunas ? tr("Pembayaran dicatat") : tr("Pencatatan pembayaran dibatalkan") });
    } catch (e) { gagal(e, "Gagal mengubah status"); }
  }

  async function lepas(inv: (typeof invoices)[number]) {
    // Alasannya diminta, bukan opsional-diam: tiga bulan lagi tidak ada yang
    // ingat kenapa hotel ini tidak jadi ditagih.
    const alasan = window.prompt(tr("Alasan membebaskan tagihan ini?"), "");
    if (alasan === null) return;
    try {
      await waive.mutateAsync({ id: inv.id, waived: true, by, reason: alasan });
      toast({ title: `${tr("Tagihan dibebaskan")} — ${periodLabel(inv.period)}` });
    } catch (e) { gagal(e, "Gagal membebaskan tagihan"); }
  }

  async function tagihLagi(inv: (typeof invoices)[number]) {
    try {
      await waive.mutateAsync({ id: inv.id, waived: false, by });
      toast({ title: tr("Pembebasan dicabut — tagihan aktif lagi") });
    } catch (e) { gagal(e, "Gagal mengubah status"); }
  }

  async function buang(inv: (typeof invoices)[number]) {
    if (!window.confirm(`${tr("Hapus tagihan")} ${periodLabel(inv.period)}?`)) return;
    try {
      await hapus.mutateAsync({ id: inv.id });
      toast({ title: tr("Tagihan dihapus") });
    } catch (e) { gagal(e, "Gagal menghapus tagihan"); }
  }

  const sibuk = issue.isPending || create.isPending || waive.isPending || hapus.isPending
    || record.isPending || undo.isPending;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">{tr("Tagihan Langganan")}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setManualOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> {tr("Tagih manual")}
          </button>
          <button
            onClick={issueCurrent}
            disabled={issue.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
          >
            {issue.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            {hasCurrent ? tr("Terbitkan tagihan yang terlewat") : `${tr("Terbitkan tagihan")} ${periodLabel(thisPeriod)}`}
          </button>
        </div>
      </div>

      {manualOpen && (
        <div className="rounded-xl border border-border bg-muted/30 p-3 flex flex-wrap items-end gap-3">
          <label className="text-xs text-muted-foreground">
            <span className="mb-1 block">{tr("Bulan")}</span>
            <input
              type="month" value={bulan} onChange={(e) => setBulan(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            <span className="mb-1 block">{tr("Nominal")} (Rp)</span>
            <input
              value={nominal} inputMode="numeric" placeholder="500000"
              onChange={(e) => setNominal(e.target.value.replace(/[^\d]/g, ""))}
              className="w-36 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
          </label>
          <label className="text-xs text-muted-foreground flex-1 min-w-[12rem]">
            <span className="mb-1 block">{tr("Keterangan")} ({tr("opsional")})</span>
            <input
              value={catatan} onChange={(e) => setCatatan(e.target.value)}
              placeholder={tr("mis. tagihan setup awal")}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
          </label>
          <button
            onClick={tagihManual}
            disabled={create.isPending}
            className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : tr("Tagih")}
          </button>
        </div>
      )}

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
                  {inv.waived_reason && (
                    <p className="text-xs font-normal text-muted-foreground mt-0.5 whitespace-normal max-w-xs">
                      {tr("dibebaskan")}: {inv.waived_reason}
                    </p>
                  )}
                  {inv.note && (
                    <p className="text-xs font-normal text-muted-foreground mt-0.5 whitespace-normal max-w-xs">
                      {inv.note}
                    </p>
                  )}
                </Td>
                <Td className="text-right tabular-nums">
                  {formatIDR(inv.amount)}
                  {inv.paid_total > 0 && inv.paid_total < inv.amount && (
                    <p className="text-xs font-normal text-warning">
                      {tr("sudah masuk")} {formatIDR(inv.paid_total)}
                    </p>
                  )}
                </Td>
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
                  <div className="inline-flex items-center gap-3">
                    {inv.status === "paid" && (
                      <button
                        onClick={() => mark(inv, false)}
                        disabled={undo.isPending}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> {tr("Batalkan")}
                      </button>
                    )}
                    {inv.status === "unpaid" && (
                      <>
                        <button
                          onClick={() => mark(inv, true)}
                          disabled={record.isPending}
                          className="inline-flex items-center gap-1 text-xs font-medium text-success hover:underline disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> {tr("Tandai lunas")}
                        </button>
                        <button
                          onClick={() => lepas(inv)}
                          disabled={sibuk}
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                        >
                          <BanknoteX className="w-3.5 h-3.5" /> {tr("Bebaskan")}
                        </button>
                      </>
                    )}
                    {inv.status === "waived" && (
                      <button
                        onClick={() => tagihLagi(inv)}
                        disabled={sibuk}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                      >
                        <Undo2 className="w-3.5 h-3.5" /> {tr("Tagih lagi")}
                      </button>
                    )}
                    {/* Hanya untuk tagihan yang salah terbit. Disembunyikan
                        begitu ada uang masuk ATAU tautan Xendit sudah terbit —
                        database menolak keduanya juga, tapi tombol yang pasti
                        gagal lebih baik tidak ditawarkan. */}
                    {inv.paid_total === 0 && !inv.gateway_ref && (
                      <button
                        onClick={() => buang(inv)}
                        disabled={sibuk}
                        className="inline-flex items-center gap-1 text-xs text-destructive hover:underline disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> {tr("Hapus")}
                      </button>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
