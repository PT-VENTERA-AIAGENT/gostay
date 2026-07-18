import { useState } from "react";
import { Star, Loader2, CheckCircle } from "lucide-react";
import { useReviewForBooking, useCreateReview } from "@/hooks/useReviews";
import { useToast } from "@/hooks/use-toast";

interface Props {
  bookingId: string;
  customerId: string;
}

/**
 * Lets a guest rate a completed stay. Shown on their booking detail once the
 * stay is checked out; persists to the reviews table so it becomes real history
 * on the portal. If they already reviewed this booking, their rating is shown
 * read-only instead of the form.
 */
export default function BookingReviewForm({ bookingId, customerId }: Props) {
  const { data: existing, isLoading } = useReviewForBooking(bookingId);
  const create = useCreateReview();
  const { toast } = useToast();

  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (isLoading) return null;

  if (existing) {
    return (
      <div className="bg-card rounded-xl border border-border p-4 md:p-5">
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle className="w-4 h-4 text-success" />
          <h2 className="font-semibold text-foreground">Ulasan Anda</h2>
        </div>
        <div className="flex items-center gap-1 mb-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} className={`w-4 h-4 ${i < existing.rating ? "text-warning fill-warning" : "text-muted-foreground/30"}`} />
          ))}
        </div>
        {existing.comment && <p className="text-sm text-muted-foreground">"{existing.comment}"</p>}
      </div>
    );
  }

  async function submit() {
    setError(null);
    if (rating < 1) { setError("Pilih rating dulu (1–5 bintang)."); return; }
    try {
      await create.mutateAsync({ customer_id: customerId, booking_id: bookingId, rating, comment: comment.trim() || null });
      toast({ title: "Terima kasih atas ulasannya!" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengirim ulasan.");
    }
  }

  return (
    <div className="bg-card rounded-xl border border-border p-4 md:p-5">
      <h2 className="font-semibold text-foreground mb-1">Beri Ulasan</h2>
      <p className="text-sm text-muted-foreground mb-3">Bagaimana pengalaman menginap Anda?</p>
      <div className="flex items-center gap-1 mb-3">
        {Array.from({ length: 5 }).map((_, i) => {
          const v = i + 1;
          return (
            <button
              key={i}
              type="button"
              onClick={() => setRating(v)}
              onMouseEnter={() => setHover(v)}
              onMouseLeave={() => setHover(0)}
              className="p-0.5"
              aria-label={`${v} bintang`}
            >
              <Star className={`w-7 h-7 transition-colors ${v <= (hover || rating) ? "text-warning fill-warning" : "text-muted-foreground/30"}`} />
            </button>
          );
        })}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={3}
        placeholder="Ceritakan pengalaman Anda (opsional)…"
        className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
      />
      {error && <div className="mt-2 bg-destructive/10 border border-destructive/20 rounded-lg p-2.5 text-sm text-destructive">{error}</div>}
      <div className="flex justify-end mt-3">
        <button
          onClick={submit}
          disabled={create.isPending}
          className="bg-primary text-primary-foreground px-5 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-2 disabled:opacity-50"
        >
          {create.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Kirim Ulasan
        </button>
      </div>
    </div>
  );
}
