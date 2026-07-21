import { useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { useCreateRoom, useUpdateRoom, useDeleteRoom, useRoomTypes } from "@/hooks/useRooms";
import { useToast } from "@/hooks/use-toast";
import type { Room } from "@/types/database.types";
import { tr } from "@/lib/i18n";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Passing a room switches the dialog to edit mode. */
  room?: Room | null;
  /** Preselect this room type when adding (e.g. from a room type's page). */
  defaultTypeId?: string;
}

const emptyForm = { number: "", floor: "1", room_type_id: "", is_active: true };

export default function RoomFormDialog({ open, onOpenChange, room, defaultTypeId }: Props) {
  const { data: roomTypes = [] } = useRoomTypes();
  const create = useCreateRoom();
  const update = useUpdateRoom();
  const remove = useDeleteRoom();
  const { toast } = useToast();
  const editing = Boolean(room);

  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setConfirmDelete(false);
    setForm(room
      ? { number: room.number, floor: String(room.floor), room_type_id: room.room_type_id, is_active: room.is_active }
      : { ...emptyForm, room_type_id: defaultTypeId ?? roomTypes[0]?.id ?? "" });
  }, [open, room, roomTypes, defaultTypeId]);

  const pending = create.isPending || update.isPending || remove.isPending;

  async function handleSave() {
    setError(null);
    const floor = Number(form.floor);
    if (!form.number.trim()) { setError("Nomor kamar wajib diisi."); return; }
    if (!form.room_type_id) { setError("Pilih tipe kamar."); return; }
    if (!Number.isInteger(floor) || floor < 0) { setError("Lantai tidak valid."); return; }

    const payload = {
      number: form.number.trim(),
      floor,
      room_type_id: form.room_type_id,
      is_active: form.is_active,
    };
    try {
      if (room) {
        await update.mutateAsync({ id: room.id, payload });
        toast({ title: tr("Kamar diperbarui"), description: `Kamar ${payload.number}` });
      } else {
        await create.mutateAsync(payload);
        toast({ title: tr("Kamar dibuat"), description: `Kamar ${payload.number}` });
      }
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Gagal menyimpan.";
      setError(/duplicate|unique|23505/i.test(msg) ? "Nomor kamar itu sudah ada." : msg);
    }
  }

  async function handleDelete() {
    setError(null);
    try {
      // deleteRoom in the service soft-deletes (is_active=false) so a room with
      // bookings keeps its history rather than cascading them away.
      await remove.mutateAsync(room!.id);
      toast({ title: tr("Kamar dinonaktifkan"), description: `Kamar ${room!.number}` });
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menghapus.");
    }
  }

  const field = "w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit Kamar ${room?.number}` : "Tambah Kamar"}</DialogTitle>
          <DialogDescription>
            {roomTypes.length === 0
              ? "Buat tipe kamar dulu sebelum menambah kamar."
              : "Kamar fisik yang bisa dibooking, mewarisi tarif dari tipe kamarnya."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Nomor Kamar</label>
              <input className={field} value={form.number}
                onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))} placeholder="101" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Lantai</label>
              <input className={field} type="number" min={0} value={form.floor}
                onChange={(e) => setForm((f) => ({ ...f, floor: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Tipe Kamar</label>
            <select className={field} value={form.room_type_id}
              onChange={(e) => setForm((f) => ({ ...f, room_type_id: e.target.value }))}>
              <option value="">Pilih tipe...</option>
              {roomTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
            Aktif (bisa dibooking)
          </label>

          {error && <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-2.5 text-sm text-destructive">{error}</div>}
        </div>

        <DialogFooter className="sm:justify-between">
          {editing ? (
            confirmDelete ? (
              <button onClick={handleDelete} disabled={pending}
                className="px-3 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium flex items-center gap-2 disabled:opacity-50">
                {remove.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Yakin nonaktifkan?
              </button>
            ) : (
              <button onClick={() => setConfirmDelete(true)} disabled={pending}
                className="px-3 py-2 rounded-lg border border-destructive/50 text-destructive text-sm font-medium hover:bg-destructive/5 transition-colors flex items-center gap-2 disabled:opacity-50">
                <Trash2 className="w-4 h-4" /> Nonaktifkan
              </button>
            )
          ) : <span />}
          <div className="flex items-center gap-2">
            <button onClick={() => onOpenChange(false)} disabled={pending}
              className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50">
              Batal
            </button>
            <button onClick={handleSave} disabled={pending || roomTypes.length === 0}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-2 disabled:opacity-50">
              {(create.isPending || update.isPending) && <Loader2 className="w-4 h-4 animate-spin" />} {editing ? "Simpan" : "Buat"}
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
