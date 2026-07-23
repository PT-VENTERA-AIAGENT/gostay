import { useEffect, useState } from "react";
import { Loader2, Wallet } from "lucide-react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { useRequestPayout } from "@/hooks/useSaldo";
import { useToast } from "@/hooks/use-toast";
import { tr } from "@/lib/i18n";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The hotel's currently available (withdrawable) balance. */
  available: number;
}

const field =
  "w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40";

function formatIDR(n: number): string {
  return "Rp" + Math.round(n).toLocaleString("id-ID");
}

const empty = { amount: "", bankName: "", bankAccount: "", accountHolder: "", note: "" };

export default function WithdrawDialog({ open, onOpenChange, available }: Props) {
  const request = useRequestPayout();
  const { toast } = useToast();
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setForm(empty); setError(null); }
  }, [open]);

  const amount = Number(form.amount);
  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit() {
    setError(null);
    if (!(amount > 0)) { setError(tr("Masukkan jumlah penarikan yang valid")); return; }
    if (amount > available) { setError(tr("Jumlah melebihi saldo tersedia")); return; }
    if (!form.bankName.trim() || !form.bankAccount.trim() || !form.accountHolder.trim()) {
      setError(tr("Lengkapi data rekening tujuan")); return;
    }
    try {
      await request.mutateAsync({
        amount,
        bankName: form.bankName.trim(),
        bankAccount: form.bankAccount.trim(),
        accountHolder: form.accountHolder.trim(),
        note: form.note.trim() || undefined,
      });
      toast({ title: `${tr("Permintaan penarikan dikirim")} — ${formatIDR(amount)}` });
      onOpenChange(false);
    } catch (e) {
      // The DB trigger raises on insufficient balance; surface a friendly message.
      const msg = (e as Error).message ?? "";
      setError(/Saldo tidak cukup/i.test(msg) ? tr("Saldo tidak cukup untuk penarikan ini") : msg || tr("Gagal mengirim permintaan"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-primary" /> {tr("Tarik Saldo")}
          </DialogTitle>
          <DialogDescription>
            {tr("Saldo tersedia")}: <span className="font-semibold text-foreground">{formatIDR(available)}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">{tr("Jumlah penarikan")}</label>
            <input type="number" inputMode="numeric" min={0} max={available} value={form.amount}
              onChange={set("amount")} placeholder="0" className={field} />
            <button type="button" onClick={() => setForm((f) => ({ ...f, amount: String(available) }))}
              className="mt-1 text-xs text-primary hover:underline">{tr("Tarik semua")}</button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">{tr("Nama bank")}</label>
              <input value={form.bankName} onChange={set("bankName")} placeholder="BCA" className={field} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{tr("Nomor rekening")}</label>
              <input value={form.bankAccount} onChange={set("bankAccount")} placeholder="1234567890" className={field} />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{tr("Atas nama")}</label>
            <input value={form.accountHolder} onChange={set("accountHolder")} className={field} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{tr("Catatan")} ({tr("opsional")})</label>
            <input value={form.note} onChange={set("note")} className={field} />
          </div>
          {error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-2.5 text-sm text-destructive">{error}</div>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <button onClick={() => onOpenChange(false)} disabled={request.isPending}
            className="px-4 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50">
            {tr("Batal")}
          </button>
          <button onClick={handleSubmit} disabled={request.isPending}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2">
            {request.isPending && <Loader2 className="w-4 h-4 animate-spin" />} {tr("Kirim Permintaan")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
