-- Platform fee: 5% → 7% (500 → 700 bps).
--
-- The fee lives in the single payment_config row (migration 030) and is read at
-- settlement time by credit_hotel_balance() (031). So a rate change is a data
-- update to that row — not a code change — and it applies to every payment
-- settled from here on. Past settlements keep the exact fee_bps they were booked
-- at (the ledger stores it per row), so history is untouched.
--
-- The UPDATE trips log_payment_config() (030), which writes the before/after to
-- payment_mode_audit — so this change is auditable like any admin toggle.

-- New installs: the column default follows the live rate.
alter table payment_config alter column platform_fee_bps set default 700;

-- Existing install: move the live rate. Attributed for the audit trail.
update payment_config
   set platform_fee_bps = 700,
       updated_by       = 'migration_036_fee_7pct'
 where id = true
   and platform_fee_bps = 500;  -- only the standard rate; never clobber a bespoke one
