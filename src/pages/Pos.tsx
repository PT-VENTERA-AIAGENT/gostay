import { useMemo, useState } from "react";
import {
  ShoppingCart, Plus, Minus, Trash2, Loader2, CreditCard, BedDouble,
  Store, Package, X, Check, Receipt, Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useT, tr } from "@/lib/i18n";
import { motion, AnimatePresence } from "framer-motion";
import PageTransition, { staggerItem } from "@/components/shared/PageTransition";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  useProducts, useAllProducts, useFolioTargets, useCreateProduct, useSetProductActive,
  useUpdateProduct, useDeleteProduct, useCreateWalkInOrder, usePostToFolio, useTodayOrders,
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
  const t = useT();
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
  const [showRecap, setShowRecap] = useState(false);

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
      toast({ title: tr("Keranjang kosong"), variant: "destructive" });
      return;
    }
    const items: PosOrderItem[] = cart.map(({ key: _key, ...rest }) => rest);

    if (mode === "walkin") {
      createWalkIn.mutate(
        { items, subtotal, payment_method: method, guest_name: guestName.trim() || null, created_by: user?.id ?? null },
        {
          onSuccess: () => {
            toast({ title: `Terjual — ${formatIDR(subtotal)} (${t(METHOD_LABELS[method])})` });
            resetAfterSale();
          },
          onError: (e) => toast({ title: tr("Gagal menyimpan penjualan"), description: (e as Error).message, variant: "destructive" }),
        },
      );
    } else {
      if (!targetBooking) {
        toast({ title: tr("Pilih booking tujuan"), variant: "destructive" });
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
            const target = folioTargets.find((x) => x.id === targetBooking);
            toast({ title: `Ditagihkan ke folio ${target?.reference ?? ""} — ${formatIDR(subtotal)}` });
            resetAfterSale();
          },
          onError: (e) => toast({ title: tr("Gagal menagih ke folio"), description: (e as Error).message, variant: "destructive" }),
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
              <Store className="w-6 h-6 text-primary" /> {t("Kasir (POS)")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t("Jual item outlet — bayar langsung atau tagihkan ke folio kamar.")}
            </p>
          </div>
          <div className="flex items-center gap-2 self-start">
            <button
              onClick={() => setShowRecap(true)}
              className="flex items-center gap-2 text-sm font-medium px-4 py-2.5 rounded-lg border border-border text-foreground hover:bg-muted transition-colors"
            >
              <Receipt className="w-4 h-4" /> {t("Rekap hari ini")}
            </button>
            <button
              onClick={() => setShowProductForm(true)}
              className="flex items-center gap-2 text-sm font-medium px-4 py-2.5 rounded-lg border border-border text-foreground hover:bg-muted transition-colors"
            >
              <Package className="w-4 h-4" /> {t("Kelola produk")}
            </button>
          </div>
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
                  {c === "all" ? t("Semua") : t(CATEGORY_LABELS[c])}
                </button>
              ))}
            </div>

            {loadingProducts ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : shownProducts.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-sm text-muted-foreground">{t("Belum ada produk. Klik Kelola produk untuk menambah.")}</p>
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
              <ShoppingCart className="w-4 h-4" /> {t("Keranjang")}
              {cart.length > 0 && (
                <span className="text-xs font-medium text-muted-foreground">({cart.length})</span>
              )}
            </h2>

            {cart.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">{t("Ketuk produk untuk menambah.")}</p>
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
              <span className="text-sm text-muted-foreground">{t("Subtotal")}</span>
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
                <CreditCard className="w-4 h-4" /> {t("Bayar langsung")}
              </button>
              <button
                onClick={() => setMode("folio")}
                className={cn(
                  "flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors",
                  mode === "folio" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                <BedDouble className="w-4 h-4" /> {t("Ke folio")}
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
                  placeholder={t("Nama tamu (opsional)")}
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
                  <option value="">{t("Pilih booking / kamar…")}</option>
                  {folioTargets.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.roomNumber ? `Kamar ${t.roomNumber} · ` : ""}{t.guestName} · {t.reference}
                    </option>
                  ))}
                </select>
                {folioTargets.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1.5">{t("Tidak ada tamu yang sedang menginap.")}</p>
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
          <ProductManager onClose={() => setShowProductForm(false)} />
        )}
        {showRecap && <DailyRecap onClose={() => setShowRecap(false)} />}
      </AnimatePresence>
    </PageTransition>
  );
}

