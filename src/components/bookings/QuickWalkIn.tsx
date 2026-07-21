import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, Loader2, Zap, BedDouble, User, Wallet } from "lucide-react";
import { motion } from "framer-motion";
import DatePicker from "@/components/shared/DatePicker";
import { useRoomTypes, useAvailableRooms } from "@/hooks/useRooms";
import { useWalkInCheckIn } from "@/hooks/useBookings";
import { useToast } from "@/hooks/use-toast";
import type { PaymentMethod } from "@/services/frontDeskService";

const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Tunai", transfer: "Transfer", card: "Kartu", qris: "QRIS", other: "Lainnya",
};

function formatIDR(n: number) {
  return "Rp" + Math.round(n).toLocaleString("id-ID");
}
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function nightsBetween(a: string, b: string) {
  if (!a || !b) return 0;
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000));
}

/**
 * Front-desk fast path: a guest at the desk, checked in on one screen. Defaults
 * to a one-night stay starting today, auto-assigns the first free room of the
 * chosen type, and can take the first payment inline.
 */
export default function QuickWalkIn({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { toast } = useToast();

  const today = ymd(new Date());
  const tomorrow = ymd(new Date(Date.now() + 86_400_000));

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [checkIn, setCheckIn] = useState(today);
  const [checkOut, setCheckOut] = useState(tomorrow);
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [roomTypeId, setRoomTypeId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [payNow, setPayNow] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<PaymentMethod>("cash");

  const { data: roomTypes } = useRoomTypes();
  const { data: availableRooms, isFetching: loadingRooms } = useAvailableRooms(
    checkIn, checkOut, roomTypeId || undefined,
  );
  const walkIn = useWalkInCheckIn();

  const rooms = availableRooms ?? [];
  const nights = nightsBetween(checkIn, checkOut);
  const selectedType = roomTypes?.find((t) => t.id === roomTypeId);
  const rate = selectedType ? Number(selectedType.base_rate) : 0;
  const total = rate * nights;
  const datesValid = Boolean(checkIn && checkOut) && nights > 0;
  const canSubmit =
    Boolean(fullName.trim()) && datesValid && Boolean(roomTypeId) && rooms.length > 0 && !walkIn.isPending;

  function submit() {
    const room = roomId ? rooms.find((r) => r.id === roomId) : rooms[0];
    if (!room) { toast({ title: "Tidak ada kamar tipe ini yang kosong", variant: "destructive" }); return; }

    const amount = payNow ? Number(payAmount || total) : 0;
    if (payNow && (!Number.isFinite(amount) || amount <= 0)) {
      toast({ title: "Jumlah pembayaran tidak valid", variant: "destructive" });
      return;
    }

    walkIn.mutate(
      {
        input: {
          fullName, email: email || null, phone: phone || null,
          roomId: room.id, checkIn, checkOut, adults, children, total,
        },
        payment: payNow ? { amount, method: payMethod } : null,
      },
      {
        onSuccess: ({ booking }) => {
          toast({ title: "Check-in walk-in berhasil", description: `${booking.reference} · Kamar ${room.number}` });
          navigate(`/bookings/${booking.id}`);
        },
        onError: (e) => toast({ title: "Gagal check-in", description: (e as Error).message, variant: "destructive" }),
      },
    );
  }

  const inputCls = "w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40";

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-card rounded-xl border border-border w-full max-w-lg max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card">
          <h2 className="font-semibold text-foreground flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" /> Walk-in check-in kilat
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Tutup"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 space-y-4">
          {/* Guest */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> Tamu</p>
            <input className={inputCls} placeholder="Nama tamu *" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <input className={inputCls} placeholder="No. HP (opsional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
              <input className={inputCls} placeholder="Email (opsional)" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>

          {/* Stay */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><BedDouble className="w-3.5 h-3.5" /> Menginap</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Check-in</label>
                <DatePicker value={checkIn} onChange={setCheckIn} placeholder="Check-in" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Check-out</label>
                <DatePicker value={checkOut} onChange={setCheckOut} min={checkIn || undefined} placeholder="Check-out" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Dewasa</label>
                <input className={inputCls} type="number" min={1} value={adults} onChange={(e) => setAdults(Math.max(1, Number(e.target.value)))} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Anak</label>
                <input className={inputCls} type="number" min={0} value={children} onChange={(e) => setChildren(Math.max(0, Number(e.target.value)))} />
              </div>
            </div>
          </div>

          {/* Room */}
          <div className="space-y-2">
            <select className={inputCls} value={roomTypeId} onChange={(e) => { setRoomTypeId(e.target.value); setRoomId(""); }}>
              <option value="">Pilih tipe kamar *…</option>
              {roomTypes?.map((t) => (
                <option key={t.id} value={t.id}>{t.name} — {formatIDR(Number(t.base_rate))}/malam</option>
              ))}
            </select>
            <select className={inputCls} value={roomId} onChange={(e) => setRoomId(e.target.value)} disabled={!datesValid || !roomTypeId}>
              <option value="">Kamar otomatis (pertama yang kosong)</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>Kamar {r.number} (lantai {r.floor})</option>
              ))}
            </select>
            {datesValid && roomTypeId && !loadingRooms && (
              <p className={`text-xs ${rooms.length === 0 ? "text-destructive" : "text-muted-foreground"}`}>
                {rooms.length === 0 ? "Tidak ada kamar tipe ini yang kosong untuk tanggal ini." : `${rooms.length} kamar kosong`}
              </p>
            )}
          </div>

          {/* Payment (optional) */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input type="checkbox" checked={payNow} onChange={(e) => { setPayNow(e.target.checked); if (e.target.checked && !payAmount) setPayAmount(String(total)); }} className="accent-primary" />
              <Wallet className="w-3.5 h-3.5 text-muted-foreground" /> Tarik pembayaran sekarang
            </label>
            {payNow && (
              <div className="grid grid-cols-2 gap-2">
                <input className={inputCls} type="number" min="0" step="1000" placeholder={`Jumlah (${formatIDR(total)})`} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
                <select className={inputCls} value={payMethod} onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}>
                  {(Object.keys(METHOD_LABELS) as PaymentMethod[]).map((m) => (
                    <option key={m} value={m}>{METHOD_LABELS[m]}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Summary + submit */}
          <div className="flex items-center justify-between pt-3 border-t border-border">
            <div className="text-sm">
              <span className="text-muted-foreground">Total </span>
              <span className="font-bold text-foreground">{total ? formatIDR(total) : "—"}</span>
              {nights > 0 && <span className="text-xs text-muted-foreground"> · {nights} malam</span>}
            </div>
            <button
              onClick={submit}
              disabled={!canSubmit}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {walkIn.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Check-in sekarang
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
