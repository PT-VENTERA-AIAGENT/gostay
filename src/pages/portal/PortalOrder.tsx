import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Minus, Plus, UtensilsCrossed, Loader2, ShoppingBag, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";
import PageTransition from "@/components/shared/PageTransition";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/hooks/useTenant";
import { useT } from "@/lib/i18n";
import { useMyBookings } from "@/hooks/useBookings";
import { usePortalMenu, useMyRoomServiceOrders, usePlaceRoomServiceOrder } from "@/hooks/usePortalOrder";
import { useToast } from "@/hooks/use-toast";

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);

const categoryLabels: Record<string, string> = {
  fnb: "Makanan & Minuman",
  minibar: "Minibar",
  laundry: "Laundry",
  spa: "Spa",
  other: "Lainnya",
};

const statusLabels: Record<string, { label: string; cls: string }> = {
  open: { label: "Menunggu konfirmasi", cls: "bg-warning/15 text-warning" },
  in_progress: { label: "Diproses", cls: "bg-primary/15 text-primary" },
  done: { label: "Selesai", cls: "bg-success/15 text-success" },
  cancelled: { label: "Dibatalkan", cls: "bg-muted text-muted-foreground" },
};

export default function PortalOrder() {
  const { user, signIn } = useAuth();
  const { name: hotelName } = useTenant();
  const t = useT();
  const { toast } = useToast();

  const { data: bookings = [], isLoading: loadingBookings } = useMyBookings();
  const { data: menu = [], isLoading: loadingMenu } = usePortalMenu();
  const { data: myOrders = [] } = useMyRoomServiceOrders(Boolean(user));
  const placeOrder = usePlaceRoomServiceOrder();

  const [cart, setCart] = useState<Record<string, number>>({});

  // Room service is for guests actually staying — resolve their current stay.
  const inhouse = useMemo(
    () => bookings.find((b) => b.status === "checked_in") ?? null,
    [bookings]
  );

  const grouped = useMemo(() => {
    const by: Record<string, typeof menu> = {};
    for (const p of menu) (by[p.category] ??= []).push(p);
    return by;
  }, [menu]);

  const cartLines = menu
    .filter((p) => cart[p.id] > 0)
    .map((p) => ({ product: p, qty: cart[p.id] }));
  const total = cartLines.reduce((s, l) => s + l.product.price * l.qty, 0);
  const itemCount = cartLines.reduce((s, l) => s + l.qty, 0);

  const setQty = (id: string, delta: number) =>
    setCart((c) => {
      const next = Math.max(0, (c[id] ?? 0) + delta);
      const copy = { ...c };
      if (next === 0) delete copy[id];
      else copy[id] = next;
      return copy;
    });

  const submit = async () => {
    if (!user || !inhouse || cartLines.length === 0) return;
    try {
      await placeOrder.mutateAsync({
        customer_id: inhouse.customer_id,
        booking_id: inhouse.id,
        room_id: inhouse.room_id ?? null,
        created_by: user.id,
        items: cartLines.map((l) => ({
          name: l.product.name,
          category: l.product.category,
          unit_price: l.product.price,
          quantity: l.qty,
        })),
      });
      setCart({});
      toast({
        title: "Pesanan terkirim",
        description: "Front desk akan mengantar pesananmu dan menambahkannya ke tagihan kamar.",
      });
    } catch {
      toast({ title: "Gagal mengirim pesanan", description: "Coba lagi sebentar.", variant: "destructive" });
    }
  };

  // Not signed in.
  if (!user) {
    return (
      <PageTransition>
        <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-8 space-y-4">
          <Header />
          <div className="bg-card rounded-xl border border-border p-6 md:p-8 space-y-4 text-center">
            <p className="text-sm text-muted-foreground">{t("Masuk dulu untuk memesan room service.")}</p>
            <button onClick={() => signIn("/portal/order")} className="bg-primary text-primary-foreground px-5 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity">{t("Masuk")}</button>
          </div>
        </div>
      </PageTransition>
    );
  }

  const loading = loadingBookings || loadingMenu;

  return (
    <PageTransition>
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-8 space-y-5 pb-40 md:pb-8">
        <Header />

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : !inhouse ? (
          <div className="bg-card rounded-xl border border-border p-6 md:p-8 text-center space-y-2">
            <UtensilsCrossed className="w-8 h-8 text-muted-foreground mx-auto" />
            <p className="text-sm font-medium text-foreground">{t("Room service tersedia saat kamu menginap")}</p>
            <p className="text-sm text-muted-foreground">Pesanan menu bisa dilakukan setelah check-in. Lihat status booking-mu di{" "}
              <Link to="/portal/my-account" className="text-primary hover:underline">{t("Booking Saya")}</Link>.
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Memesan untuk <span className="font-medium text-foreground">Kamar {inhouse.rooms?.number ?? "-"}</span> · {hotelName}. Pesanan ditagihkan ke folio kamar dan diantar oleh front desk.
            </p>

            {/* Menu by category */}
            <div className="space-y-6">
              {Object.entries(grouped).map(([cat, items]) => (
                <div key={cat} className="space-y-2">
                  <h2 className="text-sm font-semibold text-foreground">{t(categoryLabels[cat] ?? cat)}</h2>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {items.map((p) => (
                      <div key={p.id} className="flex items-center justify-between gap-3 bg-card rounded-xl border border-border p-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                          <p className="text-sm text-primary tabular-nums">{idr(p.price)}</p>
                        </div>
                        {cart[p.id] ? (
                          <div className="flex items-center gap-2 shrink-0">
                            <button onClick={() => setQty(p.id, -1)} className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-foreground hover:bg-muted transition-colors"><Minus className="w-4 h-4" /></button>
                            <span className="w-5 text-center text-sm font-semibold tabular-nums">{cart[p.id]}</span>
                            <button onClick={() => setQty(p.id, 1)} className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-opacity"><Plus className="w-4 h-4" /></button>
                          </div>
                        ) : (
                          <button onClick={() => setQty(p.id, 1)} className="shrink-0 flex items-center gap-1.5 text-sm font-medium border border-primary/40 text-primary bg-primary/5 px-3 py-1.5 rounded-lg hover:bg-primary/10 transition-colors">
                            <Plus className="w-4 h-4" /> {t("Tambah")}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {menu.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">{t("Menu belum tersedia.")}</p>}
            </div>

            {/* My recent orders */}
            {myOrders.length > 0 && (
              <div className="space-y-2 pt-2">
                <h2 className="text-sm font-semibold text-foreground">{t("Pesanan & permintaan kamu")}</h2>
                <div className="space-y-2">
                  {myOrders.slice(0, 5).map((o) => {
                    const st = statusLabels[o.status] ?? statusLabels.open;
                    return (
                      <div key={o.id} className="bg-card rounded-xl border border-border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-foreground">{o.title}</p>
                          <span className={cn("text-xs px-2 py-0.5 rounded-full whitespace-nowrap", st.cls)}>{t(st.label)}</span>
                        </div>
                        {o.description && <p className="text-xs text-muted-foreground whitespace-pre-line mt-1">{o.description}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Sticky cart bar */}
      {inhouse && itemCount > 0 && (
        <motion.div
          initial={{ y: 80 }}
          animate={{ y: 0 }}
          className="fixed bottom-16 md:bottom-4 left-0 right-0 px-4 z-30"
        >
          <div className="max-w-3xl mx-auto bg-card border border-border rounded-xl shadow-lg p-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <ShoppingBag className="w-4 h-4 text-primary" />
              <span className="font-medium text-foreground">{itemCount} item</span>
              <span className="text-muted-foreground">·</span>
              <span className="font-semibold text-foreground tabular-nums">{idr(total)}</span>
            </div>
            <button
              onClick={submit}
              disabled={placeOrder.isPending}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {placeOrder.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {t("Pesan & tagih ke kamar")}
            </button>
          </div>
        </motion.div>
      )}
    </PageTransition>
  );
}

function Header() {
  const t = useT();
  return (
    <div className="space-y-1">
      <Link to="/portal/my-account" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" /> {t("Kembali")}
      </Link>
      <h1 className="text-xl md:text-2xl font-bold text-foreground">{t("Room Service")}</h1>
      <p className="text-sm text-muted-foreground">{t("Pesan menu ke kamarmu — ditagihkan ke folio.")}</p>
    </div>
  );
}
