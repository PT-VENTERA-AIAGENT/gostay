import { useMemo, useState } from "react";
import {
  ShoppingCart, Plus, Minus, Trash2, Loader2, CreditCard, BedDouble,
  Store, Package, X, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import PageTransition, { staggerItem } from "@/components/shared/PageTransition";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  useProducts, useFolioTargets, useCreateProduct, useSetProductActive,
  useCreateWalkInOrder, usePostToFolio,
} from "@/hooks/usePos";
import type { PosProduct, PosOrderItem } from "@/services/posService";
import type { PosCategory, PaymentMethod } from "@/services/frontDeskService";

const CATEGORY_LABELS: Record<PosCategory, string> = {
  fnb: "F&B", minibar: "Minibar", laundry: "Laundry", spa: "Spa", other: "Lainnya",
};
const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Tunai", transfer: "Transfer", card: "Kartu", qris: "QRIS", other: "Lainnya",
};

function formatIDR(n: number): string {
  return "Rp" + Math.round(n).toLocaleString("id-ID");
}

interface CartLine extends PosOrderItem {
  key: string; // product id, or a synthetic key
}

type Mode = "walkin" | "folio";

export default function Pos() {
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: products = [], isLoading: loadingProducts } = useProducts();
  const { data: folioTargets = [] } = useFolioTargets();
  const createWalkIn = useCreateWalkInOrder();
  const postToFolio = usePostToFolio();

  const [cart, setCart] = useState<CartLine[]>([]);
  const [activeCat, setActiveCat] = useState<"all" | PosCategory>("all");
  const [mode, setMode] = useState<Mode>("walkin");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [guestName, setGuestName] = useState("");
  const [targetBooking, setTargetBooking] = useState("");
  const [showProductForm, setShowProductForm] = useState(false);

  const categories = useMemo(() => {
    const set = new Set<PosCategory>(products.map((p) => p.category));
    return Array.from(set);
  }, [products]);

  const shownProducts = useMemo(
    () => (activeCat === "all" ? products : products.filter((p) => p.category === activeCat)),
    [products, activeCat],
  );

  const subtotal = cart.reduce((s, l) => s + l.unit_price * l.quantity, 0);
  const busy = createWalkIn.isPending || postToFolio.isPending;

  function addToCart(p: PosProduct) {
    setCart((prev) => {
      const found = prev.find((l) => l.key === p.id);
      if (found) return prev.map((l) => (l.key === p.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [
        ...prev,
        { key: p.id, description: p.name, category: p.category, unit_price: p.price, quantity: 1 },
      ];
    });
  }

  function bumpQty(key: string, delta: number) {
    setCart((prev) =>
      prev
        .map((l) => (l.key === key ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0),
    );
  }

  function removeLine(key: string) {
    setCart((prev) => prev.filter((l) => l.key !== key));
  }

  function resetAfterSale() {
    setCart([]);
    setGuestName("");
    setTargetBooking("");
  }

  function checkout() {
    if (cart.length === 0) {
      toast({ title: "Keranjang kosong", variant: "destructive" });
      return;
    }
    const items: PosOrderItem[] = cart.map(({ key: _key, ...rest }) => rest);

    if (mode === "walkin") {
      createWalkIn.mutate(
        { items, subtotal, payment_method: method, guest_name: guestName.trim() || null, created_by: user?.id ?? null },
        {
          onSuccess: () => {
            toast({ title: `Terjual — ${formatIDR(subtotal)} (${METHOD_LABELS[method]})` });
            resetAfterSale();
          },
          onError: (e) => toast({ title: "Gagal menyimpan penjualan", description: (e as Error).message, variant: "destructive" }),
        },
      );
    } else {
      if (!targetBooking) {
        toast({ title: "Pilih booking tujuan", variant: "destructive" });
        return;
      }
      postToFolio.mutate(
        {
          bookingId: targetBooking,
          lines: items.map((it) => ({
            description: it.description, category: it.category,
            unit_price: it.unit_price, quantity: it.quantity, created_by: user?.id ?? null,
          })),
        },
        {
          onSuccess: () => {
            const t = folioTargets.find((x) => x.id === targetBooking);
            toast({ title: `Ditagihkan ke folio ${t?.reference ?? ""} — ${formatIDR(subtotal)}` });
            resetAfterSale();
          },
          onError: (e) => toast({ title: "Gagal menagih ke folio", description: (e as Error).message, variant: "destructive" }),
        },
      );
    }
  }

  return (
    <PageTransition>
      <div className="p-4 md:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 md:mb-6">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
              <Store className="w-6 h-6 text-primary" /> Kasir (POS)
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Jual item outlet — bayar langsung atau tagihkan ke folio kamar.
            </p>
          </div>
          <button
            onClick={() => setShowProductForm(true)}
            className="flex items-center gap-2 text-sm font-medium px-4 py-2.5 rounded-lg border border-border text-foreground hover:bg-muted transition-colors self-start"
          >
            <Package className="w-4 h-4" /> Kelola produk
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 md:gap-6">
          {/* ─── Catalogue ─────────────────────────────────────────── */}
          <div>
            <div className="flex items-center gap-1 border-b border-border overflow-x-auto mb-4">
              {(["all", ...categories] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setActiveCat(c)}
                  className={cn(
                    "px-3 md:px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap",
                    activeCat === c ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {c === "all" ? "Semua" : CATEGORY_LABELS[c]}
                </button>
              ))}
            </div>

            {loadingProducts ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : shownProducts.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-sm text-muted-foreground">Belum ada produk. Klik “Kelola produk” untuk menambah.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {shownProducts.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    className="text-left bg-card rounded-xl border border-border p-3 hover:border-primary/50 hover:bg-primary/5 transition-colors"
                  >
                    <p className="text-xs text-muted-foreground">{CATEGORY_LABELS[p.category]}</p>
                    <p className="text-sm font-semibold text-foreground mt-0.5 line-clamp-2">{p.name}</p>
                    <p className="text-sm font-medium text-primary mt-2">{formatIDR(p.price)}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ─── Cart / checkout ───────────────────────────────────── */}
          <div className="bg-card rounded-xl border border-border p-4 h-fit lg:sticky lg:top-4">
            <h2 className="font-semibold text-foreground flex items-center gap-2 mb-3">
              <ShoppingCart className="w-4 h-4" /> Keranjang
              {cart.length > 0 && (
                <span className="text-xs font-medium text-muted-foreground">({cart.length})</span>
              )}
            </h2>

            {cart.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Ketuk produk untuk menambah.</p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {cart.map((l) => (
                  <div key={l.key} className="flex items-center gap-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground truncate">{l.description}</p>
                      <p className="text-xs text-muted-foreground">{formatIDR(l.unit_price)}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={() => bumpQty(l.key, -1)} className="w-6 h-6 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-foreground" aria-label="Kurangi">
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-6 text-center font-medium text-foreground">{l.quantity}</span>
                      <button onClick={() => bumpQty(l.key, 1)} className="w-6 h-6 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-foreground" aria-label="Tambah">
                        <Plus className="w-3 h-3" />
                      </button>
                      <button onClick={() => removeLine(l.key)} className="text-muted-foreground hover:text-destructive ml-1" aria-label="Hapus">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-between items-center mt-3 pt-3 border-t border-border">
              <span className="text-sm text-muted-foreground">Subtotal</span>
              <span className="text-lg font-bold text-foreground">{formatIDR(subtotal)}</span>
            </div>

            {/* Settlement mode */}
            <div className="grid grid-cols-2 gap-2 mt-4">
              <button
                onClick={() => setMode("walkin")}
                className={cn(
                  "flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors",
                  mode === "walkin" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                <CreditCard className="w-4 h-4" /> Bayar langsung
              </button>
              <button
                onClick={() => setMode("folio")}
                className={cn(
                  "flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors",
                  mode === "folio" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                <BedDouble className="w-4 h-4" /> Ke folio
              </button>
            </div>

            {mode === "walkin" ? (
              <div className="mt-3 space-y-2">
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  {(Object.keys(METHOD_LABELS) as PaymentMethod[]).map((m) => (
                    <option key={m} value={m}>{METHOD_LABELS[m]}</option>
                  ))}
                </select>
                <input
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Nama tamu (opsional)"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            ) : (
              <div className="mt-3">
                <select
                  value={targetBooking}
                  onChange={(e) => setTargetBooking(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <option value="">Pilih booking / kamar…</option>
                  {folioTargets.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.roomNumber ? `Kamar ${t.roomNumber} · ` : ""}{t.guestName} · {t.reference}
                    </option>
                  ))}
                </select>
                {folioTargets.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1.5">Tidak ada tamu yang sedang menginap.</p>
                )}
              </div>
            )}

            <button
              onClick={checkout}
              disabled={busy || cart.length === 0}
              className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {mode === "walkin" ? "Selesaikan penjualan" : "Tagihkan ke folio"}
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showProductForm && (
          <ProductManager products={products} onClose={() => setShowProductForm(false)} />
        )}
      </AnimatePresence>
    </PageTransition>
  );
}

// ─── Product manager (add + activate/deactivate) ────────────────────────────────

function ProductManager({ products, onClose }: { products: PosProduct[]; onClose: () => void }) {
  const { toast } = useToast();
  const createProduct = useCreateProduct();
  const setActive = useSetProductActive();

  const [name, setName] = useState("");
  const [category, setCategory] = useState<PosCategory>("fnb");
  const [price, setPrice] = useState("");

  function handleCreate() {
    const value = Number(price);
    if (!name.trim()) { toast({ title: "Nama produk wajib diisi", variant: "destructive" }); return; }
    if (!Number.isFinite(value) || value < 0) { toast({ title: "Harga tidak valid", variant: "destructive" }); return; }
    createProduct.mutate(
      { name: name.trim(), category, price: value },
      {
        onSuccess: () => { toast({ title: "Produk ditambahkan" }); setName(""); setPrice(""); },
        onError: (e) => toast({ title: "Gagal menambah produk", description: (e as Error).message, variant: "destructive" }),
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
        className="bg-card rounded-xl border border-border w-full max-w-lg max-h-[85vh] flex flex-col"
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-semibold text-foreground flex items-center gap-2"><Package className="w-4 h-4" /> Kelola produk</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Tutup"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 space-y-2 border-b border-border">
          <input className={inputCls} placeholder="Nama produk (mis. Cappuccino)" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value as PosCategory)}>
              {(Object.keys(CATEGORY_LABELS) as PosCategory[]).map((k) => (
                <option key={k} value={k}>{CATEGORY_LABELS[k]}</option>
              ))}
            </select>
            <input className={inputCls} type="number" min="0" step="1000" placeholder="Harga (Rp)" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <button
            onClick={handleCreate}
            disabled={createProduct.isPending}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {createProduct.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Tambah produk
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-1.5">
          {products.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Belum ada produk.</p>
          ) : (
            products.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 text-sm p-2 rounded-lg hover:bg-muted">
                <div className="min-w-0">
                  <p className="font-medium text-foreground truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{CATEGORY_LABELS[p.category]} · {formatIDR(p.price)}</p>
                </div>
                <button
                  onClick={() => setActive.mutate({ id: p.id, is_active: !p.is_active })}
                  disabled={setActive.isPending}
                  className={cn(
                    "text-xs font-medium px-2.5 py-1 rounded-full transition-colors disabled:opacity-50",
                    p.is_active ? "bg-success/10 text-success" : "bg-secondary text-muted-foreground",
                  )}
                >
                  {p.is_active ? "Aktif" : "Nonaktif"}
                </button>
              </div>
            ))
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
