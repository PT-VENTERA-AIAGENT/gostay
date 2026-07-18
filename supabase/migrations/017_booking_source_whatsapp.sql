-- ─── WhatsApp AI booking, stage 2: register the 'whatsapp' booking source ─────
--
-- Bookings created by the WhatsApp webhook (api/wa/inbound.ts) are stamped
-- source = 'whatsapp' so they are distinguishable from portal / phone / walk_in
-- / staff bookings in reporting. The booking_source enum (001_initial_schema)
-- does not yet carry that value, so a service-role INSERT with source='whatsapp'
-- would fail with invalid_input_value_for_enum until this runs.
--
-- ADD VALUE IF NOT EXISTS is idempotent and, on PostgreSQL 12+, safe outside a
-- transaction that uses the value — nothing here references it, so re-applying
-- this migration is a no-op.

alter type booking_source add value if not exists 'whatsapp';
