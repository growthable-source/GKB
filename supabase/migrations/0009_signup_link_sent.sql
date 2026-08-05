-- Cooldown for confirmation emails.
--
-- The funnel now sends its own mail (lib/signup/send-link.ts) instead of asking
-- Supabase to, which means Supabase's rate limiting is no longer in front of it.
-- A signup can only ever mail the address on its own row, so this is not an open
-- relay — but nothing stopped someone re-submitting the builder in a loop and
-- burying one agency in confirmation emails.

alter table signups add column link_sent_at timestamptz;
