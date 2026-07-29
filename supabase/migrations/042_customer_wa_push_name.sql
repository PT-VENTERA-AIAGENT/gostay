-- Keep the guest's WhatsApp display name alongside the reservation name.
--
-- A WA guest's customer row is first created with their WhatsApp pushName. Then,
-- when they book, the bot records the name they actually gave for the
-- reservation ("atas nama Ridho") into customers.full_name — which is what CRM,
-- the folio, and check-in need. The side effect was that the WhatsApp identity
-- was overwritten and lost: staff saw "Ridho" in the inbox with no trace that the
-- number belongs to the "Sellora" WhatsApp account, and a number booking for
-- someone else silently took the last bookor's name.
--
-- So the pushName gets its own column. full_name stays the authoritative
-- reservation name (nothing about that changes); this is purely the WhatsApp
-- account label, shown next to it in the inbox.
alter table customers add column if not exists wa_push_name text;

comment on column customers.wa_push_name is
  'WhatsApp pushName of the number this contact writes from. Display-only: full_name remains the reservation name. Null for non-WhatsApp contacts.';