// ─── Daily recap / cashier close ────────────────────────────────────────────────

function DailyRecap({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { data: orders = [], isLoading } = useTodayOrders();

  const total = orders.reduce((s, o) => s + Number(o.subtotal), 0);
  const byMethod = orders.reduce<Record<string, { count: number; sum: number }>>((acc, o) => {
    const m = o.payment_method;
    acc[m] = acc[m] ?? { count: 0, sum: 0 };
    acc[m].count += 1;
    acc[m].sum += Number(o.subtotal);
    return acc;
  }, {});
  const today = new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-card rounded-xl border border-border w-full max-w-md max-h-[85vh] flex flex-col"
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h2 className="font-semibold text-foreground flex items-center gap-2"><Receipt className="w-4 h-4" /> Rekap kasir</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{today}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Tutup"><X className="w-5 h-5" /></button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="p-4 space-y-4 overflow-y-auto">
            <div className="rounded-xl border border-border bg-muted/40 p-4 text-center">
              <p className="text-xs text-muted-foreground">{t("Total penjualan langsung hari ini")}</p>
              <p className="text-2xl font-bold text-foreground mt-1">{formatIDR(total)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{orders.length} transaksi</p>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">{t("Per metode bayar")}</p>
              {Object.keys(byMethod).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-3">{t("Belum ada penjualan hari ini.")}</p>
              ) : (
                <div className="space-y-1.5">
                  {(Object.keys(byMethod) as PaymentMethod[]).map((m) => (
                    <div key={m} className="flex items-center justify-between text-sm p-2 rounded-lg bg-muted">
                      <span className="text-foreground">{METHOD_LABELS[m] ?? m} <span className="text-xs text-muted-foreground">· {byMethod[m].count}×</span></span>
                      <span className="font-medium text-foreground">{formatIDR(byMethod[m].sum)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <p className="text-[11px] text-muted-foreground">
              Rekap ini hanya mencakup penjualan “Bayar langsung”. Item yang ditagihkan ke folio kamar masuk ke tagihan booking masing-masing.
            </p>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ─── Product manager (full CRUD: add, edit, activate/deactivate, delete) ────────

function ProductManager({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { toast } = useToast();
  // The manager lists ALL products, including deactivated ones, so staff can
  // re-activate or delete them — the cashier grid still shows only active items.
  const { data: products = [] } = useAllProducts();
  const createProduct = useCreateProduct();
  const setActive = useSetProductActive();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();

  const [name, setName] = useState("");
  const [category, setCategory] = useState<PosCategory>("fnb");
  const [price, setPrice] = useState("");

  // Inline edit state — which product is open, and its draft fields.
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState<PosCategory>("fnb");
  const [editPrice, setEditPrice] = useState("");

  function startEdit(p: PosProduct) {
    setEditId(p.id);
    setEditName(p.name);
    setEditCategory(p.category);
    setEditPrice(String(p.price));
  }

  function saveEdit(id: string) {
    const value = Number(editPrice);
    if (!editName.trim()) { toast({ title: tr("Nama produk wajib diisi"), variant: "destructive" }); return; }
    if (!Number.isFinite(value) || value < 0) { toast({ title: tr("Harga tidak valid"), variant: "destructive" }); return; }
    updateProduct.mutate(
      { id, input: { name: editName.trim(), category: editCategory, price: value } },
      {
        onSuccess: () => { toast({ title: tr("Produk diperbarui") }); setEditId(null); },
        onError: (e) => toast({ title: tr("Gagal memperbarui"), description: (e as Error).message, variant: "destructive" }),
      },
    );
  }

  function handleDelete(p: PosProduct) {
    if (!window.confirm(`Hapus "${p.name}" dari menu? Riwayat penjualan tidak terpengaruh.`)) return;
    deleteProduct.mutate(p.id, {
      onSuccess: () => toast({ title: tr("Produk dihapus") }),
      onError: (e) => toast({ title: tr("Gagal menghapus"), description: (e as Error).message, variant: "destructive" }),
    });
  }

  function handleCreate() {
    const value = Number(price);
    if (!name.trim()) { toast({ title: tr("Nama produk wajib diisi"), variant: "destructive" }); return; }
    if (!Number.isFinite(value) || value < 0) { toast({ title: tr("Harga tidak valid"), variant: "destructive" }); return; }
    createProduct.mutate(
      { name: name.trim(), category, price: value },
      {
        onSuccess: () => { toast({ title: tr("Produk ditambahkan") }); setName(""); setPrice(""); },
        onError: (e) => toast({ title: tr("Gagal menambah produk"), description: (e as Error).message, variant: "destructive" }),
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
          <h2 className="font-semibold text-foreground flex items-center gap-2"><Package className="w-4 h-4" /> {t("Kelola produk")}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Tutup"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 space-y-2 border-b border-border">
          <input className={inputCls} placeholder={t("Nama produk (mis. Cappuccino)")} value={name} onChange={(e) => setName(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value as PosCategory)}>
              {(Object.keys(CATEGORY_LABELS) as PosCategory[]).map((k) => (
                <option key={k} value={k}>{CATEGORY_LABELS[k]}</option>
              ))}
            </select>
            <input className={inputCls} type="number" min="0" step="1000" placeholder={t("Harga (Rp)")} value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <button
            onClick={handleCreate}
            disabled={createProduct.isPending}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {createProduct.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} {t("Tambah produk")}
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-1.5">
          {products.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">{t("Belum ada produk.")}</p>
          ) : (
            products.map((p) =>
              editId === p.id ? (
                <div key={p.id} className="space-y-2 p-2 rounded-lg bg-muted/50 border border-border">
                  <input className={inputCls} value={editName} onChange={(e) => setEditName(e.target.value)} placeholder={t("Nama produk")} />
                  <div className="grid grid-cols-2 gap-2">
                    <select className={inputCls} value={editCategory} onChange={(e) => setEditCategory(e.target.value as PosCategory)}>
                      {(Object.keys(CATEGORY_LABELS) as PosCategory[]).map((k) => (
                        <option key={k} value={k}>{CATEGORY_LABELS[k]}</option>
                      ))}
                    </select>
                    <input className={inputCls} type="number" min="0" step="1000" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} placeholder={t("Harga (Rp)")} />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => saveEdit(p.id)} disabled={updateProduct.isPending} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-60">
                      {updateProduct.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Simpan
                    </button>
                    <button onClick={() => setEditId(null)} className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted">{t("Batal")}</button>
                  </div>
                </div>
              ) : (
                <div key={p.id} className={cn("flex items-center justify-between gap-2 text-sm p-2 rounded-lg hover:bg-muted", !p.is_active && "opacity-60")}>
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{CATEGORY_LABELS[p.category]} · {formatIDR(p.price)}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setActive.mutate({ id: p.id, is_active: !p.is_active })}
                      disabled={setActive.isPending}
                      title={p.is_active ? "Nonaktifkan (sembunyikan dari kasir)" : "Aktifkan"}
                      className={cn(
                        "text-xs font-medium px-2.5 py-1 rounded-full transition-colors disabled:opacity-50",
                        p.is_active ? "bg-success/10 text-success" : "bg-secondary text-muted-foreground",
                      )}
                    >
                      {p.is_active ? "Aktif" : "Nonaktif"}
                    </button>
                    <button onClick={() => startEdit(p)} title="Edit" className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(p)} disabled={deleteProduct.isPending} title="Hapus" className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )
            )
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
