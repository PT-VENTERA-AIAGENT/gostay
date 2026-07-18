import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getPublishedReviews,
  getAllReviews,
  getReviewStats,
  createReview,
  getReviewForBooking,
  setReviewPublished,
} from "@/services/reviewService";
import type { ReviewInsert } from "@/types/database.types";

export const reviewKeys = {
  all: ["reviews"] as const,
  published: () => ["reviews", "published"] as const,
  stats: () => ["reviews", "stats"] as const,
  forBooking: (bookingId: string) => ["reviews", "booking", bookingId] as const,
};

export function usePublishedReviews(limit = 12) {
  return useQuery({ queryKey: reviewKeys.published(), queryFn: () => getPublishedReviews(limit) });
}

export function useAllReviews() {
  return useQuery({ queryKey: reviewKeys.all, queryFn: getAllReviews });
}

export function useReviewStats() {
  return useQuery({ queryKey: reviewKeys.stats(), queryFn: getReviewStats });
}

export function useReviewForBooking(bookingId: string) {
  return useQuery({
    queryKey: reviewKeys.forBooking(bookingId),
    queryFn: () => getReviewForBooking(bookingId),
    enabled: Boolean(bookingId),
  });
}

export function useCreateReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ReviewInsert) => createReview(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: reviewKeys.all }),
  });
}

export function useSetReviewPublished() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isPublished }: { id: string; isPublished: boolean }) =>
      setReviewPublished(id, isPublished),
    onSuccess: () => qc.invalidateQueries({ queryKey: reviewKeys.all }),
  });
}
