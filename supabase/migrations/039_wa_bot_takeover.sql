-- Staff takeover: silence the bot on one conversation so a human can answer.
--
-- Every escalation so far ended with the bot saying "kami sambungkan ke staf"
-- and then carrying on replying to the guest's next message. The guest sees a
-- human promised and a robot delivered, and staff typing in the inbox are
-- talking over an assistant that will not stop. A handoff that does not actually
-- hand off is worse than none.
--
-- Modelled on Chatly's Conversation.botTakeover, with one deliberate difference:
-- an EXPIRY. Chatly's flag is cleared by hand, which means one forgotten
-- takeover silences that guest forever — and nobody notices, because the failure
-- is silence. Here a takeover lapses on its own; staff can still clear it early,
-- and can extend it by simply replying again.

alter table chat_threads
  add column if not exists bot_paused_until timestamptz;

comment on column chat_threads.bot_paused_until is
  'While in the future, the WhatsApp bot does not auto-reply on this thread — a '
  'human has taken over. Set by a handoff node, by an escalation, or by staff in '
  'the inbox. Expires on its own so a forgotten takeover cannot mute a guest '
  'permanently.';

-- The webhook checks this on every inbound message for one (tenant, customer),
-- so it must not be a sequential scan.
create index if not exists idx_chat_threads_paused
  on chat_threads (tenant_id, customer_id)
  where bot_paused_until is not null;
