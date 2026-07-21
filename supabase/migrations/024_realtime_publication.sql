-- Make the operational tables realtime. Only chat_* were in the publication, so
-- every other staff/guest surface needed a refresh or a tab-switch to update.
-- postgres_changes still enforces RLS on the socket token, so a guest only ever
-- receives changes to rows they can already read.

do $$
declare
  t text;
  wanted text[] := array[
    'bookings', 'guest_requests', 'reviews', 'pos_orders', 'pos_charges',
    'payments', 'rooms', 'call_logs', 'customers'
  ];
begin
  foreach t in array wanted loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
