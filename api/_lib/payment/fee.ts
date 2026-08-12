// The platform-fee split — the single source of truth for how a hotel's
// reservation income is divided between the hotel and Ventera.
//
// This mirrors, exactly, the SQL in migration 031's credit_hotel_balance()
// trigger (as amended by 055). The trigger is what actually moves money in the
// balance; this TS copy exists so the UI can preview a split and so the maths
// is unit-tested. If you change one, change the other:
//
//   gross = amount
//   fee   = round(gross * feeBps / 10000, 2)   -- Ventera's cut (700 bps = 7%)
//   net   = gross - fee                         -- credited to the hotel
//
// net is DERIVED from fee (never rounded on its own), so gross === fee + net
// always holds — no stray cent can appear or vanish in the split.
//
// Which feeBps applies is a per-hotel decision — see feeBpsFor() below.

/**
 * How Ventera charges one hotel.
 *
 * - `commission`   — a cut of every reservation payment (the default, 7%).
 * - `subscription` — no cut at all; the hotel pays a flat monthly fee to
 *   Ventera out-of-band (bank transfer), recorded in hotel_subscription_invoices.
 */
export type BillingMode = "commission" | "subscription";

/** The platform fee, in bps, that actually applies to a hotel on this model. */
export const DEFAULT_FEE_BPS = 700;

export interface FeeSplit {
  /** The full payment, as received from the guest. */
  gross: number;
  /** Ventera's platform fee. */
  fee: number;
  /** What the hotel's balance is actually credited. */
  net: number;
  /** The rate used, in basis points (700 = 7%). */
  feeBps: number;
}

/** Round to 2 decimals (rupiah cents), half-up, matching Postgres `round(x,2)`. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Split a gross payment into the hotel's net credit and Ventera's fee.
 *
 * @param amount  gross payment amount (rupiah)
 * @param feeBps  platform fee in basis points; defaults to 700 (7%)
 */
/**
 * The effective fee rate for a hotel — the TS mirror of `hotel_fee_bps()` in
 * migration 055.
 *
 * A subscription hotel is charged 0 here BY DESIGN: it has already paid Ventera
 * separately, so cutting its reservation income too would be charging twice.
 * Anything that isn't explicitly 'subscription' falls through to the commission
 * rate — an unrecognised value must never mean "free".
 *
 * @param billingMode  the hotel's model (null/undefined → commission)
 * @param globalFeeBps the platform rate from payment_config; defaults to 700 (7%)
 */
export function feeBpsFor(
  billingMode: BillingMode | string | null | undefined,
  globalFeeBps: number = DEFAULT_FEE_BPS,
): number {
  return billingMode === "subscription" ? 0 : globalFeeBps;
}

export function feeSplit(amount: number, feeBps = DEFAULT_FEE_BPS): FeeSplit {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`invalid amount: ${amount}`);
  }
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10000) {
    throw new Error(`invalid feeBps: ${feeBps}`);
  }
  const gross = round2(amount);
  const fee = round2((gross * feeBps) / 10000);
  const net = round2(gross - fee);
  return { gross, fee, net, feeBps };
}
