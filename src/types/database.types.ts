import type { SitePlan } from "@/types/floorPlan";

export type UserRole = "admin" | "staff" | "customer";
export type BookingStatus =
  | "pending"
  | "confirmed"
  | "checked_in"
  | "checked_out"
  | "cancelled"
  | "no_show";
export type BookingSource = "portal" | "phone" | "walk_in" | "staff" | "whatsapp";
export type PaymentStatus = "pending" | "partial" | "paid" | "refunded";
export type CallDirection = "inbound" | "outbound";
export type RoomStatus =
  | "available"
  | "occupied"
  | "reserved"
  | "out_of_service";
export type ChatThreadStatus = "active" | "resolved";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: ProfileInsert;
        Update: ProfileUpdate;
      };
      room_types: {
        Row: RoomType;
        Insert: RoomTypeInsert;
        Update: RoomTypeUpdate;
      };
      rooms: {
        Row: Room;
        Insert: RoomInsert;
        Update: RoomUpdate;
      };
      seasonal_pricing: {
        Row: SeasonalPricing;
        Insert: SeasonalPricingInsert;
        Update: SeasonalPricingUpdate;
      };
      availability_blocks: {
        Row: AvailabilityBlock;
        Insert: AvailabilityBlockInsert;
        Update: AvailabilityBlockUpdate;
      };
      customers: {
        Row: Customer;
        Insert: CustomerInsert;
        Update: CustomerUpdate;
      };
      bookings: {
        Row: Booking;
        Insert: BookingInsert;
        Update: BookingUpdate;
      };
      booking_audit_log: {
        Row: BookingAuditLog;
        Insert: BookingAuditLogInsert;
        Update: never;
      };
      chat_threads: {
        Row: ChatThread;
        Insert: ChatThreadInsert;
        Update: ChatThreadUpdate;
      };
      chat_messages: {
        Row: ChatMessage;
        Insert: ChatMessageInsert;
        Update: ChatMessageUpdate;
      };
      call_logs: {
        Row: CallLog;
        Insert: CallLogInsert;
        Update: CallLogUpdate;
      };
      analytics_cache: {
        Row: AnalyticsCache;
        Insert: AnalyticsCacheInsert;
        Update: AnalyticsCacheUpdate;
      };
      reviews: {
        Row: Review;
        Insert: ReviewInsert;
        Update: ReviewUpdate;
      };
      floor_plans: {
        Row: FloorPlanRow;
        Insert: FloorPlanInsert;
        Update: FloorPlanUpdate;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      user_role: UserRole;
      booking_status: BookingStatus;
      booking_source: BookingSource;
      payment_status: PaymentStatus;
      call_direction: CallDirection;
      chat_thread_status: ChatThreadStatus;
    };
  };
}

// ─── Floor plans (denah) ─────────────────────────────────────────────────────
// One editable top-down site plan per hotel; `data` is the whole canvas as JSON.
export interface FloorPlanRow {
  id: string;
  tenant_id: string;
  data: SitePlan;
  updated_at: string;
}
// tenant_id is stamped server-side (set_tenant_id trigger), so it is optional on
// insert — but the client passes it as the upsert conflict target.
export interface FloorPlanInsert {
  tenant_id?: string;
  data: SitePlan;
  updated_at?: string;
}
export type FloorPlanUpdate = Partial<FloorPlanInsert>;

