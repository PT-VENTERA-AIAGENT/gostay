// The platform-fee split — the single source of truth for how a hotel's
// reservation income is divided between the hotel and Ventera.
//
// This mirrors, exactly, the SQL in migration 031's credit_hotel_balance()
// trigger. The trigger is what actually moves money in the balance; this TS
// copy exists so the UI can preview a split and so the maths is unit-tested.
// If you change one, change the other:
//
//   gross = amount
//   fee   = round(gross * feeBps / 10000, 2)   -- Ventera's cut (700 bps = 7%)
//   net   = gross - fee                         -- credited to the hotel
//
// net is DERIVED from fee (never rounded on its own), so gross === fee + net
// always holds — no stray cent can appear or vanish in the split.

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
export function feeSplit(amount: number, feeBps = 700): FeeSplit {
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
