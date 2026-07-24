import { supabase } from "@/lib/supabase";

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
    .select("mode,platform_fee_bps")
    .eq("id", true)
    .maybeSingle();
  if (error) throw error;
  return {
    mode: data?.mode === "live" ? "live" : "test",
    feeBps: typeof data?.platform_fee_bps === "number" ? data.platform_fee_bps : 700,
  };
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
