import { supabase } from "@/lib/supabase";
// Aturan "hotel langganan tidak dipotong" hanya ditulis sekali, di modul fee
// yang juga dicerminkan trigger DB-nya (055) — bukan disalin ulang di sini.
import { feeBpsFor, type BillingMode } from "../../api/_lib/payment/fee";

// hotel_balance / balance_ledger / payouts / payment_config are new tables that
// aren't in the generated Database type yet, so we use an untyped client cast —
// the same approach as posService.ts. RLS scopes every read to the caller's own
// hotel (admin sees all); tenant_id is stamped by a DB trigger, never passed.
const db = supabase as unknown as { from: (table: string) => any };

export interface HotelBalance {
  tenant_id: string;
  available: number;
  lifetime_gross: number;
  lifetime_fee: number;
  lifetime_net: number;
  lifetime_withdrawn: number;
  updated_at: string;
}

export interface LedgerEntry {
  id: number;
  entry_type: "reservation_income" | "payout" | "payout_reversal" | "adjustment";
  booking_id: string | null;
  payment_id: string | null;
  payout_id: string | null;
  gross_amount: number;
  fee_amount: number;
  net_amount: number;
  fee_bps: number | null;
  description: string | null;
  created_at: string;
}

export interface Payout {
  id: string;
  amount: number;
  status: "pending" | "paid" | "rejected";
  bank_name: string | null;
  bank_account: string | null;
  account_holder: string | null;
  note: string | null;
  processed_at: string | null;
  created_at: string;
}

export interface PaymentConfig {
  mode: "live" | "test";
  feeBps: number;
  /** Lingkungan untuk tagihan langganan Ventera sendiri — terpisah dari `mode` (056). */
  subscriptionMode: "live" | "test";
}

/**
 * Model tagihan hotel ini + tarif yang benar-benar berlaku baginya.
 *
 * Hotel hanya BOLEH MEMBACA ini (RLS 032/041): memilih model adalah keputusan
 * Ventera di konsol platform. Halaman Saldo memakainya untuk menerangkan angka
 * yang dilihat pemilik hotel — hotel langganan tidak boleh dibacakan cerita
 * "dipotong 7%" yang tidak pernah terjadi padanya.
 */
export interface HotelBilling {
  billingMode: BillingMode;
  /** Tarif efektif dalam bps: 0 untuk hotel langganan. */
  feeBps: number;
  subscriptionAmount: number;
  subscriptionDay: number;
  subscriptionSince: string | null;
}

export interface SubscriptionInvoice {
  id: number;
  period: string;
  amount: number;
  status: "unpaid" | "paid" | "waived";
  paid_at: string | null;
  paid_method: string | null;
  gateway_note: string | null;
}

/** The caller's own hotel balance. Null until the hotel has its first income. */
export async function getBalance(): Promise<HotelBalance | null> {
  const { data, error } = await db.from("hotel_balance").select("*").maybeSingle();
  if (error) throw error;
  return (data as HotelBalance) ?? null;
}

export async function getLedger(limit = 50): Promise<LedgerEntry[]> {
  const { data, error } = await db
    .from("balance_ledger")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as LedgerEntry[];
}

export async function getPayouts(): Promise<Payout[]> {
  const { data, error } = await db
    .from("payouts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as Payout[];
}

export async function getPaymentConfig(): Promise<PaymentConfig> {
  const { data, error } = await db
    .from("payment_config")
    .select("mode,platform_fee_bps,subscription_mode")
    .eq("id", true)
    .maybeSingle();
  if (error) throw error;
  return {
    mode: data?.mode === "live" ? "live" : "test",
    feeBps: typeof data?.platform_fee_bps === "number" ? data.platform_fee_bps : 700,
    subscriptionMode: data?.subscription_mode === "live" ? "live" : "test",
  };
}

/**
 * Model tagihan hotel yang sedang login. Tanpa baris konfigurasi → komisi
 * dengan tarif global, persis seperti yang dilakukan hotel_fee_bps() di DB.
 */
export async function getHotelBilling(): Promise<HotelBilling> {
  const [cfgRes, globalCfg] = await Promise.all([
    db.from("hotel_payment_config")
      .select("billing_mode,subscription_amount,subscription_day,subscription_since")
      .maybeSingle(),
    getPaymentConfig(),
  ]);
  if (cfgRes.error) throw cfgRes.error;
  const row = cfgRes.data as any;
  const billingMode: BillingMode = row?.billing_mode === "subscription" ? "subscription" : "commission";
  return {
    billingMode,
    feeBps: feeBpsFor(billingMode, globalCfg.feeBps),
    subscriptionAmount: Number(row?.subscription_amount ?? 0),
    subscriptionDay: Number(row?.subscription_day ?? 1),
    subscriptionSince: row?.subscription_since ?? null,
  };
}

/** Tagihan langganan hotel ini — hanya baca; yang menandai lunas Ventera. */
export async function getMySubscriptionInvoices(limit = 6): Promise<SubscriptionInvoice[]> {
  const { data, error } = await db
    .from("hotel_subscription_invoices")
    .select("id,period,amount,status,paid_at,paid_method,gateway_note")
    .order("period", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({ ...r, amount: Number(r.amount) }));
}

export interface RequestPayoutInput {
  amount: number;
  bankName: string;
  bankAccount: string;
  accountHolder: string;
  note?: string;
}

/**
 * Request a withdrawal. The DB trigger holds the funds atomically (and rejects
 * the insert if the balance is insufficient), so a failure here means either
 * "insufficient balance" or a permissions error — surfaced to the caller.
 */
export async function requestPayout(input: RequestPayoutInput): Promise<Payout> {
  const { data, error } = await db
    .from("payouts")
    .insert({
      amount: input.amount,
      bank_name: input.bankName,
      bank_account: input.bankAccount,
      account_holder: input.accountHolder,
      note: input.note ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Payout;
}
