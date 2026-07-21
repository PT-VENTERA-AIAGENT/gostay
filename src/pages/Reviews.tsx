import { Star, EyeOff, Eye, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { motion } from "framer-motion";
import PageTransition, { staggerContainer, staggerItem } from "@/components/shared/PageTransition";
import { useAllReviews, useSetReviewPublished, useReviewStats } from "@/hooks/useReviews";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

export default function Reviews() {
  const t = useT();
  const { data: reviews = [], isLoading, error } = useAllReviews();
  const { data: stats } = useReviewStats();
  const setPublished = useSetReviewPublished();

  return (
    <PageTransition>
      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">{t("Reviews")}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {reviews.length} ulasan
              {stats && stats.count > 0 && ` · rata-rata ${stats.average.toFixed(1)}/5 dari ${stats.count} yang tampil`}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : error ? (
          <div className="p-6 text-center text-sm text-destructive">{t("Gagal memuat ulasan.")}</div>
        ) : reviews.length === 0 ? (
          <div className="bg-card rounded-xl border border-border p-10 text-center">
            <Star className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">{t("Belum ada ulasan")}</p>
            <p className="text-xs text-muted-foreground">{t("Ulasan tamu akan muncul di sini setelah mereka menilai menginap.")}</p>
          </div>
        ) : (
          <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {reviews.map((r) => (
              <motion.div key={r.id} variants={staggerItem} className={`flex flex-col h-full bg-card rounded-xl border p-4 md:p-5 ${r.is_published ? "border-border" : "border-dashed border-muted-foreground/40 opacity-70"}`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <Star key={j} className={`w-4 h-4 ${j < r.rating ? "text-warning fill-warning" : "text-muted-foreground/30"}`} />
                    ))}
                  </div>
                  {!r.is_published && <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{t("Disembunyikan")}</span>}
                </div>
                {r.comment && <p className="text-sm text-foreground leading-relaxed mb-3">"{r.comment}"</p>}
                {/* mt-auto pins the footer down so cards in a row match height
                    even when one review is much longer than another. */}
                <div className="flex items-center justify-between mt-auto pt-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">{r.customers?.full_name ?? "Tamu"}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(r.created_at)}</p>
                  </div>
                  <button
                    onClick={() => setPublished.mutate({ id: r.id, isPublished: !r.is_published })}
                    disabled={setPublished.isPending}
                    className={`text-xs font-medium flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 shrink-0 ${
                      r.is_published
                        ? "border-input text-foreground bg-card hover:bg-muted"
                        : "border-primary/40 text-primary bg-primary/10 hover:bg-primary/20"
                    }`}
                    title={r.is_published ? "Sembunyikan dari portal" : "Tampilkan di portal"}
                  >
                    {r.is_published ? <><EyeOff className="w-3.5 h-3.5" /> Sembunyikan</> : <><Eye className="w-3.5 h-3.5" /> Tampilkan</>}
                  </button>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </PageTransition>
  );
}
