-- GoStay HMS — Fields User Management actually needs
--
-- The page shows a "Status" and a "Last Login" column, but profiles had neither,
-- so both were invented in the mockup. Rather than drop the columns from the UI,
-- back them with real data: the login path in api/sso/token.ts already touches
-- the row on every sign-in, so recording when is nearly free.

-- ─── 1. Last sign-in ─────────────────────────────────────────────────────────
alter table profiles add column if not exists last_seen_at timestamptz;

comment on column profiles.last_seen_at is
  'Set by api/_lib/provision.ts on each SSO sign-in. Null means never signed in.';

-- ─── 2. Deactivation ─────────────────────────────────────────────────────────
alter table profiles add column if not exists is_active boolean not null default true;

comment on column profiles.is_active is
  'False revokes access. Enforced twice: get_my_role() below returns NULL for an '
  'inactive user, and api/sso/token.ts refuses to mint a Supabase token for one.';

-- ─── 3. Teach get_my_role() about it ─────────────────────────────────────────
-- Redefines the function from 002_rls_policies.sql. Every staff/admin policy
-- calls it, so an inactive user loses those privileges everywhere at once
-- without touching a single policy.
--
-- Deactivation is enforced in two independent places on purpose. This one covers
-- a user who was deactivated *during* a live session and still holds a valid
-- token; the check in the token exchange stops them getting a new one at all.
create or replace function get_my_role()
returns user_role language sql stable security definer as $$
  select role from profiles where id = auth.uid() and is_active
$$;

-- ─── 4. Let an admin see who is deactivated ──────────────────────────────────
-- "Staff/admin can view all profiles" (002) already covers the read, and
-- "Admin can update any profile" already covers flipping is_active. No new
-- policy is needed — but note that an admin who deactivates themselves locks
-- themselves out, since get_my_role() will then return NULL for them too.
