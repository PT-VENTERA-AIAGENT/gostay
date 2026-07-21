import { supabase } from "@/lib/supabase";
import type { Review, ReviewInsert, ReviewWithCustomer } from "@/types/database.types";

export type { Review, ReviewInsert, ReviewWithCustomer };

/** Published reviews for the public portal, newest first. */
export async function getPublishedReviews(limit = 12): Promise<ReviewWithCustomer[]> {
  const { data, error } = await supabase
    .from("reviews")
    .select(`*, customers ( id, full_name )`)
    .eq("is_published", true)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data as unknown as ReviewWithCustomer[];
}

/** Every review, for staff moderation. */
export async function getAllReviews(): Promise<ReviewWithCustomer[]> {
  const { data, error } = await supabase
    .from("reviews")
    .select(`*, customers ( id, full_name )`)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as unknown as ReviewWithCustomer[];
}

/** Average rating and total count of published reviews — for portal stats. */
export async function getReviewStats(): Promise<{ average: number; count: number }> {
  const { data, error } = await supabase
    .from("reviews")
    .select("rating")
    .eq("is_published", true);
  if (error) throw error;
  const ratings = (data ?? []).map((r) => r.rating);
  const count = ratings.length;
  const average = count ? ratings.reduce((a, b) => a + b, 0) / count : 0;
  return { average, count };
}

export async function createReview(payload: ReviewInsert): Promise<Review> {
  const { data, error } = await supabase
    .from("reviews")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** The review a customer already left for a booking, if any. */
export async function getReviewForBooking(bookingId: string): Promise<Review | null> {
  const { data, error } = await supabase
    .from("reviews")
    .select("*")
    .eq("booking_id", bookingId)
    .limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

/** Staff moderation: publish or hide a review. */
export async function setReviewPublished(id: string, isPublished: boolean): Promise<void> {
  const { error } = await supabase.from("reviews").update({ is_published: isPublished }).eq("id", id);
  if (error) throw error;
}
