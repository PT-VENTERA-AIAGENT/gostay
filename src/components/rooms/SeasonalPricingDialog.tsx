import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import DatePicker from "@/components/shared/DatePicker";
import { createSeasonalPricing } from "@/services/roomService";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomTypeId: string;
}

const empty = { label: "", start_date: "", end_date: "", rate: "" };

export default function SeasonalPricingDialog({ open, onOpenChange, roomTypeId }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (open) { setForm(empty); setError(null); } }, [open]);

  const create = useMutation({
    mutationFn: () => createSeasonalPricing({
      room_type_id: roomTypeId,
      label: form.label.trim(),
      start_date: form.start_date,
      end_date: form.end_date,
      rate: Number(form.rate),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["seasonal-pricing", roomTypeId] });
      toast({ title: "Aturan harga ditambahkan", description: form.label });
      onOpenChange(false);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Gagal menyimpan."),
  });

  function submit() {
    setError(null);
    const rate = Number(form.rate);
    if (!form.label.trim()) return setError("Beri nama aturan (mis. 'Lebaran').");
    if (!form.start_date || !form.end_date) return setError("Isi tanggal mulai dan selesai.");
    if (form.end_date < form.start_date) return setError("Tanggal selesai harus setelah tanggal mulai.");
    if (!Number.isFinite(rate) || rate <= 0) return setError("Tarif harus lebih dari 0.");
    create.mutate();
  }

  const field = "w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Aturan Harga Musiman</DialogTitle>
          <DialogDescription>Tarif khusus untuk rentang tanggal tertentu (mis. musim liburan).</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Nama Aturan</label>
            <input className={field} value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="Lebaran 2026" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Mulai</label>
              <DatePicker value={form.start_date} onChange={(v) => setForm((f) => ({ ...f, start_date: v }))} placeholder="Mulai" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Selesai</label>
              <DatePicker value={form.end_date} onChange={(v) => setForm((f) => ({ ...f, end_date: v }))} min={form.start_date || undefined} placeholder="Selesai" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Tarif / malam (IDR)</label>
            <input className={field} type="number" min={0} value={form.rate} onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))} placeholder="1500000" />
          </div>
          {error && <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-2.5 text-sm text-destructive">{error}</div>}
        </div>
        <DialogFooter>
          <button onClick={() => onOpenChange(false)} disabled={create.isPending} className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50">Batal</button>
          <button onClick={submit} disabled={create.isPending} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-2 disabled:opacity-50">
            {create.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Tambah
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
