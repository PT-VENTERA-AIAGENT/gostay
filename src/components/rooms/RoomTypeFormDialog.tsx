import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { useCreateRoomType, useUpdateRoomType } from "@/hooks/useRooms";
import { useToast } from "@/hooks/use-toast";
import type { RoomType } from "@/types/database.types";
import { tr } from "@/lib/i18n";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Passing a room type switches the dialog to edit mode. */
  roomType?: RoomType | null;
}

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const emptyForm = { name: "", slug: "", description: "", base_rate: "", max_occupancy: "2", amenities: "", is_active: true };

export default function RoomTypeFormDialog({ open, onOpenChange, roomType }: Props) {
  const create = useCreateRoomType();
  const update = useUpdateRoomType();
  const { toast } = useToast();
  const editing = Boolean(roomType);

  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  // Once the user edits the slug by hand, stop auto-deriving it from the name.
  const [slugTouched, setSlugTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSlugTouched(Boolean(roomType));
    setForm(roomType
      ? {
          name: roomType.name,
          slug: roomType.slug,
          description: roomType.description ?? "",
          base_rate: String(roomType.base_rate),
          max_occupancy: String(roomType.max_occupancy),
          amenities: (roomType.amenities ?? []).join(", "),
          is_active: roomType.is_active,
        }
      : emptyForm);
  }, [open, roomType]);

  const pending = create.isPending || update.isPending;

  function setName(name: string) {
    setForm((f) => ({ ...f, name, slug: slugTouched ? f.slug : slugify(name) }));
  }

  async function handleSave() {
    setError(null);
    const rate = Number(form.base_rate);
    const occ = Number(form.max_occupancy);
    if (!form.name.trim()) { setError("Nama tipe kamar wajib diisi."); return; }
    if (!form.slug.trim()) { setError("Slug wajib diisi."); return; }
    if (!Number.isFinite(rate) || rate <= 0) { setError("Harga per malam harus lebih dari 0."); return; }
    if (!Number.isInteger(occ) || occ < 1) { setError("Kapasitas minimal 1 tamu."); return; }

    const payload = {
      name: form.name.trim(),
      slug: slugify(form.slug),
      description: form.description.trim() || null,
      base_rate: rate,
      max_occupancy: occ,
      amenities: form.amenities.split(",").map((a) => a.trim()).filter(Boolean),
      photos: roomType?.photos ?? [],
      is_active: form.is_active,
    };

    try {
      if (roomType) {
        await update.mutateAsync({ id: roomType.id, payload });
        toast({ title: tr("Tipe kamar diperbarui"), description: payload.name });
      } else {
        await create.mutateAsync(payload);
        toast({ title: tr("Tipe kamar dibuat"), description: payload.name });
      }
      onOpenChange(false);
    } catch (e) {
      // Unique-slug clashes surface here as a Postgres 23505.
      const msg = e instanceof Error ? e.message : "Gagal menyimpan.";
      setError(/duplicate|unique|23505/i.test(msg) ? "Slug itu sudah dipakai tipe kamar lain." : msg);
    }
  }

  const field = "w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Tipe Kamar" : "Tambah Tipe Kamar"}</DialogTitle>
          <DialogDescription>
            {editing ? "Ubah detail tipe kamar." : "Tipe kamar menentukan tarif dan kapasitas untuk kamar-kamar di bawahnya."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Nama</label>
              <input className={field} value={form.name} onChange={(e) => setName(e.target.value)} placeholder="Deluxe Room" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Slug</label>
              <input className={field} value={form.slug}
                onChange={(e) => { setSlugTouched(true); setForm((f) => ({ ...f, slug: e.target.value })); }}
                placeholder="deluxe" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Deskripsi</label>
            <textarea className={`${field} resize-none`} rows={2} value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Kamar luas dengan pemandangan kota..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Harga / malam (IDR)</label>
              <input className={field} type="number" min={0} value={form.base_rate}
                onChange={(e) => setForm((f) => ({ ...f, base_rate: e.target.value }))} placeholder="850000" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Kapasitas (tamu)</label>
              <input className={field} type="number" min={1} value={form.max_occupancy}
                onChange={(e) => setForm((f) => ({ ...f, max_occupancy: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Fasilitas</label>
            <input className={field} value={form.amenities}
              onChange={(e) => setForm((f) => ({ ...f, amenities: e.target.value }))} placeholder="WiFi, AC, TV, Mini Bar" />
            <p className="text-xs text-muted-foreground mt-1">Pisahkan dengan koma.</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
            Aktif (tampil untuk dipesan)
          </label>

          {error && <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-2.5 text-sm text-destructive">{error}</div>}
        </div>

        <DialogFooter>
          <button onClick={() => onOpenChange(false)} disabled={pending}
            className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50">
            Batal
          </button>
          <button onClick={handleSave} disabled={pending}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-2 disabled:opacity-50">
            {pending && <Loader2 className="w-4 h-4 animate-spin" />} {editing ? "Simpan" : "Buat"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