// ─── Profiles ────────────────────────────────────────────────────────────────
export interface Profile {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: UserRole;
  avatar_url: string | null;
  /** Ventera SSO subject. id = uuid_v5(namespace, sso_sub). Added in 003. */
  sso_sub: string | null;
  /** Last SSO sign-in; null means never. Added in 004. */
  last_seen_at: string | null;
  /** False revokes access — get_my_role() ignores inactive users. Added in 004. */
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
export type ProfileInsert = Omit<Profile, "created_at" | "updated_at">;
export type ProfileUpdate = Partial<ProfileInsert>;

// ─── Room Types ───────────────────────────────────────────────────────────────
export interface RoomType {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  base_rate: number;
  max_occupancy: number;
  amenities: string[];
  photos: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
export type RoomTypeInsert = Omit<
  RoomType,
  "id" | "created_at" | "updated_at"
>;
export type RoomTypeUpdate = Partial<RoomTypeInsert>;

// ─── Rooms ────────────────────────────────────────────────────────────────────
export interface Room {
  id: string;
  room_type_id: string;
  number: string;
  floor: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
export type RoomInsert = Omit<Room, "id" | "created_at" | "updated_at">;
export type RoomUpdate = Partial<RoomInsert>;

// ─── Room with type (joined) ──────────────────────────────────────────────────
export interface RoomWithType extends Room {
  room_types: Pick<RoomType, "id" | "name" | "slug" | "base_rate">;
  /**
   * An array, not an object: bookings has a foreign key to rooms, so the
   * `current_booking:bookings(...)` embed in roomService.getRooms() is
   * one-to-many and PostgREST returns a list. Typing it as a single object made
   * `current_booking.status` read undefined on an array — which silently
   * reported every room as available.
   */
  current_booking?: Pick<
    Booking,
    "id" | "status" | "check_out" | "customer_id"
  >[] | null;
}

// ─── Seasonal Pricing ─────────────────────────────────────────────────────────
export interface SeasonalPricing {
  id: string;
  room_type_id: string;
  label: string;
  start_date: string;
  end_date: string;
  rate: number;
  created_at: string;
}
export type SeasonalPricingInsert = Omit<SeasonalPricing, "id" | "created_at">;
export type SeasonalPricingUpdate = Partial<SeasonalPricingInsert>;

// ─── Availability Blocks ──────────────────────────────────────────────────────
export interface AvailabilityBlock {
  id: string;
  room_id: string;
  start_date: string;
  end_date: string;
  reason: string;
  created_by: string;
  created_at: string;
}
export type AvailabilityBlockInsert = Omit<
  AvailabilityBlock,
  "id" | "created_at"
>;
export type AvailabilityBlockUpdate = Partial<AvailabilityBlockInsert>;

// ─── Customers ────────────────────────────────────────────────────────────────
export interface Customer {
  id: string;
  profile_id: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  nationality: string | null;
  created_at: string;
  updated_at: string;
}
export type CustomerInsert = Omit<Customer, "id" | "created_at" | "updated_at">;
export type CustomerUpdate = Partial<CustomerInsert>;

// ─── Bookings ─────────────────────────────────────────────────────────────────
export interface Booking {
  id: string;
  reference: string;
  customer_id: string;
  room_id: string;
  check_in: string;
  check_out: string;
  num_adults: number;
  num_children: number;
  status: BookingStatus;
  total_amount: number;
  amount_paid: number;
  payment_status: PaymentStatus;
  source: BookingSource;
  special_requests: string | null;
  internal_notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
export type BookingInsert = Omit<
  Booking,
  "id" | "reference" | "created_at" | "updated_at"
>;
export type BookingUpdate = Partial<BookingInsert>;

// Booking with relations
export interface BookingWithRelations extends Booking {
  customers: Pick<
    Customer,
    "id" | "full_name" | "email" | "phone" | "nationality"
  >;
  rooms: Room & { room_types: Pick<RoomType, "id" | "name" | "base_rate"> };
}

// ─── Booking Audit Log ────────────────────────────────────────────────────────
export interface BookingAuditLog {
  id: string;
  booking_id: string;
  action: string;
  performed_by: string;
  note: string | null;
  created_at: string;
}
export type BookingAuditLogInsert = Omit<BookingAuditLog, "id" | "created_at">;

// ─── Chat Threads ─────────────────────────────────────────────────────────────
export interface ChatThread {
  id: string;
  customer_id: string;
  booking_id: string | null;
  status: ChatThreadStatus;
  created_at: string;
  updated_at: string;
}
export type ChatThreadInsert = Omit<
  ChatThread,
  "id" | "created_at" | "updated_at"
>;
export type ChatThreadUpdate = Partial<ChatThreadInsert>;

export interface ChatThreadWithRelations extends ChatThread {
  customers: Pick<Customer, "id" | "full_name" | "email" | "phone" | "profile_id">;
  last_message?: Pick<ChatMessage, "content" | "created_at"> | null;
  unread_count?: number;
}

// ─── Chat Messages ────────────────────────────────────────────────────────────
export interface ChatMessage {
  id: string;
  thread_id: string;
  sender_id: string;
  content: string;
  attachment_url: string | null;
  is_read: boolean;
  created_at: string;
}
export type ChatMessageInsert = Omit<ChatMessage, "id" | "created_at">;
export type ChatMessageUpdate = Partial<Pick<ChatMessage, "is_read">>;

// ─── Call Logs ────────────────────────────────────────────────────────────────
export interface CallLog {
  id: string;
  caller_phone: string;
  direction: CallDirection;
  duration_seconds: number | null;
  summary: string | null;
  customer_id: string | null;
  follow_up: boolean;
  follow_up_due: string | null;
  agent_id: string;
  created_at: string;
}
export type CallLogInsert = Omit<CallLog, "id" | "created_at">;
export type CallLogUpdate = Partial<CallLogInsert>;

export interface CallLogWithRelations extends CallLog {
  customers: Pick<Customer, "id" | "full_name" | "phone"> | null;
  profiles: Pick<Profile, "id" | "full_name">;
}

// ─── Analytics Cache ──────────────────────────────────────────────────────────
export interface AnalyticsCache {
  id: string;
  date: string;
  metric_key: string;
  value: number;
  updated_at: string;
}
export type AnalyticsCacheInsert = Omit<AnalyticsCache, "id">;

// ─── Reviews ──────────────────────────────────────────────────────────────────
export interface Review {
  id: string;
  customer_id: string;
  booking_id: string | null;
  rating: number;
  comment: string | null;
  is_published: boolean;
  created_at: string;
}
export type ReviewInsert = Omit<Review, "id" | "created_at" | "is_published"> & {
  is_published?: boolean;
};
export type ReviewUpdate = Partial<Omit<Review, "id" | "created_at">>;

export interface ReviewWithCustomer extends Review {
  customers: Pick<Customer, "id" | "full_name"> | null;
}
export type AnalyticsCacheUpdate = Partial<AnalyticsCacheInsert>;
