-- GoStay HMS — Guest reviews.
--
-- The portal's "What Our Guests Say" section and the staff Reviews page were
-- both showing a hardcoded array. This backs them with a real table so reviews
-- persist and accumulate a history: a guest reviews a stay they actually had,
-- everyone sees published reviews, staff sees them all.

create table if not exists reviews (
  id           uuid primary key default uuid_generate_v4(),
  customer_id  uuid not null references customers(id) on delete cascade,
  booking_id   uuid references bookings(id) on delete set null,
  rating       int not null check (rating between 1 and 5),
  comment      text,
  -- Published reviews are the ones shown publicly on the portal. New reviews
  -- default to published; staff can hide one by flipping this.
  is_published boolean not null default true,
  created_at   timestamptz not null default now()
);

create index if not exists idx_reviews_created on reviews (created_at desc);
create index if not exists idx_reviews_customer on reviews (customer_id);

alter table reviews enable row level security;

-- Anyone (including anon on the marketing portal) can read published reviews.
drop policy if exists "Anyone can read published reviews" on reviews;
create policy "Anyone can read published reviews"
  on reviews for select
  using (is_published = true);

-- Staff/admin can read every review, published or not.
drop policy if exists "Staff/admin can read all reviews" on reviews;
create policy "Staff/admin can read all reviews"
  on reviews for select
  using (get_my_role() in ('admin', 'staff'));

-- A guest may write a review only in their own name — customer_id must be one
-- of their own customer rows. rating/comment are theirs to set; is_published
-- is pinned true on insert by the trigger below so a guest cannot pre-hide or
-- pre-promote anything.
drop policy if exists "Customer can write own review" on reviews;
create policy "Customer can write own review"
  on reviews for insert
  with check (
    customer_id in (select id from customers where profile_id = auth.uid())
  );

-- Staff/admin can moderate (update is_published, or remove).
drop policy if exists "Staff/admin can moderate reviews" on reviews;
create policy "Staff/admin can moderate reviews"
  on reviews for all
  using (get_my_role() in ('admin', 'staff'))
  with check (get_my_role() in ('admin', 'staff'));

-- Freeze is_published to its default on a guest insert: only staff moderation
-- (which bypasses this via the branch below) may change it.
create or replace function guard_review_publish()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if is_privileged_context() or get_my_role() in ('admin', 'staff') then
    return new;
  end if;
  new.is_published := true;  -- guests always publish; cannot pre-hide/promote
  return new;
end;
$$;

drop trigger if exists guard_review_publish on reviews;
create trigger guard_review_publish
  before insert on reviews
  for each row execute function guard_review_publish();
